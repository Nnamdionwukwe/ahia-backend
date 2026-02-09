// src/routes/payments.js
const express = require("express");
const router = express.Router();
const paystackController = require("../controllers/PaystackController");
const { authenticateToken } = require("../middleware/auth");

/**
 * Paystack Payment Routes
 * Mounted at /api/payments
 */

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * @route   POST /api/payments/webhook
 * @desc    Handle Paystack webhook events
 * @access  Public (Paystack only)
 */
router.post("/webhook", express.raw({ type: "application/json" }), (req, res) =>
  paystackController.handleWebhook(req, res),
);

/**
 * @route   GET /api/payments/public-key
 * @desc    Get Paystack public key for frontend
 * @access  Public
 */
router.get("/public-key", (req, res) =>
  paystackController.getPublicKey(req, res),
);

/**
 * @route   GET /api/payments/callback
 * @desc    Handle redirect from Paystack checkout
 * @access  Public
 */
router.get("/callback", (req, res) => {
  const { reference, trxref } = req.query;
  const ref = reference || trxref;

  // Redirect to frontend verification page
  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.VITE_API_URL?.replace("-backend", "-frontend") ||
    "http://localhost:3000";

  res.redirect(`${frontendUrl}/order-success?reference=${ref}`);
});

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

/**
 * @route   POST /api/payments/initialize
 * @desc    Initialize a new payment transaction
 * @access  Private
 */
router.post("/initialize", authenticateToken, (req, res) =>
  paystackController.initializePayment(req, res),
);

/**
 * @route   GET /api/payments/verify/:reference
 * @desc    Verify payment status
 * @access  Private
 */
router.get("/verify/:reference", authenticateToken, (req, res) =>
  paystackController.verifyPayment(req, res),
);

/**
 * @route   GET /api/payments/transactions
 * @desc    Get current user's transaction history
 * @access  Private
 */
router.get("/transactions", authenticateToken, (req, res) =>
  paystackController.getUserTransactions(req, res),
);

/**
 * @route   GET /api/payments/transaction/:reference
 * @desc    Get single transaction details
 * @access  Private
 */
router.get("/transaction/:reference", authenticateToken, (req, res) =>
  paystackController.getTransaction(req, res),
);

/**
 * @route   POST /api/payments/charge
 * @desc    Charge a saved authorization (recurring payments)
 * @access  Private
 */
router.post("/charge", authenticateToken, (req, res) =>
  paystackController.chargeAuthorization(req, res),
);

/**
 * @route   GET /api/payments/stats
 * @desc    Get payment statistics for current user
 * @access  Private
 */
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = require("../config/database");

    const stats = await db.query(
      `SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) as total_amount_paid
      FROM transactions
      WHERE user_id = $1`,
      [userId],
    );

    res.json({
      success: true,
      data: stats.rows[0],
    });
  } catch (error) {
    console.error("Error fetching payment stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment statistics",
    });
  }
});

module.exports = router;
