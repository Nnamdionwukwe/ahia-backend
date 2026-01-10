// src/routes/fraud.js
const express = require("express");
const router = express.Router();
const { authenticateToken, requireRole } = require("../middleware/auth");
const fraudDetectionController = require("../controllers/fraudDetectionController");

// =============================================
// FRAUD CASE MANAGEMENT
// =============================================

/**
 * @route   GET /api/fraud/cases
 * @desc    Get fraud cases for manual review
 * @access  Admin/Support only
 */
router.get(
  "/cases",
  authenticateToken,
  requireRole("admin", "support"),
  fraudDetectionController.getFraudCases
);

/**
 * @route   GET /api/fraud/cases/:fraudCheckId
 * @desc    Get detailed information about a specific fraud case
 * @access  Admin/Support only
 */
router.get(
  "/cases/:fraudCheckId",
  authenticateToken,
  requireRole("admin", "support"),
  async (req, res) => {
    try {
      const { fraudCheckId } = req.params;
      const db = require("../config/database");

      // Get fraud check details with related data
      const fraudCheck = await db.query(
        `SELECT fc.*, 
                u.full_name, u.phone_number, u.created_at as user_created_at,
                u.is_verified, u.role,
                o.order_number, o.total_amount, o.status as order_status,
                o.created_at as order_created_at,
                o.shipping_address, o.billing_address
         FROM fraud_checks fc
         LEFT JOIN users u ON fc.user_id = u.id
         LEFT JOIN orders o ON fc.order_id = o.id
         WHERE fc.id = $1`,
        [fraudCheckId]
      );

      if (fraudCheck.rows.length === 0) {
        return res.status(404).json({ error: "Fraud case not found" });
      }

      const caseData = fraudCheck.rows[0];

      // Get user order history
      const userHistory = await db.query(
        `SELECT 
           COUNT(DISTINCT o.id) as total_orders,
           COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) as successful_orders,
           COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled_orders,
           AVG(o.total_amount) as average_order_value,
           MAX(o.created_at) as last_order_date
         FROM orders o
         WHERE o.user_id = $1`,
        [caseData.user_id]
      );

      // Get other fraud checks for this user
      const userFraudHistory = await db.query(
        `SELECT id, risk_score, risk_level, action_taken, created_at
         FROM fraud_checks
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [caseData.user_id]
      );

      // Get order items if order exists
      let orderItems = [];
      if (caseData.order_id) {
        const items = await db.query(
          `SELECT oi.*, p.name as product_name, p.images
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1`,
          [caseData.order_id]
        );
        orderItems = items.rows;
      }

      res.json({
        case: {
          id: caseData.id,
          user_id: caseData.user_id,
          order_id: caseData.order_id,
          risk_score: caseData.risk_score,
          risk_level: caseData.risk_level,
          risk_factors: caseData.risk_factors,
          ip_address: caseData.ip_address,
          user_agent: caseData.user_agent,
          action_taken: caseData.action_taken,
          manual_review_decision: caseData.manual_review_decision,
          manual_review_notes: caseData.manual_review_notes,
          manual_review_at: caseData.manual_review_at,
          reviewed_by: caseData.reviewed_by,
          created_at: caseData.created_at,
        },
        user: {
          full_name: caseData.full_name,
          phone_number: caseData.phone_number,
          created_at: caseData.user_created_at,
          is_verified: caseData.is_verified,
          role: caseData.role,
        },
        order: caseData.order_id
          ? {
              order_number: caseData.order_number,
              total_amount: parseFloat(caseData.total_amount),
              status: caseData.order_status,
              created_at: caseData.order_created_at,
              shipping_address: caseData.shipping_address,
              billing_address: caseData.billing_address,
              items: orderItems,
            }
          : null,
        userHistory: userHistory.rows[0],
        userFraudHistory: userFraudHistory.rows,
      });
    } catch (error) {
      console.error("Get fraud case details error:", error);
      res.status(500).json({ error: "Failed to fetch fraud case details" });
    }
  }
);

/**
 * @route   PUT /api/fraud/cases/:fraudCheckId/review
 * @desc    Manually review a fraud case
 * @access  Admin/Support only
 */
router.put(
  "/cases/:fraudCheckId/review",
  authenticateToken,
  requireRole("admin", "support"),
  fraudDetectionController.reviewFraudCase
);

/**
 * @route   POST /api/fraud/cases/:fraudCheckId/escalate
 * @desc    Escalate a fraud case to admin
 * @access  Support only
 */
router.post(
  "/cases/:fraudCheckId/escalate",
  authenticateToken,
  requireRole("admin", "support"),
  async (req, res) => {
    try {
      const { fraudCheckId } = req.params;
      const { reason } = req.body;
      const db = require("../config/database");

      if (!reason) {
        return res.status(400).json({ error: "Escalation reason required" });
      }

      const updated = await db.query(
        `UPDATE fraud_checks
         SET manual_review_notes = CONCAT(
           COALESCE(manual_review_notes, ''), 
           E'\n\n[ESCALATED by ', $2, ' at ', NOW(), ']: ', $3
         )
         WHERE id = $1
         RETURNING *`,
        [fraudCheckId, req.user.fullName, reason]
      );

      if (updated.rows.length === 0) {
        return res.status(404).json({ error: "Fraud case not found" });
      }

      // TODO: Send notification to admin team
      // const notificationsController = require('../controllers/notificationsController');
      // await notificationsController.notifyAdmins('fraud_case_escalated', fraudCheckId);

      res.json({
        success: true,
        message: "Case escalated to admin",
        case: updated.rows[0],
      });
    } catch (error) {
      console.error("Escalate fraud case error:", error);
      res.status(500).json({ error: "Failed to escalate case" });
    }
  }
);

// =============================================
// FRAUD ANALYTICS
// =============================================

/**
 * @route   GET /api/fraud/analytics
 * @desc    Get fraud detection analytics and statistics
 * @access  Admin only
 */
router.get(
  "/analytics",
  authenticateToken,
  requireRole("admin"),
  fraudDetectionController.getFraudAnalytics
);

/**
 * @route   GET /api/fraud/stats/summary
 * @desc    Get high-level fraud statistics summary
 * @access  Admin only
 */
router.get(
  "/stats/summary",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const db = require("../config/database");

      // Today's stats
      const today = await db.query(
        `SELECT 
           COUNT(*) as total_checks,
           COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) as high_risk_cases,
           COUNT(CASE WHEN action_taken = 'block' THEN 1 END) as blocked_orders,
           AVG(risk_score) as avg_risk_score
         FROM fraud_checks
         WHERE created_at > CURRENT_DATE`
      );

      // This week's stats
      const thisWeek = await db.query(
        `SELECT 
           COUNT(*) as total_checks,
           COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) as high_risk_cases,
           COUNT(CASE WHEN action_taken = 'block' THEN 1 END) as blocked_orders
         FROM fraud_checks
         WHERE created_at > CURRENT_DATE - INTERVAL '7 days'`
      );

      // Pending review count
      const pendingReview = await db.query(
        `SELECT COUNT(*) as count
         FROM fraud_checks
         WHERE manual_review_decision IS NULL 
         AND risk_level IN ('high', 'critical')`
      );

      // False positive rate (cases marked as fraud but approved)
      const falsePositives = await db.query(
        `SELECT 
           COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) as high_risk_total,
           COUNT(CASE WHEN risk_level IN ('high', 'critical') AND manual_review_decision = 'approve' THEN 1 END) as approved
         FROM fraud_checks
         WHERE manual_review_decision IS NOT NULL
         AND created_at > CURRENT_DATE - INTERVAL '30 days'`
      );

      const fpData = falsePositives.rows[0];
      const falsePositiveRate =
        fpData.high_risk_total > 0
          ? ((fpData.approved / fpData.high_risk_total) * 100).toFixed(2)
          : 0;

      res.json({
        today: {
          ...today.rows[0],
          avg_risk_score: parseFloat(today.rows[0].avg_risk_score || 0).toFixed(
            2
          ),
        },
        thisWeek: thisWeek.rows[0],
        pendingReview: parseInt(pendingReview.rows[0].count),
        falsePositiveRate: parseFloat(falsePositiveRate),
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Get fraud summary error:", error);
      res.status(500).json({ error: "Failed to fetch fraud summary" });
    }
  }
);

/**
 * @route   GET /api/fraud/stats/trends
 * @desc    Get fraud trends over time
 * @access  Admin only
 */
router.get(
  "/stats/trends",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const db = require("../config/database");

      const trends = await db.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as total_checks,
           AVG(risk_score) as avg_risk_score,
           COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk,
           COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk,
           COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk,
           COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk,
           COUNT(CASE WHEN action_taken = 'block' THEN 1 END) as blocked
         FROM fraud_checks
         WHERE created_at > NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      );

      res.json({
        period: period,
        trends: trends.rows.map((row) => ({
          ...row,
          avg_risk_score: parseFloat(row.avg_risk_score).toFixed(2),
        })),
      });
    } catch (error) {
      console.error("Get fraud trends error:", error);
      res.status(500).json({ error: "Failed to fetch fraud trends" });
    }
  }
);

// =============================================
// USER RISK PROFILES
// =============================================

/**
 * @route   GET /api/fraud/user/:userId/risk-profile
 * @desc    Get risk profile for a specific user
 * @access  Admin/Support only
 */
router.get(
  "/user/:userId/risk-profile",
  authenticateToken,
  requireRole("admin", "support"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const db = require("../config/database");

      // Get risk profile
      const profile = await db.query(
        "SELECT * FROM user_risk_profiles WHERE user_id = $1",
        [userId]
      );

      // Get recent fraud checks
      const recentChecks = await db.query(
        `SELECT id, risk_score, risk_level, action_taken, created_at
         FROM fraud_checks
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      );

      // Get user info
      const user = await db.query(
        `SELECT id, full_name, phone_number, created_at, is_verified
         FROM users
         WHERE id = $1`,
        [userId]
      );

      if (user.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        user: user.rows[0],
        riskProfile: profile.rows[0] || {
          message: "No risk profile found - user has not been checked",
        },
        recentChecks: recentChecks.rows,
      });
    } catch (error) {
      console.error("Get user risk profile error:", error);
      res.status(500).json({ error: "Failed to fetch risk profile" });
    }
  }
);

/**
 * @route   POST /api/fraud/user/:userId/whitelist
 * @desc    Add user to whitelist (trusted users)
 * @access  Admin only
 */
router.post(
  "/user/:userId/whitelist",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const db = require("../config/database");

      // Update user risk profile to mark as whitelisted
      await db.query(
        `INSERT INTO user_risk_profiles (id, user_id, current_risk_score, is_whitelisted, whitelist_reason, updated_at)
         VALUES (gen_random_uuid(), $1, 0, true, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET 
           is_whitelisted = true,
           whitelist_reason = $2,
           current_risk_score = 0,
           updated_at = NOW()`,
        [userId, reason || "Manually whitelisted by admin"]
      );

      res.json({
        success: true,
        message: "User added to whitelist",
      });
    } catch (error) {
      console.error("Whitelist user error:", error);
      res.status(500).json({ error: "Failed to whitelist user" });
    }
  }
);

/**
 * @route   DELETE /api/fraud/user/:userId/whitelist
 * @desc    Remove user from whitelist
 * @access  Admin only
 */
router.delete(
  "/user/:userId/whitelist",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const db = require("../config/database");

      await db.query(
        `UPDATE user_risk_profiles
         SET is_whitelisted = false,
             whitelist_reason = NULL,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      res.json({
        success: true,
        message: "User removed from whitelist",
      });
    } catch (error) {
      console.error("Remove whitelist error:", error);
      res.status(500).json({ error: "Failed to remove from whitelist" });
    }
  }
);

// =============================================
// FRAUD RULES MANAGEMENT
// =============================================

/**
 * @route   GET /api/fraud/rules
 * @desc    Get current fraud detection rules and thresholds
 * @access  Admin only
 */
router.get("/rules", authenticateToken, requireRole("admin"), (req, res) => {
  res.json({
    riskLevels: {
      low: { max: 30, action: "allow" },
      medium: { max: 60, action: "review" },
      high: { max: 85, action: "challenge" },
      critical: { max: 100, action: "block" },
    },
    rules: [
      {
        category: "Velocity",
        checks: [
          { name: "Orders in last hour", threshold: "5+", points: 30 },
          { name: "Failed payments", threshold: "3+", points: 25 },
          { name: "IP-based orders", threshold: "10+", points: 20 },
        ],
      },
      {
        category: "Account",
        checks: [
          { name: "Account age < 1 hour", threshold: "Yes", points: 25 },
          { name: "Account age < 24 hours", threshold: "Yes", points: 15 },
          { name: "Unverified account", threshold: "Yes", points: 10 },
        ],
      },
      {
        category: "Order Value",
        checks: [
          { name: "Order value > $5000", threshold: "Yes", points: 20 },
          { name: "Order value > $2000", threshold: "Yes", points: 10 },
          { name: "Multiple high-value items", threshold: "3+", points: 15 },
        ],
      },
      {
        category: "Address",
        checks: [
          { name: "Country mismatch", threshold: "Yes", points: 20 },
          { name: "City mismatch", threshold: "Yes", points: 10 },
          { name: "High-risk country", threshold: "Yes", points: 15 },
        ],
      },
    ],
  });
});

module.exports = router;
