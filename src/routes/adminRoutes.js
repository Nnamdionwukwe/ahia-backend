// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const flashSalesController = require("../controllers/flashSalesController");
const seasonalSalesController = require("../controllers/seasonalSalesController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const bankTransferController = require("../controllers/Banktransfercontroller");

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

// DELETE /api/admin/orders/clear
// Body: { status: "pending" | "cancelled" | "all" }
// Requires explicit status — refuses to run without one for safety.
router.delete(
  "/orders/clear",
  authenticateToken,
  requireAdmin,
  adminController.clearAllOrders,
);

// ========================================================
// PAYMENTS MANAGEMENT
// ========================================================
router.get("/payments", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = require("../config/database");
    const { method, status, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];

    let query = `
        SELECT p.*, u.full_name as user_name, u.email as user_email
        FROM payments p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE 1=1
      `;

    if (method) {
      params.push(method);
      query += ` AND p.payment_method = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND p.status = $${params.length}`;
    }

    query += ` ORDER BY p.created_at DESC`;
    params.push(Number(limit));
    query += ` LIMIT $${params.length}`;
    params.push(Number(offset));
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);
    return res.status(200).json({
      success: true,
      payments: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("getAllPayments error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch payments" });
  }
});

// ========================================================
// FLASH SALES MANAGEMENT
// ========================================================
router.get(
  "/flash-sales",
  authenticateToken,
  requireAdmin,
  flashSalesController.getAllFlashSales,
);

router.get(
  "/flash-sales/:flashSaleId",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleById,
);

router.get(
  "/flash-sales/:flashSaleId/products",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleProducts,
);

router.get(
  "/flash-sales/:flashSaleId/analytics",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleAnalytics,
);

router.post(
  "/flash-sales",
  authenticateToken,
  requireAdmin,
  flashSalesController.createFlashSale,
);

router.put(
  "/flash-sales/:flashSaleId/status",
  authenticateToken,
  requireAdmin,
  flashSalesController.updateFlashSaleStatus,
);

router.delete(
  "/flash-sales/:flashSaleId",
  authenticateToken,
  requireAdmin,
  flashSalesController.deleteFlashSale,
);

// ========================================================
// SEASONAL SALES MANAGEMENT
// ========================================================
router.get(
  "/seasonal-sales",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getAllSeasonalSales,
);

router.get(
  "/seasonal-sales/:saleId",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getSeasonalSaleById,
);

router.get(
  "/seasonal-sales/:saleId/products",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getSeasonalSaleProducts,
);

router.post(
  "/seasonal-sales",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.createSeasonalSale,
);

router.patch(
  "/seasonal-sales/:saleId/status",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.updateSeasonalSaleStatus,
);

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

// ========================================================
// NOTIFICATIONS
// ========================================================
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

      let userQuery = "SELECT id FROM users WHERE 1=1";
      const params = [];

      if (targetAudience === "active") {
        userQuery += " AND last_login > NOW() - INTERVAL '30 days'";
      } else if (targetAudience === "verified") {
        userQuery += " AND is_verified = true";
      } else if (targetAudience === "unverified") {
        userQuery += " AND is_verified = false";
      }

      const users = await db.query(userQuery, params);
      const userIds = users.rows.map((u) => u.id);

      if (userIds.length === 0) {
        return res.json({
          success: true,
          sentCount: 0,
          message: "No users match the target audience",
        });
      }

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
        delivered: parseInt(stats.rows[0].total_sent),
        opened: parseInt(stats.rows[0].opened),
        clicked: 0,
        highPriority: parseInt(stats.rows[0].high_priority),
      });
    } catch (error) {
      console.error("Get notification stats error:", error);
      res.status(500).json({ error: "Failed to fetch notification stats" });
    }
  },
);

// ========================================================
// BANK TRANSFER ADMIN ACTIONS
// ========================================================

// POST /api/admin/payments/bank-transfer/approve
router.post(
  "/payments/bank-transfer/approve",
  authenticateToken,
  requireAdmin,
  bankTransferController.approveBankTransfer,
);

// POST /api/admin/payments/bank-transfer/reject
router.post(
  "/payments/bank-transfer/reject",
  authenticateToken,
  requireAdmin,
  bankTransferController.rejectBankTransfer,
);

module.exports = router;
