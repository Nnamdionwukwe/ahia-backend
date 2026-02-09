// src/routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken } = require("../middleware/auth");

/**
 * User Routes
 * Mounted at /api/userRoutes
 * All routes require authentication
 */

// Profile routes
router.get("/profile", authenticateToken, userController.getProfile);
router.put("/profile", authenticateToken, userController.updateProfile);
router.delete("/account", authenticateToken, userController.deleteAccount);

// Password management
router.post(
  "/change-password",
  authenticateToken,
  userController.changePassword,
);

// Order history
router.get("/orders", authenticateToken, userController.getOrderHistory);

// Address management
router.get("/addresses", authenticateToken, userController.getAddresses);
router.post("/addresses", authenticateToken, userController.addAddress);
router.put("/addresses/:id", authenticateToken, userController.updateAddress);
router.delete(
  "/addresses/:id",
  authenticateToken,
  userController.deleteAddress,
);

// User statistics
router.get("/stats", authenticateToken, userController.getUserStats);

module.exports = router;
