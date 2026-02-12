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

module.exports = router;
