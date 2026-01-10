// src/jobs/scheduler.js
const cron = require("node-cron");
const db = require("../config/database");
const redis = require("../config/redis");
const notificationsController = require("../controllers/notificationsController");
const flashSalesController = require("../controllers/flashSalesController");
const loyaltyController = require("../controllers/loyaltyController");

// =============================================
// SCHEDULED JOBS
// =============================================

// Check for price drops every hour
cron.schedule("0 * * * *", async () => {
  console.log("📊 Running price drop check...");
  try {
    await notificationsController.checkPriceDrops();
  } catch (error) {
    console.error("Price drop check error:", error);
  }
});

// Check for restocks every 2 hours
cron.schedule("0 */2 * * *", async () => {
  console.log("📦 Running restock check...");
  try {
    await notificationsController.checkRestockAlerts();
  } catch (error) {
    console.error("Restock check error:", error);
  }
});

// Flash sales management (every minute)
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    // Start scheduled flash sales
    const toActivate = await db.query(
      `SELECT id, title FROM flash_sales 
       WHERE status = 'scheduled' 
       AND start_time <= $1`,
      [now]
    );

    for (const sale of toActivate.rows) {
      await flashSalesController.notifyFlashSaleStart(sale.id);
      console.log(`⚡ Activated flash sale: ${sale.title}`);
    }

    // End expired flash sales
    const toEnd = await db.query(
      `UPDATE flash_sales 
       SET status = 'ended' 
       WHERE status = 'active' 
       AND end_time <= $1
       RETURNING id, title`,
      [now]
    );

    if (toEnd.rows.length > 0) {
      await redis.del("flash_sales:active");
      console.log(
        `⏰ Ended ${toEnd.rows.length} flash sale(s): ${toEnd.rows
          .map((s) => s.title)
          .join(", ")}`
      );
    }
  } catch (error) {
    console.error("Flash sale management error:", error);
  }
});

// Expire loyalty points (daily at 3 AM)
cron.schedule("0 3 * * *", async () => {
  try {
    console.log("🎁 Processing expired loyalty points...");

    // Call the database function to expire points
    await db.query("SELECT expire_loyalty_points()");

    console.log("✅ Expired loyalty points processed");
  } catch (error) {
    console.error("Loyalty points expiration error:", error);
  }
});

// Clean up old analytics events (daily at 3:30 AM)
cron.schedule("30 3 * * *", async () => {
  try {
    console.log("🧹 Cleaning up old analytics events...");

    // Keep only last 90 days
    const deleted = await db.query(
      `DELETE FROM analytics_events 
       WHERE created_at < NOW() - INTERVAL '90 days'`
    );

    console.log(`✅ Deleted ${deleted.rowCount} old analytics events`);
  } catch (error) {
    console.error("Analytics cleanup error:", error);
  }
});

// Update trending products (every 15 minutes)
cron.schedule("*/15 * * * *", async () => {
  try {
    console.log("📈 Updating trending products...");

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

    if (trending.rows.length === 0) {
      console.log("No trending products found");
      return;
    }

    // Update Redis sorted set
    const pipeline = redis.multi();

    // Clear old data
    pipeline.del("hot_products");

    // Add new trending products
    for (const product of trending.rows) {
      pipeline.zAdd("hot_products", {
        score: parseInt(product.views),
        value: product.product_id,
      });
    }

    await pipeline.exec();

    console.log(`✅ Updated ${trending.rows.length} trending products`);
  } catch (error) {
    console.error("Update trending error:", error);
  }
});

// Clean up old notifications (daily at 2 AM)
cron.schedule("0 2 * * *", async () => {
  try {
    console.log("🧹 Cleaning up old notifications...");

    // Delete read notifications older than 30 days
    const deleted = await db.query(
      `DELETE FROM notifications 
       WHERE is_read = true 
       AND read_at < NOW() - INTERVAL '30 days'`
    );

    console.log(`✅ Deleted ${deleted.rowCount} old notifications`);
  } catch (error) {
    console.error("Notification cleanup error:", error);
  }
});

// Update user segments (daily at 4 AM)
cron.schedule("0 4 * * *", async () => {
  try {
    console.log("👥 Updating user segments...");

    // Get all active segments
    const segments = await db.query(
      "SELECT * FROM user_segments WHERE is_active = true"
    );

    if (segments.rows.length === 0) {
      console.log("No active user segments found");
      return;
    }

    let totalUpdated = 0;

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
        totalUpdated += users.rows.length;
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

    console.log(
      `✅ Updated ${segments.rows.length} user segments (${totalUpdated} members)`
    );
  } catch (error) {
    console.error("User segment update error:", error);
  }
});

// Generate daily reports (daily at 5 AM)
cron.schedule("0 5 * * *", async () => {
  try {
    console.log("📊 Generating daily reports...");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    // Calculate daily metrics
    const metrics = await db.query(
      `SELECT 
         COUNT(DISTINCT o.id) as total_orders,
         COALESCE(SUM(o.total_amount), 0) as total_revenue,
         COUNT(DISTINCT o.user_id) as unique_customers
       FROM orders o
       WHERE DATE(o.created_at) = $1`,
      [dateStr]
    );

    const sessionMetrics = await db.query(
      `SELECT COUNT(DISTINCT session_id) as total_sessions
       FROM analytics_events
       WHERE DATE(created_at) = $1`,
      [dateStr]
    );

    // Store in Redis for quick access
    await redis.hSet(`daily_report:${dateStr}`, {
      total_orders: metrics.rows[0].total_orders || 0,
      total_revenue: parseFloat(metrics.rows[0].total_revenue || 0).toFixed(2),
      unique_customers: metrics.rows[0].unique_customers || 0,
      total_sessions: sessionMetrics.rows[0].total_sessions || 0,
    });

    // Set expiry to 90 days
    await redis.expire(`daily_report:${dateStr}`, 90 * 24 * 60 * 60);

    console.log(`✅ Generated report for ${dateStr}`);
  } catch (error) {
    console.error("Report generation error:", error);
  }
});

// Check for abandoned carts (every 6 hours)
cron.schedule("0 */6 * * *", async () => {
  try {
    console.log("🛒 Checking abandoned carts...");

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

    if (abandoned.rows.length === 0) {
      console.log("No abandoned carts found");
      return;
    }

    let sent = 0;
    for (const item of abandoned.rows) {
      // Get product details
      const product = await db.query(
        "SELECT name, price, images FROM products WHERE id = $1",
        [item.product_id]
      );

      if (product.rows.length > 0) {
        await notificationsController.sendCartReminder(item.user_id, [
          product.rows[0],
        ]);
        sent++;
      }
    }

    console.log(`✅ Sent ${sent} cart reminder(s)`);
  } catch (error) {
    console.error("Abandoned cart check error:", error);
  }
});

// Monitor low stock products (every 4 hours)
cron.schedule("0 */4 * * *", async () => {
  try {
    console.log("📦 Checking low stock products...");

    const lowStock = await db.query(
      `SELECT p.id, p.name, p.stock_quantity, s.id as seller_id, s.user_id
       FROM products p
       JOIN sellers s ON p.seller_id = s.id
       WHERE p.stock_quantity > 0 
       AND p.stock_quantity <= 10`
    );

    if (lowStock.rows.length === 0) {
      console.log("No low stock products found");
      return;
    }

    // Notify sellers about low stock
    for (const product of lowStock.rows) {
      // Store in Redis for seller dashboard
      await redis.sAdd(`low_stock:${product.seller_id}`, product.id);

      // Send notification to seller
      await notificationsController.createNotification(
        product.user_id,
        "inventory",
        "Low Stock Alert ⚠️",
        `${product.name} has only ${product.stock_quantity} unit(s) left in stock`,
        product.id,
        "high"
      );
    }

    console.log(`✅ Found ${lowStock.rows.length} low stock product(s)`);
  } catch (error) {
    console.error("Low stock check error:", error);
  }
});

// Award daily login points (every hour)
cron.schedule("0 * * * *", async () => {
  try {
    console.log("🎯 Processing daily login bonuses...");

    // Find users who logged in today but haven't received points yet
    const activeUsers = await db.query(
      `SELECT DISTINCT user_id
       FROM analytics_events
       WHERE event_type = 'login'
       AND created_at > CURRENT_DATE
       AND user_id NOT IN (
         SELECT user_id 
         FROM loyalty_transactions
         WHERE description = 'Daily login bonus'
         AND created_at > CURRENT_DATE
       )
       LIMIT 1000`
    );

    let awarded = 0;
    for (const user of activeUsers.rows) {
      try {
        await loyaltyController.awardPoints(
          user.user_id,
          loyaltyController.POINTS_RULES.daily_login,
          "Daily login bonus"
        );
        awarded++;
      } catch (error) {
        console.error(
          `Failed to award login points to ${user.user_id}:`,
          error.message
        );
      }
    }

    if (awarded > 0) {
      console.log(`✅ Awarded daily login bonus to ${awarded} user(s)`);
    }
  } catch (error) {
    console.error("Daily login bonus error:", error);
  }
});

console.log("✅ Background jobs scheduler initialized");
console.log("📅 Scheduled jobs:");
console.log("  • Price drops: Every hour");
console.log("  • Restock alerts: Every 2 hours");
console.log("  • Flash sales: Every minute");
console.log("  • Loyalty points expiry: Daily at 3:00 AM");
console.log("  • Analytics cleanup: Daily at 3:30 AM");
console.log("  • Trending products: Every 15 minutes");
console.log("  • Notification cleanup: Daily at 2:00 AM");
console.log("  • User segments: Daily at 4:00 AM");
console.log("  • Daily reports: Daily at 5:00 AM");
console.log("  • Abandoned carts: Every 6 hours");
console.log("  • Low stock alerts: Every 4 hours");
console.log("  • Daily login bonus: Every hour");

// Export functions for manual triggering
module.exports = {
  checkPriceDrops: notificationsController.checkPriceDrops,
  checkRestockAlerts: notificationsController.checkRestockAlerts,
  notifyFlashSaleStart: flashSalesController.notifyFlashSaleStart,
  endExpiredFlashSales: flashSalesController.endExpiredFlashSales,
  startScheduledFlashSales: flashSalesController.startScheduledFlashSales,
};
