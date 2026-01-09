// src/jobs/scheduler.js
const cron = require("node-cron");
const db = require("../config/database");
const redis = require("../config/redis");
const notificationsController = require("../controllers/notificationsController");
const flashSalesController = require("../controllers/flashSalesController");

// =============================================
// SCHEDULED JOBS
// =============================================

// Check for price drops every hour
cron.schedule("0 * * * *", async () => {
  console.log("Running price drop check...");
  await notificationsController.checkPriceDrops();
});

// Check for restocks every 2 hours
cron.schedule("0 */2 * * *", async () => {
  console.log("Running restock check...");
  await notificationsController.checkRestockAlerts();
});

// Activate flash sales when they start (every minute)
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    // Find flash sales that should start
    const toActivate = await db.query(
      `SELECT id FROM flash_sales 
       WHERE status = 'scheduled' 
       AND start_time <= $1`,
      [now]
    );

    for (const sale of toActivate.rows) {
      await flashSalesController.notifyFlashSaleStart(sale.id);
      console.log(`Activated flash sale: ${sale.id}`);
    }

    // End expired flash sales
    const toEnd = await db.query(
      `UPDATE flash_sales 
       SET status = 'ended' 
       WHERE status = 'active' 
       AND end_time <= $1
       RETURNING id`,
      [now]
    );

    if (toEnd.rows.length > 0) {
      await redis.del("flash_sales:active");
      console.log(`Ended ${toEnd.rows.length} flash sales`);
    }
  } catch (error) {
    console.error("Flash sale activation error:", error);
  }
});

// Clean up old analytics events (daily at 3 AM)
cron.schedule("0 3 * * *", async () => {
  try {
    console.log("Cleaning up old analytics events...");

    // Keep only last 90 days
    const deleted = await db.query(
      `DELETE FROM analytics_events 
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );

    console.log(`Deleted ${deleted.rowCount} old analytics events`);
  } catch (error) {
    console.error("Analytics cleanup error:", error);
  }
});

// Update trending products (every 15 minutes)
cron.schedule("*/15 * * * *", async () => {
  try {
    console.log("Updating trending products...");

    // Get products with most views in last 24 hours
    const trending = await db.query(
      `SELECT product_id, COUNT(*) as views
       FROM analytics_events
       WHERE event_type = 'product_view'
       AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY product_id
       ORDER BY views DESC
       LIMIT 100`
    );

    // Update Redis sorted set
    const pipeline = redis.multi();

    // Clear old data
    pipeline.del("hot_products");

    // Add new trending products
    for (const product of trending.rows) {
      pipeline.zAdd("hot_products", {
        score: product.views,
        value: product.product_id,
      });
    }

    await pipeline.exec();

    console.log(`Updated ${trending.rows.length} trending products`);
  } catch (error) {
    console.error("Update trending error:", error);
  }
});

// Clean up old notifications (daily at 2 AM)
cron.schedule("0 2 * * *", async () => {
  try {
    console.log("Cleaning up old notifications...");

    // Delete read notifications older than 30 days
    const deleted = await db.query(
      `DELETE FROM notifications 
       WHERE is_read = true 
       AND read_at < NOW() - INTERVAL '30 days'`
    );

    console.log(`Deleted ${deleted.rowCount} old notifications`);
  } catch (error) {
    console.error("Notification cleanup error:", error);
  }
});

// Update user segments (daily at 4 AM)
cron.schedule("0 4 * * *", async () => {
  try {
    console.log("Updating user segments...");

    // Get all active segments
    const segments = await db.query(
      "SELECT * FROM user_segments WHERE is_active = true"
    );

    for (const segment of segments.rows) {
      // Clear existing members
      await db.query("DELETE FROM user_segment_members WHERE segment_id = $1", [
        segment.id,
      ]);

      // Re-populate based on criteria
      const criteria = segment.criteria;

      // Example: High-value customers
      if (criteria.min_lifetime_value) {
        const users = await db.query(
          `SELECT u.id
           FROM users u
           JOIN (
             SELECT user_id, SUM(total_amount) as lifetime_value
             FROM orders
             WHERE status NOT IN ('cancelled', 'refunded')
             GROUP BY user_id
           ) o ON u.id = o.user_id
           WHERE o.lifetime_value >= $1`,
          [criteria.min_lifetime_value]
        );

        for (const user of users.rows) {
          await db.query(
            `INSERT INTO user_segment_members (segment_id, user_id, added_at)
             VALUES ($1, $2, NOW())`,
            [segment.id, user.id]
          );
        }
      }

      // Example: Frequent browsers
      if (criteria.min_weekly_views) {
        const users = await db.query(
          `SELECT user_id
           FROM analytics_events
           WHERE event_type = 'product_view'
           AND created_at > NOW() - INTERVAL '7 days'
           GROUP BY user_id
           HAVING COUNT(*) >= $1`,
          [criteria.min_weekly_views]
        );

        for (const user of users.rows) {
          await db.query(
            `INSERT INTO user_segment_members (segment_id, user_id, added_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (segment_id, user_id) DO NOTHING`,
            [segment.id, user.user_id]
          );
        }
      }
    }

    console.log(`Updated ${segments.rows.length} user segments`);
  } catch (error) {
    console.error("User segment update error:", error);
  }
});

// Generate daily reports (daily at 5 AM)
cron.schedule("0 5 * * *", async () => {
  try {
    console.log("Generating daily reports...");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    // Calculate daily metrics
    const metrics = await db.query(
      `SELECT 
         COUNT(DISTINCT o.id) as total_orders,
         SUM(o.total_amount) as total_revenue,
         COUNT(DISTINCT o.user_id) as unique_customers,
         COUNT(DISTINCT ae.session_id) as total_sessions
       FROM orders o
       LEFT JOIN analytics_events ae ON DATE(ae.created_at) = $1
       WHERE DATE(o.created_at) = $1`,
      [dateStr]
    );

    // Store in Redis for quick access
    await redis.hSet(`daily_report:${dateStr}`, {
      total_orders: metrics.rows[0].total_orders || 0,
      total_revenue: metrics.rows[0].total_revenue || 0,
      unique_customers: metrics.rows[0].unique_customers || 0,
      total_sessions: metrics.rows[0].total_sessions || 0,
    });

    // Set expiry to 90 days
    await redis.expire(`daily_report:${dateStr}`, 90 * 24 * 60 * 60);

    console.log(`Generated report for ${dateStr}`);
  } catch (error) {
    console.error("Report generation error:", error);
  }
});

// Check for abandoned carts (every 6 hours)
cron.schedule("0 */6 * * *", async () => {
  try {
    console.log("Checking abandoned carts...");

    // Find users who added items to cart but didn't purchase
    const abandoned = await db.query(
      `SELECT DISTINCT ae.user_id, ae.event_data->>'productId' as product_id
       FROM analytics_events ae
       WHERE ae.event_type = 'add_to_cart'
       AND ae.created_at > NOW() - INTERVAL '24 hours'
       AND ae.created_at < NOW() - INTERVAL '2 hours'
       AND ae.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.user_id = ae.user_id
         AND o.created_at > ae.created_at
       )
       LIMIT 100`
    );

    for (const item of abandoned.rows) {
      // Get product details
      const product = await db.query(
        "SELECT name, price, images FROM products WHERE id = $1",
        [item.product_id]
      );

      if (product.rows.length > 0) {
        await notificationsController.createNotification(
          item.user_id,
          "cart_reminder",
          "Don't forget your cart! 🛒",
          `${product.rows[0].name} is still waiting for you. Complete your purchase now!`,
          item.product_id
        );
      }
    }

    console.log(`Sent ${abandoned.rows.length} cart reminders`);
  } catch (error) {
    console.error("Abandoned cart check error:", error);
  }
});

// Monitor low stock products (every 4 hours)
cron.schedule("0 */4 * * *", async () => {
  try {
    console.log("Checking low stock products...");

    const lowStock = await db.query(
      `SELECT p.id, p.name, p.stock_quantity, s.id as seller_id
       FROM products p
       JOIN sellers s ON p.seller_id = s.id
       WHERE p.stock_quantity > 0 
       AND p.stock_quantity <= 10
       AND p.stock_quantity > 0`
    );

    // Notify sellers about low stock
    for (const product of lowStock.rows) {
      // Store in Redis for seller dashboard
      await redis.sAdd(`low_stock:${product.seller_id}`, product.id);
    }

    console.log(`Found ${lowStock.rows.length} low stock products`);
  } catch (error) {
    console.error("Low stock check error:", error);
  }
});

console.log("✅ Background jobs scheduler initialized");

module.exports = {
  // Export functions for manual triggering if needed
  checkPriceDrops: notificationsController.checkPriceDrops,
  checkRestockAlerts: notificationsController.checkRestockAlerts,
};
