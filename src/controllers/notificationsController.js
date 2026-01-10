// src/controllers/notificationsController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Get user notifications
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT n.*, 
             CASE 
               WHEN n.type = 'order_update' THEN o.order_number
               WHEN n.type = 'price_drop' THEN p.name
             END as reference_data
      FROM notifications n
      LEFT JOIN orders o ON n.reference_id = o.id AND n.type = 'order_update'
      LEFT JOIN products p ON n.reference_id = p.id AND n.type = 'price_drop'
      WHERE n.user_id = $1
    `;

    const params = [userId];

    if (unreadOnly === "true") {
      query += ` AND n.is_read = false`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);

    const notifications = await db.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN is_read = false THEN 1 END) as unread
      FROM notifications
      WHERE user_id = $1
    `;

    const counts = await db.query(countQuery, [userId]);

    res.json({
      notifications: notifications.rows,
      total: parseInt(counts.rows[0].total),
      unread: parseInt(counts.rows[0].unread),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(counts.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const updated = await db.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Update unread count in Redis
    await updateUnreadCount(userId);

    res.json({ success: true });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ error: "Failed to mark as read" });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [userId]
    );

    // Update unread count
    await redis.set(`unread_count:${userId}`, 0);

    res.json({
      success: true,
      marked: result.rows.length,
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const deleted = await db.query(
      "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *",
      [notificationId, userId]
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Update unread count if it was unread
    if (!deleted.rows[0].is_read) {
      await updateUnreadCount(userId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
};

// Get notification preferences
exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;

    const preferences = await db.query(
      "SELECT * FROM notification_preferences WHERE user_id = $1",
      [userId]
    );

    if (preferences.rows.length === 0) {
      // Create default preferences
      const defaultPrefs = await db.query(
        `INSERT INTO notification_preferences 
         (id, user_id, order_updates, price_drops, flash_sales, 
          restock_alerts, promotions, push_enabled, email_enabled, created_at, updated_at)
         VALUES ($1, $2, true, true, true, true, true, true, false, NOW(), NOW())
         RETURNING *`,
        [uuidv4(), userId]
      );
      return res.json(defaultPrefs.rows[0]);
    }

    res.json(preferences.rows[0]);
  } catch (error) {
    console.error("Get preferences error:", error);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
};

// Update notification preferences
exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      order_updates,
      price_drops,
      flash_sales,
      restock_alerts,
      promotions,
      push_enabled,
      email_enabled,
    } = req.body;

    const updated = await db.query(
      `INSERT INTO notification_preferences
       (id, user_id, order_updates, price_drops, flash_sales,
        restock_alerts, promotions, push_enabled, email_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         order_updates = $3,
         price_drops = $4,
         flash_sales = $5,
         restock_alerts = $6,
         promotions = $7,
         push_enabled = $8,
         email_enabled = $9,
         updated_at = NOW()
       RETURNING *`,
      [
        uuidv4(),
        userId,
        order_updates,
        price_drops,
        flash_sales,
        restock_alerts,
        promotions,
        push_enabled,
        email_enabled,
      ]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({ error: "Failed to update preferences" });
  }
};

// Create notification (internal use)
exports.createNotification = async (
  userId,
  type,
  title,
  message,
  referenceId = null,
  priority = "normal"
) => {
  try {
    // Check user preferences
    const prefs = await db.query(
      "SELECT * FROM notification_preferences WHERE user_id = $1",
      [userId]
    );

    // Skip if user disabled this notification type
    if (prefs.rows.length > 0) {
      const preferences = prefs.rows[0];
      if (
        (type === "order_update" && !preferences.order_updates) ||
        (type === "price_drop" && !preferences.price_drops) ||
        (type === "flash_sale" && !preferences.flash_sales) ||
        (type === "restock" && !preferences.restock_alerts) ||
        (type === "promotion" && !preferences.promotions)
      ) {
        return null; // User has disabled this type
      }
    }

    const notification = await db.query(
      `INSERT INTO notifications 
       (id, user_id, type, title, message, reference_id, priority, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
       RETURNING *`,
      [uuidv4(), userId, type, title, message, referenceId, priority]
    );

    // Increment unread count
    await redis.incr(`unread_count:${userId}`);

    // Publish to real-time channel (for WebSocket/SSE)
    await redis.publish(
      `notifications:${userId}`,
      JSON.stringify(notification.rows[0])
    );

    return notification.rows[0];
  } catch (error) {
    console.error("Create notification error:", error);
    return null;
  }
};

// SSE endpoint for real-time notifications
exports.streamNotifications = async (req, res) => {
  const userId = req.user.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial unread count
  const unreadCount = (await redis.get(`unread_count:${userId}`)) || 0;
  res.write(
    `data: ${JSON.stringify({
      type: "unread_count",
      count: parseInt(unreadCount),
    })}\n\n`
  );

  // Subscribe to Redis notifications
  const subscriber = redis.duplicate();

  try {
    await subscriber.connect();

    await subscriber.subscribe(`notifications:${userId}`, (message) => {
      res.write(`data: ${message}\n\n`);
    });

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    // Clean up on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe();
      subscriber.quit();
    });
  } catch (error) {
    console.error("Notification stream error:", error);
    res.status(500).json({ error: "Failed to establish notification stream" });
  }
};

// Helper: Update unread count
async function updateUnreadCount(userId) {
  const count = await db.query(
    "SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false",
    [userId]
  );
  await redis.set(`unread_count:${userId}`, count.rows[0].unread);
}

// Background job: Price drop alerts
exports.checkPriceDrops = async () => {
  try {
    console.log("Checking for price drops...");

    // Find products with price changes in wishlist
    const priceChanges = await db.query(
      `SELECT DISTINCT p.id, p.name, p.price, p.original_price, w.user_id
       FROM products p
       JOIN wishlist w ON p.id = w.product_id
       WHERE p.price < p.original_price
       AND p.discount_percentage > 0
       AND p.updated_at > NOW() - INTERVAL '1 hour'
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = w.user_id
         AND n.type = 'price_drop'
         AND n.reference_id = p.id
         AND n.created_at > NOW() - INTERVAL '24 hours'
       )`
    );

    for (const change of priceChanges.rows) {
      const discountPercentage = Math.round(
        ((change.original_price - change.price) / change.original_price) * 100
      );

      await exports.createNotification(
        change.user_id,
        "price_drop",
        "Price Drop Alert! 🔥",
        `${change.name} is now ${discountPercentage}% off! Get it before it's gone.`,
        change.id,
        "high"
      );
    }

    console.log(`Sent ${priceChanges.rows.length} price drop notifications`);
  } catch (error) {
    console.error("Check price drops error:", error);
  }
};

// Background job: Restock alerts
exports.checkRestockAlerts = async () => {
  try {
    console.log("Checking for restock alerts...");

    // Find products that were out of stock and are now in stock
    const restocked = await db.query(
      `SELECT DISTINCT p.id, p.name, w.user_id
       FROM products p
       JOIN wishlist w ON p.id = w.product_id
       WHERE p.stock_quantity > 0
       AND p.updated_at > NOW() - INTERVAL '1 hour'
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = w.user_id
         AND n.type = 'restock'
         AND n.reference_id = p.id
         AND n.created_at > NOW() - INTERVAL '24 hours'
       )`
    );

    for (const item of restocked.rows) {
      await exports.createNotification(
        item.user_id,
        "restock",
        "Back in Stock! ✨",
        `${item.name} is now available. Order before it sells out again!`,
        item.id,
        "high"
      );
    }

    console.log(`Sent ${restocked.rows.length} restock notifications`);
  } catch (error) {
    console.error("Check restock alerts error:", error);
  }
};

// Send order update notification
exports.notifyOrderUpdate = async (userId, orderId, status, message) => {
  try {
    const order = await db.query(
      "SELECT order_number FROM orders WHERE id = $1",
      [orderId]
    );

    if (order.rows.length === 0) return;

    const titles = {
      confirmed: "Order Confirmed 📦",
      processing: "Order Processing 🔄",
      shipped: "Order Shipped 🚚",
      delivered: "Order Delivered ✅",
      cancelled: "Order Cancelled ❌",
    };

    await exports.createNotification(
      userId,
      "order_update",
      titles[status] || "Order Update",
      message || `Your order #${order.rows[0].order_number} status: ${status}`,
      orderId,
      "high"
    );
  } catch (error) {
    console.error("Notify order update error:", error);
  }
};

// Send flash sale notification
exports.notifyFlashSale = async (userId, flashSaleId, title, message) => {
  try {
    await exports.createNotification(
      userId,
      "flash_sale",
      title || "Flash Sale Started! ⚡",
      message,
      flashSaleId,
      "high"
    );
  } catch (error) {
    console.error("Notify flash sale error:", error);
  }
};

// Send cart reminder
exports.sendCartReminder = async (userId, cartItems) => {
  try {
    const itemCount = cartItems.length;
    const message = `You have ${itemCount} item${
      itemCount > 1 ? "s" : ""
    } waiting in your cart. Complete your purchase now!`;

    await exports.createNotification(
      userId,
      "cart_reminder",
      "Don't forget your cart! 🛒",
      message,
      null,
      "normal"
    );
  } catch (error) {
    console.error("Send cart reminder error:", error);
  }
};

// Request product review
exports.requestReview = async (userId, orderId, productId) => {
  try {
    const product = await db.query("SELECT name FROM products WHERE id = $1", [
      productId,
    ]);

    if (product.rows.length === 0) return;

    await exports.createNotification(
      userId,
      "review_request",
      "How was your purchase? ⭐",
      `We'd love to hear your thoughts on ${product.rows[0].name}. Your review helps others!`,
      productId,
      "normal"
    );
  } catch (error) {
    console.error("Request review error:", error);
  }
};

// Bulk notification (for campaigns)
exports.sendBulkNotification = async (
  userIds,
  type,
  title,
  message,
  priority = "normal"
) => {
  try {
    const values = userIds
      .map(
        (userId, index) =>
          `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${
            index * 6 + 4
          }, $${index * 6 + 5}, $${index * 6 + 6})`
      )
      .join(",");

    const params = [];
    userIds.forEach((userId) => {
      params.push(uuidv4(), userId, type, title, message, priority);
    });

    await db.query(
      `INSERT INTO notifications 
       (id, user_id, type, title, message, priority, is_read, created_at)
       VALUES ${values}`,
      params
    );

    // Update unread counts
    for (const userId of userIds) {
      await redis.incr(`unread_count:${userId}`);
      await redis.publish(
        `notifications:${userId}`,
        JSON.stringify({ type, title, message, created_at: new Date() })
      );
    }

    console.log(`Sent bulk notification to ${userIds.length} users`);
  } catch (error) {
    console.error("Send bulk notification error:", error);
  }
};

module.exports = exports;
