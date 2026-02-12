// routes/adminRoutes.js

const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

/**
 * Admin Routes
 * All routes require authentication + admin role
 */

// Get all users
router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  adminController.getAllUsers,
);

// Update user
router.put(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.updateUser,
);

// Delete user
router.delete(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.deleteUser,
);

// Get user orders (admin viewing user's orders)
router.get(
  "/users/:userId/orders",
  authenticateToken,
  requireAdmin,
  adminController.getUserOrders,
);

// Get user addresses (admin viewing user's addresses)
router.get(
  "/users/:userId/addresses",
  authenticateToken,
  requireAdmin,
  adminController.getUserAddresses,
);

// Get user stats (admin viewing user's stats)
router.get(
  "/users/:userId/stats",
  authenticateToken,
  requireAdmin,
  adminController.getUserStats,
);

module.exports = router;
