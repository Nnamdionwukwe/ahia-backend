// src/routes/notifications.js - FIXED with SSE token auth
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { authenticateToken } = require("../middleware/auth");
const notificationsController = require("../controllers/notificationsController");

// Custom middleware for SSE endpoint that checks token in query param
const authenticateSSE = (req, res, next) => {
  // Check for token in query parameter (EventSource can't send headers)
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch (error) {
    console.error("SSE token verification error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
};

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get("/", authenticateToken, notificationsController.getNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
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
      [userId],
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
 */
router.put(
  "/:notificationId/read",
  authenticateToken,
  notificationsController.markAsRead,
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
  "/read-all",
  authenticateToken,
  notificationsController.markAllAsRead,
);

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete a notification
 * @access  Private
 */
router.delete(
  "/:notificationId",
  authenticateToken,
  notificationsController.deleteNotification,
);

/**
 * @route   DELETE /api/notifications/clear-all
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete("/clear-all", authenticateToken, async (req, res) => {
  try {
    const db = require("../config/database");
    const userId = req.user.id;

    const result = await db.query(
      "DELETE FROM notifications WHERE user_id = $1 AND is_read = true RETURNING id",
      [userId],
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
 */
router.get(
  "/preferences",
  authenticateToken,
  notificationsController.getPreferences,
);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put(
  "/preferences",
  authenticateToken,
  notificationsController.updatePreferences,
);

/**
 * @route   GET /api/notifications/stream
 * @desc    Server-Sent Events stream for real-time notifications
 * @access  Private (token in query param)
 * @note    EventSource doesn't support custom headers, so token must be in URL
 */
router.get(
  "/stream",
  authenticateSSE, // ✅ Use custom SSE auth middleware
  notificationsController.streamNotifications,
);

/**
 * @route   GET /api/notifications/types
 * @desc    Get available notification types
 * @access  Public
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
        message,
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
