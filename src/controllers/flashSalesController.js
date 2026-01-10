// src/controllers/flashSalesController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Create flash sale (Admin/Seller)
exports.createFlashSale = async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      productIds,
      discountPercentage,
      maxQuantity,
    } = req.body;

    // Validation
    if (
      !title ||
      !startTime ||
      !endTime ||
      !productIds ||
      !discountPercentage
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: title, startTime, endTime, productIds, discountPercentage",
      });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res
        .status(400)
        .json({ error: "End time must be after start time" });
    }

    if (discountPercentage <= 0 || discountPercentage > 100) {
      return res
        .status(400)
        .json({ error: "Discount percentage must be between 1 and 100" });
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one product ID is required" });
    }

    const flashSaleId = uuidv4();

    // Create flash sale
    const flashSale = await db.query(
      `INSERT INTO flash_sales (id, title, description, start_time, end_time, 
                                 discount_percentage, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NOW())
       RETURNING *`,
      [flashSaleId, title, description, startTime, endTime, discountPercentage]
    );

    // Add products to flash sale
    const flashSaleProducts = [];
    for (const productId of productIds) {
      const product = await db.query(
        `INSERT INTO flash_sale_products (id, flash_sale_id, product_id, 
                                           original_price, sale_price, 
                                           max_quantity, sold_quantity, created_at)
         SELECT $1, $2, $3, p.price, p.price * (1 - $4/100), $5, 0, NOW()
         FROM products p 
         WHERE p.id = $3
         RETURNING *`,
        [
          uuidv4(),
          flashSaleId,
          productId,
          discountPercentage,
          maxQuantity || 100,
        ]
      );

      if (product.rows.length > 0) {
        flashSaleProducts.push(product.rows[0]);
      }
    }

    res.status(201).json({
      success: true,
      flashSale: flashSale.rows[0],
      products: flashSaleProducts,
    });
  } catch (error) {
    console.error("Create flash sale error:", error);
    res.status(500).json({ error: "Failed to create flash sale" });
  }
};

// Get active flash sales
exports.getActiveFlashSales = async (req, res) => {
  try {
    // Check cache
    const cacheKey = "flash_sales:active";
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const now = new Date();

    const flashSales = await db.query(
      `SELECT fs.*, 
              COUNT(fsp.id) as total_products,
              SUM(fsp.sold_quantity) as total_sold,
              SUM(fsp.max_quantity) as total_quantity
       FROM flash_sales fs
       LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
       WHERE fs.start_time <= $1 
         AND fs.end_time > $1
         AND fs.status = 'active'
       GROUP BY fs.id
       ORDER BY fs.start_time ASC`,
      [now]
    );

    // Get products for each flash sale
    for (const sale of flashSales.rows) {
      const products = await db.query(
        `SELECT fsp.*, p.name, p.images, p.rating, p.category,
                (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
                CASE 
                  WHEN fsp.max_quantity > 0 
                  THEN ROUND((fsp.sold_quantity::decimal / fsp.max_quantity) * 100) 
                  ELSE 0 
                END as sold_percentage
         FROM flash_sale_products fsp
         JOIN products p ON fsp.product_id = p.id
         WHERE fsp.flash_sale_id = $1
         ORDER BY sold_percentage DESC`,
        [sale.id]
      );
      sale.products = products.rows;

      // Calculate time remaining
      sale.time_remaining = Math.max(
        0,
        Math.floor((new Date(sale.end_time) - now) / 1000)
      );
    }

    const result = { flashSales: flashSales.rows };

    // Cache for 1 minute (flash sales change frequently)
    await redis.setex(cacheKey, 60, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get flash sales error:", error);
    res.status(500).json({ error: "Failed to fetch flash sales" });
  }
};

// Get upcoming flash sales
exports.getUpcomingFlashSales = async (req, res) => {
  try {
    const now = new Date();

    const upcoming = await db.query(
      `SELECT fs.*,
              COUNT(fsp.id) as total_products,
              SUM(fsp.max_quantity) as total_quantity
       FROM flash_sales fs
       LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
       WHERE fs.start_time > $1
         AND fs.status = 'scheduled'
       GROUP BY fs.id
       ORDER BY fs.start_time ASC
       LIMIT 10`,
      [now]
    );

    // Calculate time until start for each sale
    for (const sale of upcoming.rows) {
      sale.starts_in_seconds = Math.floor(
        (new Date(sale.start_time) - now) / 1000
      );
    }

    res.json({ upcomingSales: upcoming.rows });
  } catch (error) {
    console.error("Get upcoming flash sales error:", error);
    res.status(500).json({ error: "Failed to fetch upcoming sales" });
  }
};

// Get specific flash sale details
exports.getFlashSaleDetails = async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    const flashSale = await db.query(
      `SELECT fs.*,
              COUNT(fsp.id) as total_products,
              SUM(fsp.sold_quantity) as total_sold,
              SUM(fsp.max_quantity) as total_quantity
       FROM flash_sales fs
       LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
       WHERE fs.id = $1
       GROUP BY fs.id`,
      [flashSaleId]
    );

    if (flashSale.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    // Get products
    const products = await db.query(
      `SELECT fsp.*, p.name, p.images, p.rating, p.description, p.category,
              (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
              CASE 
                WHEN fsp.max_quantity > 0 
                THEN ROUND((fsp.sold_quantity::decimal / fsp.max_quantity) * 100) 
                ELSE 0 
              END as sold_percentage
       FROM flash_sale_products fsp
       JOIN products p ON fsp.product_id = p.id
       WHERE fsp.flash_sale_id = $1
       ORDER BY sold_percentage DESC`,
      [flashSaleId]
    );

    const sale = flashSale.rows[0];
    sale.products = products.rows;

    // Calculate time remaining/until start
    const now = new Date();
    if (new Date(sale.start_time) > now) {
      sale.starts_in_seconds = Math.floor(
        (new Date(sale.start_time) - now) / 1000
      );
    } else if (new Date(sale.end_time) > now) {
      sale.time_remaining_seconds = Math.floor(
        (new Date(sale.end_time) - now) / 1000
      );
    }

    res.json({ flashSale: sale });
  } catch (error) {
    console.error("Get flash sale details error:", error);
    res.status(500).json({ error: "Failed to fetch flash sale details" });
  }
};

// Purchase flash sale product
exports.purchaseFlashSaleProduct = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { flashSaleProductId, quantity } = req.body;

    if (!flashSaleProductId || !quantity) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Flash sale product ID and quantity required" });
    }

    if (quantity <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Quantity must be greater than 0" });
    }

    // Lock the row for update
    const flashSaleProduct = await client.query(
      `SELECT fsp.*, fs.end_time, fs.status, fs.start_time
       FROM flash_sale_products fsp
       JOIN flash_sales fs ON fsp.flash_sale_id = fs.id
       WHERE fsp.id = $1
       FOR UPDATE`,
      [flashSaleProductId]
    );

    if (flashSaleProduct.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Flash sale product not found" });
    }

    const product = flashSaleProduct.rows[0];

    // Validate flash sale is active
    const now = new Date();
    if (
      product.status !== "active" ||
      new Date(product.start_time) > now ||
      new Date(product.end_time) <= now
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Flash sale is not currently active",
        status: product.status,
        startTime: product.start_time,
        endTime: product.end_time,
      });
    }

    // Check availability
    const remaining = product.max_quantity - product.sold_quantity;
    if (remaining < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Only ${remaining} item${remaining !== 1 ? "s" : ""} remaining`,
        remaining,
        requested: quantity,
      });
    }

    // Check user hasn't exceeded purchase limit (max 2 per user per flash sale product)
    const userPurchases = await client.query(
      `SELECT SUM(oi.quantity) as total
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = $1 
         AND oi.flash_sale_product_id = $2
         AND o.status NOT IN ('cancelled', 'refunded')`,
      [userId, flashSaleProductId]
    );

    const alreadyPurchased = parseInt(userPurchases.rows[0]?.total || 0);
    const maxPerUser = 2; // Configurable per flash sale if needed

    if (alreadyPurchased + quantity > maxPerUser) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Purchase limit exceeded. Maximum ${maxPerUser} per customer`,
        alreadyPurchased,
        maxPerUser,
      });
    }

    // Update sold quantity
    await client.query(
      `UPDATE flash_sale_products 
       SET sold_quantity = sold_quantity + $1
       WHERE id = $2`,
      [quantity, flashSaleProductId]
    );

    await client.query("COMMIT");

    // Clear cache
    await redis.del("flash_sales:active");

    res.json({
      success: true,
      product: {
        id: flashSaleProductId,
        price: product.sale_price,
        quantity,
        total: product.sale_price * quantity,
        original_price: product.original_price,
        savings: (product.original_price - product.sale_price) * quantity,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Purchase flash sale product error:", error);
    res.status(500).json({ error: "Failed to purchase product" });
  } finally {
    client.release();
  }
};

// Update flash sale status
exports.updateFlashSaleStatus = async (req, res) => {
  try {
    const { flashSaleId } = req.params;
    const { status } = req.body;

    if (!["scheduled", "active", "ended", "cancelled"].includes(status)) {
      return res.status(400).json({
        error:
          "Invalid status. Must be: scheduled, active, ended, or cancelled",
      });
    }

    const updated = await db.query(
      `UPDATE flash_sales
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, flashSaleId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    // Clear cache
    await redis.del("flash_sales:active");

    res.json({ success: true, flashSale: updated.rows[0] });
  } catch (error) {
    console.error("Update flash sale status error:", error);
    res.status(500).json({ error: "Failed to update flash sale status" });
  }
};

// Get flash sale analytics (Admin/Seller)
exports.getFlashSaleAnalytics = async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    const analytics = await db.query(
      `SELECT 
         fs.title,
         fs.start_time,
         fs.end_time,
         fs.status,
         fs.discount_percentage,
         COUNT(DISTINCT fsp.id) as total_products,
         SUM(fsp.max_quantity) as total_quantity,
         SUM(fsp.sold_quantity) as total_sold,
         CASE 
           WHEN SUM(fsp.max_quantity) > 0 
           THEN ROUND(AVG((fsp.sold_quantity::decimal / fsp.max_quantity) * 100), 2) 
           ELSE 0 
         END as avg_sold_percentage,
         SUM(fsp.sold_quantity * fsp.sale_price) as total_revenue,
         SUM(fsp.sold_quantity * (fsp.original_price - fsp.sale_price)) as total_discount_given
       FROM flash_sales fs
       LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
       WHERE fs.id = $1
       GROUP BY fs.id`,
      [flashSaleId]
    );

    if (analytics.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    // Top performing products
    const topProducts = await db.query(
      `SELECT p.id, p.name, p.images, fsp.sold_quantity, fsp.max_quantity,
              CASE 
                WHEN fsp.max_quantity > 0 
                THEN ROUND((fsp.sold_quantity::decimal / fsp.max_quantity) * 100) 
                ELSE 0 
              END as sold_percentage,
              fsp.sold_quantity * fsp.sale_price as revenue
       FROM flash_sale_products fsp
       JOIN products p ON fsp.product_id = p.id
       WHERE fsp.flash_sale_id = $1
       ORDER BY sold_percentage DESC, revenue DESC
       LIMIT 10`,
      [flashSaleId]
    );

    // Sales over time (hourly breakdown)
    const salesOverTime = await db.query(
      `SELECT 
         DATE_TRUNC('hour', o.created_at) as hour,
         COUNT(DISTINCT o.id) as orders,
         SUM(oi.quantity) as items_sold,
         SUM(oi.quantity * oi.price) as revenue
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN flash_sale_products fsp ON oi.flash_sale_product_id = fsp.id
       WHERE fsp.flash_sale_id = $1
       GROUP BY hour
       ORDER BY hour ASC`,
      [flashSaleId]
    );

    res.json({
      overview: analytics.rows[0],
      topProducts: topProducts.rows,
      salesOverTime: salesOverTime.rows,
    });
  } catch (error) {
    console.error("Get flash sale analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

// Notify users when flash sale starts
exports.notifyFlashSaleStart = async (flashSaleId) => {
  try {
    console.log(`Activating flash sale: ${flashSaleId}`);

    // Update status to active
    await db.query("UPDATE flash_sales SET status = 'active' WHERE id = $1", [
      flashSaleId,
    ]);

    // Get flash sale details
    const flashSale = await db.query(
      "SELECT title, description FROM flash_sales WHERE id = $1",
      [flashSaleId]
    );

    if (flashSale.rows.length === 0) return;

    // Get interested users (those who wishlisted products in this sale)
    const interestedUsers = await db.query(
      `SELECT DISTINCT u.id, u.phone_number, u.full_name
       FROM users u
       JOIN wishlist w ON u.id = w.user_id
       JOIN flash_sale_products fsp ON w.product_id = fsp.product_id
       WHERE fsp.flash_sale_id = $1`,
      [flashSaleId]
    );

    // Send notifications
    const notificationsController = require("./notificationsController");
    for (const user of interestedUsers.rows) {
      await notificationsController.notifyFlashSale(
        user.id,
        flashSaleId,
        `${flashSale.rows[0].title} Started! ⚡`,
        flashSale.rows[0].description || "Limited time only - Shop now!"
      );
    }

    // Clear cache
    await redis.del("flash_sales:active");

    console.log(
      `Flash sale ${flashSaleId} activated. Notified ${interestedUsers.rows.length} users.`
    );
  } catch (error) {
    console.error("Notify flash sale start error:", error);
  }
};

// End expired flash sales
exports.endExpiredFlashSales = async () => {
  try {
    const now = new Date();

    const expired = await db.query(
      `UPDATE flash_sales 
       SET status = 'ended' 
       WHERE status = 'active' 
       AND end_time <= $1
       RETURNING id, title`,
      [now]
    );

    if (expired.rows.length > 0) {
      await redis.del("flash_sales:active");
      console.log(
        `Ended ${expired.rows.length} flash sales:`,
        expired.rows.map((s) => s.title).join(", ")
      );
    }

    return expired.rows.length;
  } catch (error) {
    console.error("End expired flash sales error:", error);
    return 0;
  }
};

// Check and start scheduled flash sales
exports.startScheduledFlashSales = async () => {
  try {
    const now = new Date();

    const toStart = await db.query(
      `SELECT id FROM flash_sales 
       WHERE status = 'scheduled' 
       AND start_time <= $1`,
      [now]
    );

    for (const sale of toStart.rows) {
      await exports.notifyFlashSaleStart(sale.id);
    }

    return toStart.rows.length;
  } catch (error) {
    console.error("Start scheduled flash sales error:", error);
    return 0;
  }
};

// Delete flash sale (Admin only - before it starts)
exports.deleteFlashSale = async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    // Check if flash sale has started
    const flashSale = await db.query(
      "SELECT status, start_time FROM flash_sales WHERE id = $1",
      [flashSaleId]
    );

    if (flashSale.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    if (
      flashSale.rows[0].status !== "scheduled" ||
      new Date(flashSale.rows[0].start_time) <= new Date()
    ) {
      return res.status(400).json({
        error: "Cannot delete flash sale that has started or is active",
      });
    }

    // Delete flash sale (cascade will delete products)
    await db.query("DELETE FROM flash_sales WHERE id = $1", [flashSaleId]);

    res.json({ success: true, message: "Flash sale deleted successfully" });
  } catch (error) {
    console.error("Delete flash sale error:", error);
    res.status(500).json({ error: "Failed to delete flash sale" });
  }
};

module.exports = exports;
