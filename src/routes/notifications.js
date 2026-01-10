// src/routes/notifications.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const notificationsController = require("../controllers/notificationsController");

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 * @query   page, limit, unreadOnly (true/false)
 * @example GET /api/notifications?page=1&limit=20&unreadOnly=true
 * @returns
 * {
 *   "notifications": [
 *     {
 *       "id": "uuid",
 *       "type": "order_update",
 *       "title": "Order Shipped",
 *       "message": "Your order #12345 has been shipped",
 *       "is_read": false,
 *       "created_at": "2024-01-10T10:00:00Z",
 *       "reference_data": "ORD-12345"
 *     }
 *   ],
 *   "total": 45,
 *   "unread": 12,
 *   "pagination": {
 *     "page": 1,
 *     "limit": 20,
 *     "pages": 3
 *   }
 * }
 */
router.get("/", authenticateToken, notificationsController.getNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 * @example GET /api/notifications/unread-count
 * @returns
 * {
 *   "count": 12
 * }
 */
router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    const db = require("../config/database");
    const redis = require("../config/redis");
    const userId = req.user.id;

    // Try Redis cache first
    const cached = await redis.get(`unread_count:${userId}`);
    if (cached) {
      return res.json({ count: parseInt(cached) });
    }

    // Fallback to database
    const result = await db.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false",
      [userId]
    );

    const count = parseInt(result.rows[0].count);

    // Cache for 1 minute
    await redis.setex(`unread_count:${userId}`, 60, count.toString());

    res.json({ count });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 * @param   notificationId - UUID of notification
 * @example PUT /api/notifications/uuid-here/read
 * @returns
 * {
 *   "success": true
 * }
 */
router.put(
  "/:notificationId/read",
  authenticateToken,
  notificationsController.markAsRead
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 * @example PUT /api/notifications/read-all
 * @returns
 * {
 *   "success": true,
 *   "marked": 12
 * }
 */
router.put(
  "/read-all",
  authenticateToken,
  notificationsController.markAllAsRead
);

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete a notification
 * @access  Private
 * @param   notificationId - UUID of notification
 * @example DELETE /api/notifications/uuid-here
 * @returns
 * {
 *   "success": true
 * }
 */
router.delete(
  "/:notificationId",
  authenticateToken,
  notificationsController.deleteNotification
);

/**
 * @route   DELETE /api/notifications/clear-all
 * @desc    Delete all read notifications
 * @access  Private
 * @example DELETE /api/notifications/clear-all
 * @returns
 * {
 *   "success": true,
 *   "deleted": 25
 * }
 */
router.delete("/clear-all", authenticateToken, async (req, res) => {
  try {
    const db = require("../config/database");
    const userId = req.user.id;

    const result = await db.query(
      "DELETE FROM notifications WHERE user_id = $1 AND is_read = true RETURNING id",
      [userId]
    );

    res.json({
      success: true,
      deleted: result.rows.length,
    });
  } catch (error) {
    console.error("Clear all notifications error:", error);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get notification preferences
 * @access  Private
 * @example GET /api/notifications/preferences
 * @returns
 * {
 *   "id": "uuid",
 *   "order_updates": true,
 *   "price_drops": true,
 *   "flash_sales": true,
 *   "restock_alerts": true,
 *   "promotions": true,
 *   "push_enabled": true,
 *   "email_enabled": false
 * }
 */
router.get(
  "/preferences",
  authenticateToken,
  notificationsController.getPreferences
);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 * @body    { order_updates, price_drops, flash_sales, restock_alerts, promotions, push_enabled, email_enabled }
 * @example
 * PUT /api/notifications/preferences
 * {
 *   "order_updates": true,
 *   "price_drops": true,
 *   "flash_sales": false,
 *   "restock_alerts": true,
 *   "promotions": false,
 *   "push_enabled": true,
 *   "email_enabled": false
 * }
 * @returns Updated preferences object
 */
router.put(
  "/preferences",
  authenticateToken,
  notificationsController.updatePreferences
);

/**
 * @route   GET /api/notifications/stream
 * @desc    Server-Sent Events stream for real-time notifications
 * @access  Private
 * @example
 * const eventSource = new EventSource('/api/notifications/stream', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   if (data.type === 'unread_count') {
 *     updateBadge(data.count);
 *   } else {
 *     showNotification(data);
 *   }
 * };
 * @returns SSE stream with notification events
 */
router.get(
  "/stream",
  authenticateToken,
  notificationsController.streamNotifications
);

/**
 * @route   GET /api/notifications/types
 * @desc    Get available notification types and their descriptions
 * @access  Public
 * @example GET /api/notifications/types
 * @returns
 * {
 *   "types": [
 *     {
 *       "type": "order_update",
 *       "name": "Order Updates",
 *       "description": "Updates about your orders (shipped, delivered, etc.)",
 *       "canDisable": false
 *     },
 *     {
 *       "type": "price_drop",
 *       "name": "Price Drops",
 *       "description": "When items in your wishlist go on sale",
 *       "canDisable": true
 *     }
 *   ]
 * }
 */
router.get("/types", (req, res) => {
  res.json({
    types: [
      {
        type: "order_update",
        name: "Order Updates",
        description: "Updates about your orders (shipped, delivered, etc.)",
        icon: "📦",
        canDisable: false,
      },
      {
        type: "price_drop",
        name: "Price Drops",
        description: "When items in your wishlist go on sale",
        icon: "💰",
        canDisable: true,
      },
      {
        type: "flash_sale",
        name: "Flash Sales",
        description: "Limited-time sales on your favorite products",
        icon: "⚡",
        canDisable: true,
      },
      {
        type: "restock",
        name: "Restock Alerts",
        description: "When out-of-stock items become available",
        icon: "🔔",
        canDisable: true,
      },
      {
        type: "promotion",
        name: "Promotions",
        description: "Special offers and promotional campaigns",
        icon: "🎁",
        canDisable: true,
      },
      {
        type: "loyalty",
        name: "Loyalty Updates",
        description: "Points earned, tier upgrades, and reward redemptions",
        icon: "⭐",
        canDisable: true,
      },
      {
        type: "cart_reminder",
        name: "Cart Reminders",
        description: "Reminders about items left in your cart",
        icon: "🛒",
        canDisable: true,
      },
      {
        type: "review_request",
        name: "Review Requests",
        description: "Requests to review products you purchased",
        icon: "📝",
        canDisable: true,
      },
    ],
  });
});

/**
 * @route   POST /api/notifications/test
 * @desc    Send a test notification (development only)
 * @access  Private
 * @body    { type, title, message }
 * @example
 * POST /api/notifications/test
 * {
 *   "type": "order_update",
 *   "title": "Test Notification",
 *   "message": "This is a test notification"
 * }
 */
if (process.env.NODE_ENV !== "production") {
  router.post("/test", authenticateToken, async (req, res) => {
    try {
      const {
        type = "promotion",
        title = "Test Notification",
        message = "This is a test",
      } = req.body;

      const notification = await notificationsController.createNotification(
        req.user.id,
        type,
        title,
        message
      );

      res.json({
        success: true,
        notification,
        message: "Test notification sent",
      });
    } catch (error) {
      console.error("Send test notification error:", error);
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });
}

module.exports = router;
