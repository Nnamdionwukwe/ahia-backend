// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const flashSalesController = require("../controllers/flashSalesController");
const seasonalSalesController = require("../controllers/seasonalSalesController");
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
// FLASH SALES MANAGEMENT
// ========================================================

// Get all flash sales (with filters)
router.get(
  "/flash-sales",
  authenticateToken,
  requireAdmin,
  flashSalesController.getAllFlashSales,
);

// Get specific flash sale details
router.get(
  "/flash-sales/:flashSaleId",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleById,
);

// Get flash sale products
router.get(
  "/flash-sales/:flashSaleId/products",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleProducts,
);

// Get flash sale analytics
router.get(
  "/flash-sales/:flashSaleId/analytics",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleAnalytics,
);

// Create new flash sale
router.post(
  "/flash-sales",
  authenticateToken,
  requireAdmin,
  flashSalesController.createFlashSale,
);

// Update flash sale status
router.put(
  "/flash-sales/:flashSaleId/status",
  authenticateToken,
  requireAdmin,
  flashSalesController.updateFlashSaleStatus,
);

// Delete flash sale
router.delete(
  "/flash-sales/:flashSaleId",
  authenticateToken,
  requireAdmin,
  flashSalesController.deleteFlashSale,
);

// ========================================================
// SEASONAL SALES MANAGEMENT
// ========================================================

// Get all seasonal sales (with filters)
router.get(
  "/seasonal-sales",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getAllSeasonalSales,
);

// Get specific seasonal sale details
router.get(
  "/seasonal-sales/:saleId",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getSeasonalSaleById,
);

// Get seasonal sale products
router.get(
  "/seasonal-sales/:saleId/products",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getSeasonalSaleProducts,
);

// Create new seasonal sale
router.post(
  "/seasonal-sales",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.createSeasonalSale,
);

// Update seasonal sale status
router.patch(
  "/seasonal-sales/:saleId/status",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.updateSeasonalSaleStatus,
);

// Delete seasonal sale
router.delete(
  "/seasonal-sales/:saleId",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.deleteSeasonalSale,
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

// Add to your adminRoutes.js file

/**
 * @route   POST /api/admin/notifications/bulk
 * @desc    Send bulk notification to users
 * @access  Admin only
 * @body    { type, title, message, priority, targetAudience }
 */
router.post(
  "/notifications/bulk",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        type,
        title,
        message,
        priority = "normal",
        targetAudience = "all",
      } = req.body;

      if (!type || !title || !message) {
        return res.status(400).json({
          error: "Missing required fields: type, title, message",
        });
      }

      const db = require("../config/database");
      const notificationsController = require("../controllers/notificationsController");

      // Build user query based on target audience
      let userQuery = "SELECT id FROM users WHERE 1=1";
      const params = [];

      if (targetAudience === "active") {
        userQuery += " AND last_login > NOW() - INTERVAL '30 days'";
      } else if (targetAudience === "verified") {
        userQuery += " AND is_verified = true";
      } else if (targetAudience === "unverified") {
        userQuery += " AND is_verified = false";
      }
      // "all" gets everyone

      const users = await db.query(userQuery, params);
      const userIds = users.rows.map((u) => u.id);

      if (userIds.length === 0) {
        return res.json({
          success: true,
          sentCount: 0,
          message: "No users match the target audience",
        });
      }

      // Send bulk notification
      await notificationsController.sendBulkNotification(
        userIds,
        type,
        title,
        message,
        priority,
      );

      res.json({
        success: true,
        sentCount: userIds.length,
        targetAudience,
        message: `Notification sent to ${userIds.length} users`,
      });
    } catch (error) {
      console.error("Send bulk notification error:", error);
      res.status(500).json({ error: "Failed to send bulk notification" });
    }
  },
);

/**
 * @route   GET /api/admin/notifications/stats
 * @desc    Get notification statistics
 * @access  Admin only
 */
router.get(
  "/notifications/stats",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const db = require("../config/database");

      const stats = await db.query(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN is_read = true THEN 1 END) as opened,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority
      FROM notifications
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

      res.json({
        totalSent: parseInt(stats.rows[0].total_sent),
        delivered: parseInt(stats.rows[0].total_sent), // Assume all delivered
        opened: parseInt(stats.rows[0].opened),
        clicked: 0, // TODO: Implement click tracking
        highPriority: parseInt(stats.rows[0].high_priority),
      });
    } catch (error) {
      console.error("Get notification stats error:", error);
      res.status(500).json({ error: "Failed to fetch notification stats" });
    }
  },
);

module.exports = router;
