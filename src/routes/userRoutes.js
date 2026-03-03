// src/routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateUser } = require("../middleware/auth"); // fixed: was authenticateToken

// Profile routes
router.get("/profile", authenticateUser, userController.getProfile);
router.put("/profile", authenticateUser, userController.updateProfile);
router.delete("/account", authenticateUser, userController.deleteAccount);

// Password management
router.post(
  "/change-password",
  authenticateUser,
  userController.changePassword,
);

// Order history
router.get("/orders", authenticateUser, userController.getOrderHistory);

// Address management
router.get("/addresses", authenticateUser, userController.getAddresses);
router.post("/addresses", authenticateUser, userController.addAddress);
router.put("/addresses/:id", authenticateUser, userController.updateAddress);
router.delete("/addresses/:id", authenticateUser, userController.deleteAddress);

// User statistics
router.get("/stats", authenticateUser, userController.getUserStats);

module.exports = router;
