const express = require("express");
const router = express.Router();
const { authenticateUser, requireRole } = require("../middleware/auth");
const bankTransferController = require("../controllers/Banktransfercontroller");

// ── Customer routes ───────────────────────────────────────────────────────────

// 1. Initialize bank transfer
router.post(
  "/initialize",
  authenticateUser,
  bankTransferController.initializeBankTransfer,
);

// 2. Confirm transfer (customer signals they've sent money)
router.post(
  "/confirm",
  authenticateUser,
  bankTransferController.confirmBankTransfer,
);

// 3. Verify / check status
router.post(
  "/verify",
  authenticateUser,
  bankTransferController.verifyBankTransfer,
);

// 4. Get details by reference  ← must come AFTER named routes
//    so "/approve" and "/reject" are not swallowed by /:reference
router.get(
  "/:reference",
  authenticateUser,
  bankTransferController.getBankTransferDetails,
);

// ── Admin-only routes ─────────────────────────────────────────────────────────

// 5. Approve — mark payment success + order processing
router.post(
  "/approve",
  authenticateUser,
  requireRole("admin"),
  bankTransferController.approveBankTransfer,
);

// 6. Reject — mark payment failed
router.post(
  "/reject",
  authenticateUser,
  requireRole("admin"),
  bankTransferController.rejectBankTransfer,
);

module.exports = router;
