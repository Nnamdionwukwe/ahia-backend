// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// ========================================================
// USERS MANAGEMENT
// ========================================================
router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  adminController.getAllUsers,
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
router.get(
  "/users/:userId/orders",
  authenticateToken,
  requireAdmin,
  adminController.getUserOrders,
);
router.get(
  "/users/:userId/addresses",
  authenticateToken,
  requireAdmin,
  adminController.getUserAddresses,
);
router.get(
  "/users/:userId/stats",
  authenticateToken,
  requireAdmin,
  adminController.getUserStats,
);

// ========================================================
// ORDERS MANAGEMENT
// ========================================================
router.get(
  "/orders",
  authenticateToken,
  requireAdmin,
  adminController.getAllOrders,
);
router.put(
  "/orders/:orderId/status",
  authenticateToken,
  requireAdmin,
  adminController.updateOrderStatus,
);

// ========================================================
// ANALYTICS
// ========================================================
router.get(
  "/analytics/platform",
  authenticateToken,
  requireAdmin,
  adminController.getPlatformAnalytics,
);

module.exports = router;
