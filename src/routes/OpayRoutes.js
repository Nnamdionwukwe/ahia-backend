// src/routes/opay.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const opayController = require("../controllers/OPayController");

/**
 * OPay Routes
 * Protected routes require authentication
 * Webhook routes are public
 */

// Initialize OPay payment
// POST /api/payments/opay/initialize
router.post("/initialize", authenticate, opayController.initializePayment);

// Verify OPay payment
// GET /api/payments/opay/verify/:reference
router.get("/verify/:reference", authenticate, opayController.verifyPayment);

// OPay callback webhook (public route)
// POST /api/payments/opay/callback
router.post("/callback", opayController.handleCallback);

// Get OPay transaction details
// GET /api/payments/opay/transaction/:reference
router.get(
  "/transaction/:reference",
  authenticate,
  opayController.getTransaction,
);

// Get user's OPay transactions
// GET /api/payments/opay/transactions
router.get("/transactions", authenticate, opayController.getUserTransactions);

// Cancel OPay transaction
// POST /api/payments/opay/cancel/:reference
router.post(
  "/cancel/:reference",
  authenticate,
  opayController.cancelTransaction,
);

module.exports = router;
