const express = require("express");
const router = express.Router();
const {
  initializeBankTransfer,
  verifyBankTransfer,
  confirmBankTransfer,
  getBankTransferDetails,
} = require("../controllers//Banktransfercontroller");
const { authenticateToken } = require("../middleware/auth");

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   POST /api/payments/bank-transfer/initialize
 * @desc    Initialize bank transfer payment
 * @access  Private
 */
router.post("/initialize", initializeBankTransfer);

/**
 * @route   POST /api/payments/bank-transfer/verify
 * @desc    Verify bank transfer payment status
 * @access  Private
 */
router.post("/verify", verifyBankTransfer);

/**
 * @route   POST /api/payments/bank-transfer/confirm
 * @desc    Confirm customer has made the transfer
 * @access  Private
 */
router.post("/confirm", confirmBankTransfer);

/**
 * @route   GET /api/payments/bank-transfer/:reference
 * @desc    Get bank transfer payment details
 * @access  Private
 */
router.get("/:reference", getBankTransferDetails);

module.exports = router;
