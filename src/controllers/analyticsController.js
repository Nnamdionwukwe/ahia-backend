// src/controllers/analyticsController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Track event (page view, click, add to cart, etc.)
exports.trackEvent = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { eventType, eventData, sessionId } = req.body;

    // Store in database for historical analysis
    await db.query(
      `INSERT INTO analytics_events 
       (id, user_id, session_id, event_type, event_data, 
        user_agent, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        uuidv4(),
        userId,
        sessionId,
        eventType,
        JSON.stringify(eventData),
        req.headers["user-agent"],
        req.ip,
      ]
    );

    // Update real-time counters in Redis
    const today = new Date().toISOString().split("T")[0];
    await redis.incr(`analytics:${eventType}:${today}`);

    if (userId) {
      await redis.incr(`analytics:user:${userId}:${eventType}:${today}`);
    }

    // Track specific events
    if (eventType === "product_view" && eventData.productId) {
      await trackProductView(eventData.productId, userId);
    } else if (eventType === "add_to_cart" && eventData.productId) {
      await trackAddToCart(eventData.productId, userId);
    } else if (eventType === "search" && eventData.query) {
      await trackSearch(eventData.query);
    }

    res.json({ tracked: true });
  } catch (error) {
    console.error("Track event error:", error);
    res.status(500).json({ error: "Failed to track event" });
  }
};

// Get user analytics
exports.getUserAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = "30d" } = req.query;

    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    // Get user activity summary
    const activity = await db.query(
      `SELECT 
         event_type,
         COUNT(*) as count,
         DATE(created_at) as date
       FROM analytics_events
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY event_type, DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );

    // Get shopping behavior
    const behavior = await db.query(
      `SELECT 
         COUNT(DISTINCT CASE WHEN event_type = 'product_view' 
           THEN event_data->>'productId' END) as products_viewed,
         COUNT(DISTINCT CASE WHEN event_type = 'search' 
           THEN event_data->>'query' END) as searches_made,
         COUNT(CASE WHEN event_type = 'add_to_cart' THEN 1 END) as items_added_to_cart,
         COUNT(CASE WHEN event_type = 'purchase' THEN 1 END) as purchases_made
       FROM analytics_events
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    // Get favorite categories
    const categories = await db.query(
      `SELECT p.category, COUNT(*) as views
       FROM analytics_events ae
       JOIN products p ON (ae.event_data->>'productId')::uuid = p.id
       WHERE ae.user_id = $1
         AND ae.event_type = 'product_view'
         AND ae.created_at > NOW() - INTERVAL '${days} days'
       GROUP BY p.category
       ORDER BY views DESC
       LIMIT 5`,
      [userId]
    );

    res.json({
      activity: activity.rows,
      behavior: behavior.rows[0],
      favoriteCategories: categories.rows,
    });
  } catch (error) {
    console.error("Get user analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

// Get product analytics (Seller/Admin)
exports.getProductAnalytics = async (req, res) => {
  try {
    const { productId } = req.params;
    const { period = "30d" } = req.query;

    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    // Get view/conversion funnel
    const funnel = await db.query(
      `SELECT 
         COUNT(CASE WHEN event_type = 'product_view' THEN 1 END) as views,
         COUNT(CASE WHEN event_type = 'add_to_cart' THEN 1 END) as add_to_cart,
         COUNT(CASE WHEN event_type = 'purchase' THEN 1 END) as purchases
       FROM analytics_events
       WHERE event_data->>'productId' = $1
         AND created_at > NOW() - INTERVAL '${days} days'`,
      [productId]
    );

    // Get views over time
    const viewsOverTime = await db.query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(*) as views,
         COUNT(DISTINCT user_id) as unique_visitors
       FROM analytics_events
       WHERE event_data->>'productId' = $1
         AND event_type = 'product_view'
         AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [productId]
    );

    // Calculate conversion rate
    const views = parseInt(funnel.rows[0].views);
    const purchases = parseInt(funnel.rows[0].purchases);
    const conversionRate =
      views > 0 ? ((purchases / views) * 100).toFixed(2) : 0;

    // Get top referring sources
    const referrers = await db.query(
      `SELECT 
         event_data->>'referrer' as referrer,
         COUNT(*) as count
       FROM analytics_events
       WHERE event_data->>'productId' = $1
         AND event_type = 'product_view'
         AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY referrer
       ORDER BY count DESC
       LIMIT 10`,
      [productId]
    );

    res.json({
      funnel: funnel.rows[0],
      conversionRate: parseFloat(conversionRate),
      viewsOverTime: viewsOverTime.rows,
      topReferrers: referrers.rows,
    });
  } catch (error) {
    console.error("Get product analytics error:", error);
    res.status(500).json({ error: "Failed to fetch product analytics" });
  }
};

// Get seller dashboard analytics
exports.getSellerAnalytics = async (req, res) => {
  try {
    const sellerId = req.user.sellerId; // Assuming seller info in JWT
    const { period = "30d" } = req.query;

    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    // Get sales metrics
    const sales = await db.query(
      `SELECT 
         COUNT(DISTINCT o.id) as total_orders,
         SUM(oi.quantity) as total_items_sold,
         SUM(oi.quantity * oi.price) as total_revenue,
         AVG(oi.price) as average_order_value
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.seller_id = $1
         AND o.created_at > NOW() - INTERVAL '${days} days'
         AND o.status NOT IN ('cancelled', 'refunded')`,
      [sellerId]
    );

    // Get revenue over time
    const revenueOverTime = await db.query(
      `SELECT 
         DATE(o.created_at) as date,
         COUNT(DISTINCT o.id) as orders,
         SUM(oi.quantity * oi.price) as revenue
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.seller_id = $1
         AND o.created_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(o.created_at)
       ORDER BY date ASC`,
      [sellerId]
    );

    // Get top selling products
    const topProducts = await db.query(
      `SELECT 
         p.id, p.name, p.images,
         COUNT(oi.id) as order_count,
         SUM(oi.quantity) as quantity_sold,
         SUM(oi.quantity * oi.price) as revenue
       FROM products p
       JOIN order_items oi ON p.id = oi.product_id
       JOIN orders o ON oi.order_id = o.id
       WHERE p.seller_id = $1
         AND o.created_at > NOW() - INTERVAL '${days} days'
       GROUP BY p.id
       ORDER BY revenue DESC
       LIMIT 10`,
      [sellerId]
    );

    // Get customer insights
    const customers = await db.query(
      `SELECT 
         COUNT(DISTINCT o.user_id) as total_customers,
         COUNT(DISTINCT CASE 
           WHEN customer_orders.order_count > 1 THEN o.user_id 
         END) as repeat_customers
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN (
         SELECT user_id, COUNT(*) as order_count
         FROM orders
         GROUP BY user_id
       ) customer_orders ON o.user_id = customer_orders.user_id
       WHERE p.seller_id = $1
         AND o.created_at > NOW() - INTERVAL '${days} days'`,
      [sellerId]
    );

    res.json({
      sales: sales.rows[0],
      revenueOverTime: revenueOverTime.rows,
      topProducts: topProducts.rows,
      customers: customers.rows[0],
    });
  } catch (error) {
    console.error("Get seller analytics error:", error);
    res.status(500).json({ error: "Failed to fetch seller analytics" });
  }
};

// Get platform-wide analytics (Admin only)
exports.getPlatformAnalytics = async (req, res) => {
  try {
    const { period = "30d" } = req.query;
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    // Overall metrics
    const metrics = await db.query(
      `SELECT 
         COUNT(DISTINCT CASE WHEN ae.event_type = 'page_view' 
           THEN ae.session_id END) as total_sessions,
         COUNT(DISTINCT ae.user_id) as active_users,
         COUNT(DISTINCT CASE WHEN ae.event_type = 'product_view' 
           THEN ae.event_data->>'productId' END) as products_viewed,
         COUNT(CASE WHEN ae.event_type = 'purchase' THEN 1 END) as total_purchases
       FROM analytics_events ae
       WHERE ae.created_at > NOW() - INTERVAL '${days} days'`
    );

    // Popular products
    const popularProducts = await db.query(
      `SELECT 
         p.id, p.name, p.images,
         COUNT(*) as view_count
       FROM analytics_events ae
       JOIN products p ON (ae.event_data->>'productId')::uuid = p.id
       WHERE ae.event_type = 'product_view'
         AND ae.created_at > NOW() - INTERVAL '${days} days'
       GROUP BY p.id
       ORDER BY view_count DESC
       LIMIT 10`
    );

    // Popular searches
    const popularSearches = await db.query(
      `SELECT 
         ae.event_data->>'query' as query,
         COUNT(*) as search_count
       FROM analytics_events ae
       WHERE ae.event_type = 'search'
         AND ae.created_at > NOW() - INTERVAL '${days} days'
       GROUP BY query
       ORDER BY search_count DESC
       LIMIT 20`
    );

    // Daily active users
    const dauOverTime = await db.query(
      `SELECT 
         DATE(created_at) as date,
         COUNT(DISTINCT user_id) as active_users
       FROM analytics_events
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    res.json({
      metrics: metrics.rows[0],
      popularProducts: popularProducts.rows,
      popularSearches: popularSearches.rows,
      dauOverTime: dauOverTime.rows,
    });
  } catch (error) {
    console.error("Get platform analytics error:", error);
    res.status(500).json({ error: "Failed to fetch platform analytics" });
  }
};

// Helper: Track product view
async function trackProductView(productId, userId) {
  const today = new Date().toISOString().split("T")[0];

  // Increment product view count
  await redis.zIncrBy(`trending:${today}`, 1, productId);

  // Store in sorted set for hot products (last 24 hours)
  await redis.zIncrBy("hot_products", 1, productId);

  if (userId) {
    // Track for personalization
    await redis.sAdd(`user:${userId}:viewed`, productId);
  }
}

// Helper: Track add to cart
async function trackAddToCart(productId, userId) {
  await redis.zIncrBy("cart_adds", 1, productId);

  if (userId) {
    await redis.hSet(`user:${userId}:cart_history`, productId, Date.now());
  }
}

// Helper: Track search
async function trackSearch(query) {
  const today = new Date().toISOString().split("T")[0];
  await redis.zIncrBy(`searches:${today}`, 1, query.toLowerCase());
}

// Get trending products from Redis
exports.getTrendingProducts = async (req, res) => {
  try {
    const limit = req.query.limit || 20;

    // Get top products from last 24 hours
    const productIds = await redis.zRevRange("hot_products", 0, limit - 1);

    if (productIds.length === 0) {
      return res.json({ products: [] });
    }

    const products = await db.query(
      `SELECT p.id, p.name, p.price, p.discount_percentage,
              p.images, p.rating, p.total_reviews, s.store_name
       FROM products p
       LEFT JOIN sellers s ON p.seller_id = s.id
       WHERE p.id = ANY($1)
         AND p.stock_quantity > 0`,
      [productIds]
    );

    res.json({ products: products.rows });
  } catch (error) {
    console.error("Get trending products error:", error);
    res.status(500).json({ error: "Failed to fetch trending products" });
  }
};
