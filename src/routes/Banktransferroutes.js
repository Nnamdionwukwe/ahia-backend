const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/auth"); // Ensure you have this
const bankTransferController = require("../controllers/Banktransfercontroller");

// 1. Initialize bank transfer (POST)
router.post(
  "/initialize",
  authenticateUser,
  bankTransferController.initializeBankTransfer,
);

// 2. Verify bank transfer (Admin or Manual Check) (POST)
router.post(
  "/verify",
  authenticateUser,
  bankTransferController.verifyBankTransfer,
);

// 3. Confirm bank transfer (POST)
router.post(
  "/confirm",
  authenticateUser,
  bankTransferController.confirmBankTransfer,
);

// 4. Get details (GET)
// FIX: Changed from verifyBankTransfer to getBankTransferDetails
router.get(
  "/:reference",
  authenticateUser,
  bankTransferController.getBankTransferDetails,
);

module.exports = router;
