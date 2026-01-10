// src/controllers/fraudDetectionController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Risk scoring thresholds
const RISK_LEVELS = {
  low: { max: 30, action: "allow" },
  medium: { max: 60, action: "review" },
  high: { max: 85, action: "challenge" },
  critical: { max: 100, action: "block" },
};

// Analyze order for fraud
exports.analyzeOrder = async (orderData, userId, ipAddress, userAgent) => {
  try {
    let riskScore = 0;
    const riskFactors = [];

    // 1. Velocity checks
    const velocityScore = await checkVelocity(userId, ipAddress);
    riskScore += velocityScore.score;
    riskFactors.push(...velocityScore.factors);

    // 2. User behavior analysis
    const behaviorScore = await analyzeBehavior(userId);
    riskScore += behaviorScore.score;
    riskFactors.push(...behaviorScore.factors);

    // 3. Order value analysis
    const valueScore = analyzeOrderValue(orderData);
    riskScore += valueScore.score;
    riskFactors.push(...valueScore.factors);

    // 4. Shipping/billing mismatch
    const addressScore = analyzeAddresses(orderData);
    riskScore += addressScore.score;
    riskFactors.push(...addressScore.factors);

    // 5. Device fingerprint
    const deviceScore = await analyzeDevice(userId, ipAddress, userAgent);
    riskScore += deviceScore.score;
    riskFactors.push(...deviceScore.factors);

    // 6. Payment method checks
    const paymentScore = await analyzePaymentMethod(
      orderData.paymentMethod,
      userId
    );
    riskScore += paymentScore.score;
    riskFactors.push(...paymentScore.factors);

    // Check if user is whitelisted
    const whitelist = await db.query(
      "SELECT is_whitelisted FROM user_risk_profiles WHERE user_id = $1",
      [userId]
    );

    if (whitelist.rows.length > 0 && whitelist.rows[0].is_whitelisted) {
      riskScore = Math.min(riskScore, 20); // Cap at low risk for whitelisted users
      riskFactors.push("User is whitelisted (trusted)");
    }

    // Determine risk level and action
    const riskLevel = getRiskLevel(riskScore);

    // Store fraud check record
    const fraudCheck = await db.query(
      `INSERT INTO fraud_checks
       (id, user_id, order_id, risk_score, risk_level, risk_factors,
        ip_address, user_agent, action_taken, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        uuidv4(),
        userId,
        orderData.orderId || null,
        riskScore,
        riskLevel.name,
        JSON.stringify(riskFactors),
        ipAddress,
        userAgent,
        riskLevel.action,
      ]
    );

    // Update user risk profile
    await updateUserRiskProfile(userId, riskScore);

    return {
      riskScore,
      riskLevel: riskLevel.name,
      action: riskLevel.action,
      factors: riskFactors,
      fraudCheckId: fraudCheck.rows[0].id,
    };
  } catch (error) {
    console.error("Fraud analysis error:", error);
    // Fail open - allow the order but log
    return {
      riskScore: 0,
      riskLevel: "unknown",
      action: "allow",
      factors: ["Analysis failed - defaulting to allow"],
      error: error.message,
    };
  }
};

// Velocity checks - detect abnormal activity patterns
async function checkVelocity(userId, ipAddress) {
  let score = 0;
  const factors = [];

  // Check orders in last hour
  const recentOrders = await db.query(
    `SELECT COUNT(*) as count, SUM(total_amount) as total
     FROM orders
     WHERE user_id = $1
     AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId]
  );

  const orderCount = parseInt(recentOrders.rows[0].count);
  if (orderCount >= 5) {
    score += 30;
    factors.push(`${orderCount} orders in last hour (high velocity)`);
  } else if (orderCount >= 3) {
    score += 15;
    factors.push(`${orderCount} orders in last hour (elevated velocity)`);
  }

  // Check failed payment attempts
  const failedPayments = await redis.get(`failed_payments:${userId}`);
  if (failedPayments && parseInt(failedPayments) >= 3) {
    score += 25;
    factors.push(`${failedPayments} failed payment attempts`);
  }

  // Check IP-based velocity
  const ipOrders = await redis.get(`ip_orders:${ipAddress}`);
  if (ipOrders && parseInt(ipOrders) >= 10) {
    score += 20;
    factors.push("Multiple orders from same IP");
  }

  // Check for rapid account changes
  const accountChanges = await db.query(
    `SELECT COUNT(*) as count FROM (
       SELECT created_at FROM orders WHERE user_id = $1 
       AND created_at > NOW() - INTERVAL '24 hours'
       UNION ALL
       SELECT updated_at FROM users WHERE id = $1 
       AND updated_at > NOW() - INTERVAL '24 hours'
     ) changes`,
    [userId]
  );

  if (parseInt(accountChanges.rows[0].count) >= 5) {
    score += 15;
    factors.push("Rapid account modifications");
  }

  return { score, factors };
}

// Analyze user behavior
async function analyzeBehavior(userId) {
  let score = 0;
  const factors = [];

  // Check account age
  const user = await db.query(
    `SELECT created_at, is_verified,
            EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as account_age_hours,
            (SELECT COUNT(*) FROM orders WHERE user_id = $1) as total_orders
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (user.rows.length === 0) {
    score += 30;
    factors.push("User not found");
    return { score, factors };
  }

  const userData = user.rows[0];
  const accountAgeHours = parseFloat(userData.account_age_hours);

  // New account making purchase
  if (accountAgeHours < 1) {
    score += 25;
    factors.push("Account less than 1 hour old");
  } else if (accountAgeHours < 24) {
    score += 15;
    factors.push("Account less than 24 hours old");
  }

  // Unverified account
  if (!userData.is_verified) {
    score += 10;
    factors.push("Unverified account");
  }

  // First order
  if (parseInt(userData.total_orders) === 0) {
    score += 10;
    factors.push("First order from this account");
  }

  return { score, factors };
}

// Analyze order value
function analyzeOrderValue(orderData) {
  let score = 0;
  const factors = [];

  const amount = parseFloat(orderData.totalAmount || 0);

  // Large order
  if (amount > 5000) {
    score += 20;
    factors.push(`High order value: $${amount.toFixed(2)}`);
  } else if (amount > 2000) {
    score += 10;
    factors.push(`Elevated order value: $${amount.toFixed(2)}`);
  }

  // Multiple high-value items
  if (orderData.items && Array.isArray(orderData.items)) {
    const highValueItems = orderData.items.filter(
      (item) => parseFloat(item.price) > 500
    );

    if (highValueItems.length >= 3) {
      score += 15;
      factors.push("Multiple high-value items");
    }

    // Same item quantity pattern
    const quantities = orderData.items.map((item) => item.quantity);
    const allSame = quantities.every((q) => q === quantities[0]);

    if (allSame && quantities[0] > 1 && quantities.length > 2) {
      score += 10;
      factors.push("Suspicious quantity pattern");
    }
  }

  return { score, factors };
}

// Analyze shipping/billing addresses
function analyzeAddresses(orderData) {
  let score = 0;
  const factors = [];

  const { shippingAddress, billingAddress } = orderData;

  if (!shippingAddress || !billingAddress) {
    return { score, factors };
  }

  // Address mismatch
  if (shippingAddress.country !== billingAddress.country) {
    score += 20;
    factors.push("Shipping and billing countries differ");
  } else if (shippingAddress.city !== billingAddress.city) {
    score += 10;
    factors.push("Shipping and billing cities differ");
  }

  // P.O. Box shipping
  const address1Lower = shippingAddress.address1?.toLowerCase() || "";
  if (address1Lower.includes("p.o. box") || address1Lower.includes("po box")) {
    score += 10;
    factors.push("Shipping to P.O. Box");
  }

  return { score, factors };
}

// Analyze device fingerprint
async function analyzeDevice(userId, ipAddress, userAgent) {
  let score = 0;
  const factors = [];

  // Check if device has been used before
  const deviceKey = `device:${userId}:${ipAddress}:${hashUserAgent(userAgent)}`;
  const deviceSeen = await redis.get(deviceKey);

  if (!deviceSeen) {
    score += 5;
    factors.push("New device detected");

    // Store device
    await redis.setex(deviceKey, 90 * 24 * 60 * 60, "1"); // 90 days
  }

  // Multiple users from same IP
  const ipUsers = await db.query(
    `SELECT COUNT(DISTINCT user_id) as user_count
     FROM fraud_checks
     WHERE ip_address = $1
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [ipAddress]
  );

  const userCount = parseInt(ipUsers.rows[0].user_count);
  if (userCount >= 5) {
    score += 15;
    factors.push(`Multiple users (${userCount}) from same IP`);
  }

  return { score, factors };
}

// Analyze payment method
async function analyzePaymentMethod(paymentMethod, userId) {
  let score = 0;
  const factors = [];

  if (!paymentMethod) {
    return { score, factors };
  }

  // Check if payment method is new
  const existingPayment = await db.query(
    `SELECT id FROM payment_methods
     WHERE user_id = $1
     AND last_four = $2`,
    [userId, paymentMethod.lastFour]
  );

  if (existingPayment.rows.length === 0) {
    score += 5;
    factors.push("New payment method");
  }

  return { score, factors };
}

// Helper: Determine risk level
function getRiskLevel(score) {
  if (score <= RISK_LEVELS.low.max) {
    return { name: "low", action: RISK_LEVELS.low.action };
  } else if (score <= RISK_LEVELS.medium.max) {
    return { name: "medium", action: RISK_LEVELS.medium.action };
  } else if (score <= RISK_LEVELS.high.max) {
    return { name: "high", action: RISK_LEVELS.high.action };
  } else {
    return { name: "critical", action: RISK_LEVELS.critical.action };
  }
}

// Helper: Update user risk profile
async function updateUserRiskProfile(userId, riskScore) {
  try {
    await db.query(
      `INSERT INTO user_risk_profiles (id, user_id, current_risk_score, 
                                        total_fraud_checks, last_check_at, updated_at)
       VALUES ($1, $2, $3, 1, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         current_risk_score = $3,
         total_fraud_checks = user_risk_profiles.total_fraud_checks + 1,
         last_check_at = NOW(),
         updated_at = NOW()`,
      [uuidv4(), userId, riskScore]
    );
  } catch (error) {
    console.error("Update risk profile error:", error);
  }
}

// Helper: Hash user agent for device fingerprinting
function hashUserAgent(userAgent) {
  const crypto = require("crypto");
  return crypto
    .createHash("md5")
    .update(userAgent || "")
    .digest("hex");
}

// Manual review endpoint handler
exports.reviewFraudCase = async (req, res) => {
  try {
    const { fraudCheckId } = req.params;
    const { decision, notes } = req.body;

    if (
      !decision ||
      !["approve", "decline", "request_more_info"].includes(decision)
    ) {
      return res.status(400).json({
        error:
          "Invalid decision. Must be: approve, decline, or request_more_info",
      });
    }

    const updated = await db.query(
      `UPDATE fraud_checks
       SET manual_review_decision = $1,
           manual_review_notes = $2,
           manual_review_at = NOW(),
           reviewed_by = $3
       WHERE id = $4
       RETURNING *`,
      [decision, notes, req.user.id, fraudCheckId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Fraud check not found" });
    }

    // If approved, update the associated order status
    if (decision === "approve" && updated.rows[0].order_id) {
      await db.query(
        `UPDATE orders 
         SET status = 'confirmed'
         WHERE id = $1 AND status = 'pending_review'`,
        [updated.rows[0].order_id]
      );
    }

    // If declined, cancel the order
    if (decision === "decline" && updated.rows[0].order_id) {
      await db.query(
        `UPDATE orders 
         SET status = 'cancelled'
         WHERE id = $1`,
        [updated.rows[0].order_id]
      );
    }

    res.json({ success: true, fraudCheck: updated.rows[0] });
  } catch (error) {
    console.error("Review fraud case error:", error);
    res.status(500).json({ error: "Failed to review case" });
  }
};

// Get fraud cases for review
exports.getFraudCases = async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT fc.*, u.full_name, u.phone_number, o.order_number, o.total_amount
      FROM fraud_checks fc
      LEFT JOIN users u ON fc.user_id = u.id
      LEFT JOIN orders o ON fc.order_id = o.id
      WHERE 1=1
    `;

    const params = [];

    if (status === "pending") {
      query += ` AND fc.manual_review_decision IS NULL AND fc.risk_level IN ('high', 'critical')`;
    } else {
      query += ` AND fc.manual_review_decision = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY fc.created_at DESC LIMIT $${
      params.length + 1
    } OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const cases = await db.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM fraud_checks fc
      WHERE ${
        status === "pending"
          ? "fc.manual_review_decision IS NULL AND fc.risk_level IN ('high', 'critical')"
          : `fc.manual_review_decision = '${status}'`
      }
    `;

    const total = await db.query(countQuery);

    res.json({
      cases: cases.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total.rows[0].total),
        pages: Math.ceil(total.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Get fraud cases error:", error);
    res.status(500).json({ error: "Failed to fetch fraud cases" });
  }
};

// Fraud analytics
exports.getFraudAnalytics = async (req, res) => {
  try {
    const { period = "30d" } = req.query;
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    const stats = await db.query(
      `SELECT 
         COUNT(*) as total_checks,
         COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk,
         COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk,
         COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk,
         COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk,
         COUNT(CASE WHEN action_taken = 'block' THEN 1 END) as blocked,
         AVG(risk_score) as avg_risk_score
       FROM fraud_checks
       WHERE created_at > NOW() - INTERVAL '${days} days'`
    );

    const topFactors = await db.query(
      `SELECT 
         factor,
         COUNT(*) as occurrence_count
       FROM fraud_checks,
       jsonb_array_elements_text(risk_factors) as factor
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY factor
       ORDER BY occurrence_count DESC
       LIMIT 10`
    );

    res.json({
      stats: {
        ...stats.rows[0],
        avg_risk_score: parseFloat(stats.rows[0].avg_risk_score || 0).toFixed(
          2
        ),
      },
      topRiskFactors: topFactors.rows,
    });
  } catch (error) {
    console.error("Get fraud analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

// Track failed payment
exports.trackFailedPayment = async (userId) => {
  try {
    const key = `failed_payments:${userId}`;
    const count = await redis.incr(key);
    await redis.expire(key, 3600); // Reset after 1 hour

    if (count >= 5) {
      // Lock account temporarily
      await db.query(`UPDATE users SET account_locked = true WHERE id = $1`, [
        userId,
      ]);
    }
  } catch (error) {
    console.error("Track failed payment error:", error);
  }
};

// Track IP order
exports.trackIPOrder = async (ipAddress) => {
  try {
    const key = `ip_orders:${ipAddress}`;
    await redis.incr(key);
    await redis.expire(key, 86400); // 24 hours
  } catch (error) {
    console.error("Track IP order error:", error);
  }
};

module.exports = exports;
