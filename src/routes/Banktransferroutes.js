const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/auth"); // Ensure you have this
const bankTransferController = require("../controllers/Banktransfercontroller");

// Initialize bank transfer
router.post(
  "/initialize",
  authenticateUser,
  bankTransferController.initializeBankTransfer,
);

// Verify bank transfer (Admin or Manual Check)
router.post(
  "/verify",
  authenticateUser,
  bankTransferController.verifyBankTransfer,
);

// Confirm bank transfer
router.post(
  "/confirm",
  authenticateUser,
  bankTransferController.confirmBankTransfer,
);

// Get details
router.get(
  "/:reference",
  authenticateUser,
  bankTransferController.verifyBankTransfer,
); // Reusing verify or create getDetails method

module.exports = router;
