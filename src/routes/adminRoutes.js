// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

/**
 * Admin Routes
 * Mounted at /api/admin
 * All routes require authentication + admin role
 */

// Analytics
router.get(
  "/analytics/platform",
  authenticateToken,
  requireAdmin,
  adminController.getPlatformAnalytics,
);

// User Management
router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  adminController.getAllUsers,
);

router.get(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.getUserById,
);

router.put(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.updateUser,
);

router.delete(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.deleteUser,
);

// User status management
router.patch(
  "/users/:userId/verify",
  authenticateToken,
  requireAdmin,
  adminController.verifyUser,
);

router.patch(
  "/users/:userId/role",
  authenticateToken,
  requireAdmin,
  adminController.updateUserRole,
);

module.exports = router;
