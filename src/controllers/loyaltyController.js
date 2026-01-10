// src/controllers/loyaltyController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Reward tiers configuration
const TIERS = {
  bronze: { minPoints: 0, multiplier: 1, name: "Bronze" },
  silver: { minPoints: 1000, multiplier: 1.25, name: "Silver" },
  gold: { minPoints: 5000, multiplier: 1.5, name: "Gold" },
  platinum: { minPoints: 15000, multiplier: 2, name: "Platinum" },
};

// Points earning rules
const POINTS_RULES = {
  purchase: 10, // 10 points per $1 spent
  review: 50, // 50 points for writing a review
  referral: 500, // 500 points for successful referral
  daily_login: 5, // 5 points for daily login
  social_share: 20, // 20 points for sharing
  birthday_bonus: 200, // 200 points on birthday
};

// Get user's loyalty account
exports.getLoyaltyAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check cache first
    const cacheKey = `loyalty:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    let account = await db.query(
      `SELECT * FROM loyalty_accounts WHERE user_id = $1`,
      [userId]
    );

    // Create account if doesn't exist
    if (account.rows.length === 0) {
      account = await db.query(
        `INSERT INTO loyalty_accounts 
         (id, user_id, points_balance, lifetime_points, tier, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 'bronze', NOW(), NOW())
         RETURNING *`,
        [uuidv4(), userId]
      );
    }

    const acct = account.rows[0];
    const tier = calculateTier(acct.lifetime_points);

    // Get points expiring soon
    const expiringSoon = await db.query(
      `SELECT SUM(points_amount - points_used) as expiring_points
       FROM loyalty_transactions
       WHERE user_id = $1
       AND transaction_type = 'earn'
       AND points_used < points_amount
       AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
      [userId]
    );

    // Get available rewards
    const availableRewards = await getAvailableRewards(acct.points_balance);

    const result = {
      account: {
        ...acct,
        tier: tier.name,
        tierMultiplier: tier.multiplier,
        nextTier: getNextTier(tier.name),
        pointsToNextTier: getPointsToNextTier(acct.lifetime_points),
      },
      expiringPoints: parseInt(expiringSoon.rows[0]?.expiring_points || 0),
      availableRewards: availableRewards.rows,
    };

    // Cache for 5 minutes
    await redis.setEx(cacheKey, 300, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get loyalty account error:", error);
    res.status(500).json({ error: "Failed to fetch loyalty account" });
  }
};

// Get transaction history
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT lt.*, o.order_number, r.id as reward_id, r.title as reward_title
      FROM loyalty_transactions lt
      LEFT JOIN orders o ON lt.reference_id = o.id AND lt.transaction_type = 'earn'
      LEFT JOIN loyalty_rewards r ON lt.reference_id = r.id AND lt.transaction_type = 'redeem'
      WHERE lt.user_id = $1
    `;

    const params = [userId];

    if (type) {
      query += ` AND lt.transaction_type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY lt.created_at DESC LIMIT $${
      params.length + 1
    } OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const transactions = await db.query(query, params);

    const total = await db.query(
      `SELECT COUNT(*) FROM loyalty_transactions WHERE user_id = $1${
        type ? " AND transaction_type = $2" : ""
      }`,
      type ? [userId, type] : [userId]
    );

    res.json({
      transactions: transactions.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total.rows[0].count),
        pages: Math.ceil(total.rows[0].count / limit),
      },
    });
  } catch (error) {
    console.error("Get transaction history error:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
};

// Award points (internal use)
exports.awardPoints = async (userId, amount, reason, referenceId = null) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    // Get or create user's loyalty account
    let account = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id = $1 FOR UPDATE",
      [userId]
    );

    if (account.rows.length === 0) {
      // Create account
      account = await client.query(
        `INSERT INTO loyalty_accounts 
         (id, user_id, points_balance, lifetime_points, tier, created_at, updated_at)
         VALUES ($1, $2, 0, 0, 'bronze', NOW(), NOW())
         RETURNING *`,
        [uuidv4(), userId]
      );
    }

    const accountData = account.rows[0];
    const tier = calculateTier(accountData.lifetime_points);
    const multipliedPoints = Math.floor(amount * tier.multiplier);

    // Create transaction
    const transaction = await client.query(
      `INSERT INTO loyalty_transactions
       (id, user_id, transaction_type, points_amount, description, 
        reference_id, expiry_date, created_at)
       VALUES ($1, $2, 'earn', $3, $4, $5, NOW() + INTERVAL '1 year', NOW())
       RETURNING *`,
      [uuidv4(), userId, multipliedPoints, reason, referenceId]
    );

    // Update account balance
    await client.query(
      `UPDATE loyalty_accounts
       SET points_balance = points_balance + $1,
           lifetime_points = lifetime_points + $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [multipliedPoints, userId]
    );

    // Check for tier upgrade
    const newAccount = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id = $1",
      [userId]
    );

    const newTier = calculateTier(newAccount.rows[0].lifetime_points);

    if (newTier.name !== accountData.tier) {
      await client.query(
        "UPDATE loyalty_accounts SET tier = $1 WHERE user_id = $2",
        [newTier.name.toLowerCase(), userId]
      );

      // Send tier upgrade notification
      try {
        const notificationsController = require("./notificationsController");
        await notificationsController.createNotification(
          userId,
          "loyalty",
          `Congratulations! You're now ${newTier.name}! 🎉`,
          `You've been upgraded to ${newTier.name} tier with ${newTier.multiplier}x points multiplier.`
        );
      } catch (notifError) {
        console.error("Failed to send tier upgrade notification:", notifError);
        // Don't fail the transaction if notification fails
      }
    }

    await client.query("COMMIT");

    // Clear cache
    await redis.del(`loyalty:${userId}`);

    return transaction.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Award points error:", error);
    throw error;
  } finally {
    client.release();
  }
};

// Redeem reward
exports.redeemReward = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { rewardId } = req.params;

    // Get reward details
    const reward = await client.query(
      `SELECT * FROM loyalty_rewards 
       WHERE id = $1 AND is_active = true`,
      [rewardId]
    );

    if (reward.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Reward not found or inactive" });
    }

    const rewardData = reward.rows[0];

    // Check if user has enough points
    const account = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id = $1 FOR UPDATE",
      [userId]
    );

    if (account.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Loyalty account not found" });
    }

    if (account.rows[0].points_balance < rewardData.points_cost) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Insufficient points",
        required: rewardData.points_cost,
        available: account.rows[0].points_balance,
      });
    }

    // Check stock if limited
    if (rewardData.stock_quantity !== null && rewardData.stock_quantity <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Reward out of stock" });
    }

    // Deduct points using FIFO (oldest points first)
    let pointsToDeduct = rewardData.points_cost;
    const earnedPoints = await client.query(
      `SELECT * FROM loyalty_transactions
       WHERE user_id = $1
       AND transaction_type = 'earn'
       AND points_used < points_amount
       AND (expiry_date IS NULL OR expiry_date > NOW())
       ORDER BY created_at ASC
       FOR UPDATE`,
      [userId]
    );

    for (const transaction of earnedPoints.rows) {
      if (pointsToDeduct <= 0) break;

      const availablePoints =
        transaction.points_amount - transaction.points_used;
      const pointsToUse = Math.min(availablePoints, pointsToDeduct);

      await client.query(
        `UPDATE loyalty_transactions
         SET points_used = points_used + $1
         WHERE id = $2`,
        [pointsToUse, transaction.id]
      );

      pointsToDeduct -= pointsToUse;
    }

    // Create redemption transaction
    const redemption = await client.query(
      `INSERT INTO loyalty_transactions
       (id, user_id, transaction_type, points_amount, description, 
        reference_id, created_at)
       VALUES ($1, $2, 'redeem', $3, $4, $5, NOW())
       RETURNING *`,
      [
        uuidv4(),
        userId,
        -rewardData.points_cost,
        `Redeemed: ${rewardData.title}`,
        rewardId,
      ]
    );

    // Update account balance
    await client.query(
      `UPDATE loyalty_accounts
       SET points_balance = points_balance - $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [rewardData.points_cost, userId]
    );

    // Create user reward (voucher/coupon)
    const userReward = await client.query(
      `INSERT INTO user_rewards
       (id, user_id, reward_id, code, status, valid_until, created_at)
       VALUES ($1, $2, $3, $4, 'active', NOW() + INTERVAL '30 days', NOW())
       RETURNING *`,
      [uuidv4(), userId, rewardId, generateRewardCode()]
    );

    // Update reward stock
    if (rewardData.stock_quantity !== null) {
      await client.query(
        `UPDATE loyalty_rewards
         SET stock_quantity = stock_quantity - 1,
             times_redeemed = times_redeemed + 1
         WHERE id = $1`,
        [rewardId]
      );
    } else {
      await client.query(
        `UPDATE loyalty_rewards
         SET times_redeemed = times_redeemed + 1
         WHERE id = $1`,
        [rewardId]
      );
    }

    await client.query("COMMIT");

    // Clear cache
    await redis.del(`loyalty:${userId}`);

    res.json({
      success: true,
      redemption: redemption.rows[0],
      userReward: userReward.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Redeem reward error:", error);
    res.status(500).json({ error: "Failed to redeem reward" });
  } finally {
    client.release();
  }
};

// Get available rewards
exports.getAvailableRewards = async (req, res) => {
  try {
    const userId = req.user.id;

    const account = await db.query(
      "SELECT points_balance FROM loyalty_accounts WHERE user_id = $1",
      [userId]
    );

    const pointsBalance = account.rows[0]?.points_balance || 0;

    const rewards = await getAvailableRewards(pointsBalance);

    res.json({ rewards: rewards.rows });
  } catch (error) {
    console.error("Get available rewards error:", error);
    res.status(500).json({ error: "Failed to fetch rewards" });
  }
};

// Get user's redeemed rewards
exports.getUserRewards = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status = "active" } = req.query;

    const rewards = await db.query(
      `SELECT ur.*, lr.title, lr.description, lr.reward_type, lr.value
       FROM user_rewards ur
       JOIN loyalty_rewards lr ON ur.reward_id = lr.id
       WHERE ur.user_id = $1
       AND ur.status = $2
       ORDER BY ur.created_at DESC`,
      [userId, status]
    );

    res.json({ rewards: rewards.rows });
  } catch (error) {
    console.error("Get user rewards error:", error);
    res.status(500).json({ error: "Failed to fetch user rewards" });
  }
};

// Apply reward to order
exports.applyRewardToOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, orderId } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Reward code required" });
    }

    // Validate reward code
    const reward = await db.query(
      `SELECT ur.*, lr.reward_type, lr.value
       FROM user_rewards ur
       JOIN loyalty_rewards lr ON ur.reward_id = lr.id
       WHERE ur.code = $1
       AND ur.user_id = $2
       AND ur.status = 'active'
       AND ur.valid_until > NOW()`,
      [code, userId]
    );

    if (reward.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reward code" });
    }

    const rewardData = reward.rows[0];

    // Mark as used
    await db.query(
      `UPDATE user_rewards
       SET status = 'used', used_at = NOW()
       WHERE id = $1`,
      [rewardData.id]
    );

    // Calculate discount
    let discount = {};
    if (rewardData.reward_type === "discount_percentage") {
      discount = { type: "percentage", value: rewardData.value };
    } else if (rewardData.reward_type === "discount_fixed") {
      discount = { type: "fixed", value: rewardData.value };
    } else if (rewardData.reward_type === "free_shipping") {
      discount = { type: "free_shipping" };
    }

    res.json({
      success: true,
      discount,
      code: rewardData.code,
    });
  } catch (error) {
    console.error("Apply reward error:", error);
    res.status(500).json({ error: "Failed to apply reward" });
  }
};

// Generate referral code
exports.generateReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user already has a code
    let referral = await db.query(
      "SELECT * FROM referral_codes WHERE user_id = $1",
      [userId]
    );

    if (referral.rows.length === 0) {
      const code = generateReferralCode(userId);

      referral = await db.query(
        `INSERT INTO referral_codes
         (id, user_id, code, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING *`,
        [uuidv4(), userId, code]
      );
    }

    res.json({ referralCode: referral.rows[0] });
  } catch (error) {
    console.error("Generate referral code error:", error);
    res.status(500).json({ error: "Failed to generate referral code" });
  }
};

// Track referral signup
exports.trackReferral = async (referralCode, newUserId) => {
  try {
    const referrer = await db.query(
      "SELECT user_id FROM referral_codes WHERE code = $1",
      [referralCode]
    );

    if (referrer.rows.length === 0) return;

    const referrerId = referrer.rows[0].user_id;

    // Create referral record
    await db.query(
      `INSERT INTO referrals
       (id, referrer_id, referred_user_id, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [uuidv4(), referrerId, newUserId]
    );

    // Award points when referred user makes first purchase (handled in order controller)
  } catch (error) {
    console.error("Track referral error:", error);
  }
};

// Helper functions
function calculateTier(lifetimePoints) {
  if (lifetimePoints >= TIERS.platinum.minPoints) return TIERS.platinum;
  if (lifetimePoints >= TIERS.gold.minPoints) return TIERS.gold;
  if (lifetimePoints >= TIERS.silver.minPoints) return TIERS.silver;
  return TIERS.bronze;
}

function getNextTier(currentTier) {
  const tiers = ["bronze", "silver", "gold", "platinum"];
  const currentIndex = tiers.indexOf(currentTier.toLowerCase());
  return currentIndex < tiers.length - 1
    ? TIERS[tiers[currentIndex + 1]].name
    : null;
}

function getPointsToNextTier(lifetimePoints) {
  const tier = calculateTier(lifetimePoints);
  const nextTier = getNextTier(tier.name);

  if (!nextTier) return 0;

  const nextTierKey = nextTier.toLowerCase();
  return TIERS[nextTierKey].minPoints - lifetimePoints;
}

async function getAvailableRewards(pointsBalance) {
  return await db.query(
    `SELECT *,
            CASE WHEN points_cost <= $1 THEN true ELSE false END as can_afford
     FROM loyalty_rewards
     WHERE is_active = true
     AND (stock_quantity > 0 OR stock_quantity IS NULL)
     ORDER BY points_cost ASC`,
    [pointsBalance]
  );
}

function generateRewardCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateReferralCode(userId) {
  return `REF${userId.substring(0, 6).toUpperCase()}`;
}

// Export constants for use in routes
module.exports = exports;
module.exports.POINTS_RULES = POINTS_RULES;
module.exports.TIERS = TIERS;
