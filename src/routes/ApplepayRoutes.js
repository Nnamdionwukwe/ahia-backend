// src/routes/applePay.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const applePayController = require("../controllers/Applepaycontroller");

/**
 * Apple Pay Routes
 * All routes require authentication
 */

// Create Apple Pay merchant session
// POST /api/payments/apple-pay/session
router.post("/session", authenticate, applePayController.createSession);

// Initialize Apple Pay payment
// POST /api/payments/apple-pay/initialize
router.post("/initialize", authenticate, applePayController.initializePayment);

// Process Apple Pay payment token
// POST /api/payments/apple-pay/process
router.post("/process", authenticate, applePayController.processPayment);

// Verify Apple Pay payment
// GET /api/payments/apple-pay/verify/:reference
router.get(
  "/verify/:reference",
  authenticate,
  applePayController.verifyPayment,
);

// Get Apple Pay transaction details
// GET /api/payments/apple-pay/transaction/:reference
router.get(
  "/transaction/:reference",
  authenticate,
  applePayController.getTransaction,
);

module.exports = router;
