// src/controllers/flashSalesController.js
// COMPLETE VERSION - MATCHES YOUR EXACT DATABASE SCHEMA
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Get active flash sales WITH products (for homepage)
exports.getActiveFlashSales = async (req, res) => {
  try {
    const cacheKey = "flash_sales:active";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const now = new Date();

    // Get active flash sales
    const flashSales = await db.query(
      `SELECT 
        id,
        title,
        description,
        start_time,
        end_time,
        discount_percentage,
        status,
        created_at
       FROM flash_sales
       WHERE status = 'active'
         AND start_time <= $1
         AND end_time > $1
       ORDER BY created_at DESC`,
      [now]
    );

    if (flashSales.rows.length === 0) {
      return res.json({ flashSales: [] });
    }

    // Get products for each flash sale with all necessary fields
    const flashSalesWithProducts = await Promise.all(
      flashSales.rows.map(async (sale) => {
        const products = await db.query(
          `SELECT 
            p.id,
            p.name,
            p.images,
            p.rating,
            p.category,
            p.brand,
            fsp.id as flash_sale_product_id,
            fsp.sale_price,
            fsp.original_price,
            fsp.max_quantity,
            fsp.sold_quantity,
            (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
            CASE 
              WHEN fsp.max_quantity > 0 
              THEN ROUND((fsp.sold_quantity::decimal / fsp.max_quantity) * 100)
              ELSE 0
            END as sold_percentage,
            ROUND(((fsp.original_price - fsp.sale_price) / fsp.original_price) * 100) as discount_percentage,
            pv.id as variant_id,
            pv.id as product_variant_id
           FROM flash_sale_products fsp
           JOIN products p ON fsp.product_id = p.id
           LEFT JOIN product_variants pv ON pv.product_id = p.id
           WHERE fsp.flash_sale_id = $1
             AND (fsp.max_quantity - fsp.sold_quantity) > 0
           ORDER BY fsp.sold_quantity DESC
           LIMIT 10`,
          [sale.id]
        );

        return {
          id: sale.id,
          title: sale.title,
          description: sale.description,
          start_time: sale.start_time,
          end_time: sale.end_time,
          discount_percentage: sale.discount_percentage,
          status: sale.status,
          products: products.rows,
          time_remaining_seconds: Math.max(
            0,
            Math.floor((new Date(sale.end_time) - now) / 1000)
          ),
        };
      })
    );

    const result = { flashSales: flashSalesWithProducts };

    // Cache for 1 minute
    await redis.setex(cacheKey, 60, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get active flash sales error:", error);
    res.status(500).json({
      error: "Failed to fetch flash sales",
      details: error.message,
    });
  }
};

// Get all flash sales (list view)
exports.getAllFlashSales = async (req, res) => {
  try {
    const { status } = req.query;
    const cacheKey = `flash_sales:list:${status || "all"}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const now = new Date();
    let query = `
      SELECT fs.*, 
             COUNT(fsp.id) as total_products,
             SUM(fsp.sold_quantity) as total_sold,
             SUM(fsp.max_quantity) as total_quantity
      FROM flash_sales fs
      LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
      WHERE 1=1
    `;

    const params = [now];

    if (status === "active") {
      query += ` AND fs.start_time <= $1 AND fs.end_time > $1 AND fs.status = 'active'`;
    } else if (status === "upcoming" || status === "scheduled") {
      query += ` AND fs.start_time > $1 AND fs.status = 'scheduled'`;
    } else if (status === "ended") {
      query += ` AND (fs.end_time <= $1 OR fs.status = 'ended')`;
    }

    query += ` GROUP BY fs.id ORDER BY fs.start_time DESC`;

    const flashSales = await db.query(query, params);

    // Calculate time information
    for (const sale of flashSales.rows) {
      if (new Date(sale.start_time) > now) {
        sale.starts_in_seconds = Math.floor(
          (new Date(sale.start_time) - now) / 1000
        );
      } else if (new Date(sale.end_time) > now) {
        sale.time_remaining_seconds = Math.floor(
          (new Date(sale.end_time) - now) / 1000
        );
      }
    }

    const result = { flashSales: flashSales.rows };
    await redis.setex(cacheKey, 120, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get all flash sales error:", error);
    res.status(500).json({ error: "Failed to fetch flash sales" });
  }
};

// Get upcoming flash sales
exports.getUpcomingFlashSales = async (req, res) => {
  try {
    const now = new Date();

    const upcoming = await db.query(
      `SELECT 
        id,
        title,
        description,
        start_time,
        end_time,
        discount_percentage,
        status
       FROM flash_sales
       WHERE start_time > $1
         AND status = 'scheduled'
       ORDER BY start_time ASC
       LIMIT 10`,
      [now]
    );

    const upcomingWithTime = upcoming.rows.map((sale) => ({
      ...sale,
      starts_in_seconds: Math.floor((new Date(sale.start_time) - now) / 1000),
    }));

    res.json({ upcomingSales: upcomingWithTime });
  } catch (error) {
    console.error("Get upcoming flash sales error:", error);
    res.status(500).json({ error: "Failed to fetch upcoming sales" });
  }
};

// Get specific flash sale by ID with products
exports.getFlashSaleById = async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    if (!flashSaleId || flashSaleId === "undefined") {
      return res.status(400).json({ error: "Valid flash sale ID is required" });
    }

    const cacheKey = `flash_sale:${flashSaleId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get flash sale
    const flashSale = await db.query(
      `SELECT * FROM flash_sales WHERE id = $1`,
      [flashSaleId]
    );

    if (flashSale.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    const sale = flashSale.rows[0];

    // Get products with all fields
    const products = await db.query(
      `SELECT 
        p.id,
        p.name,
        p.description,
        p.images,
        p.rating,
        p.category,
        p.brand,
        fsp.id as flash_sale_product_id,
        fsp.sale_price,
        fsp.original_price,
        fsp.max_quantity,
        fsp.sold_quantity,
        (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
        CASE 
          WHEN fsp.max_quantity > 0 
          THEN ROUND((fsp.sold_quantity::decimal / fsp.max_quantity) * 100)
          ELSE 0
        END as sold_percentage,
        ROUND(((fsp.original_price - fsp.sale_price) / fsp.original_price) * 100) as discount_percentage,
        pv.id as variant_id,
        pv.id as product_variant_id,
        pv.stock_quantity
       FROM flash_sale_products fsp
       JOIN products p ON fsp.product_id = p.id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       WHERE fsp.flash_sale_id = $1
       ORDER BY fsp.sold_quantity DESC`,
      [flashSaleId]
    );

    const now = new Date();
    const result = {
      flashSale: {
        ...sale,
        products: products.rows,
        time_remaining_seconds: Math.max(
          0,
          Math.floor((new Date(sale.end_time) - now) / 1000)
        ),
      },
    };

    await redis.setex(cacheKey, 60, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error("Get flash sale error:", error);
    res.status(500).json({
      error: "Failed to fetch flash sale",
      details: error.message,
    });
  }
};

// Get products for a specific flash sale
exports.getFlashSaleProducts = async (req, res) => {
  try {
    const { flashSaleId } = req.params;
    const { page = 1, limit = 20, sort = "popularity" } = req.query;

    if (!flashSaleId || flashSaleId === "undefined") {
      return res.status(400).json({ error: "Valid flash sale ID is required" });
    }

    const cacheKey = `flash_sale:${flashSaleId}:products:${page}:${limit}:${sort}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Verify flash sale exists
    const saleCheck = await db.query(
      "SELECT id, title, status, start_time, end_time FROM flash_sales WHERE id = $1",
      [flashSaleId]
    );

    if (saleCheck.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    const flashSale = saleCheck.rows[0];

    // Determine sort order
    let orderBy = "sold_percentage DESC, p.name ASC";
    if (sort === "price_asc") {
      orderBy = "fsp.sale_price ASC";
    } else if (sort === "price_desc") {
      orderBy = "fsp.sale_price DESC";
    } else if (sort === "discount") {
      orderBy = "(fsp.original_price - fsp.sale_price) DESC";
    } else if (sort === "stock") {
      orderBy = "remaining_quantity DESC";
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM flash_sale_products WHERE flash_sale_id = $1`,
      [flashSaleId]
    );

    const total = parseInt(countResult.rows[0].total);

    // Get products
    const products = await db.query(
      `SELECT 
        p.id,
        p.name,
        p.images,
        p.rating,
        p.category,
        fsp.id as flash_sale_product_id,
        fsp.sale_price,
        fsp.original_price,
        fsp.max_quantity,
        fsp.sold_quantity,
        (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
        CASE 
          WHEN fsp.max_quantity > 0 
          THEN ROUND((fsp.sold_quantity::decimal / fsp.max_quantity) * 100)
          ELSE 0
        END as sold_percentage,
        ROUND(((fsp.original_price - fsp.sale_price) / fsp.original_price) * 100) as discount_percent,
        pv.id as variant_id
       FROM flash_sale_products fsp
       JOIN products p ON fsp.product_id = p.id
       LEFT JOIN product_variants pv ON pv.product_id = p.id
       WHERE fsp.flash_sale_id = $1
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [flashSaleId, limit, offset]
    );

    const result = {
      flashSale: {
        id: flashSale.id,
        title: flashSale.title,
        status: flashSale.status,
        start_time: flashSale.start_time,
        end_time: flashSale.end_time,
      },
      products: products.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    };

    await redis.setex(cacheKey, 60, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error("Get flash sale products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// Legacy support
exports.getFlashSaleDetails = async (req, res) => {
  return exports.getFlashSaleById(req, res);
};

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

    // Add products
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

    // Clear caches
    await redis.del("flash_sales:active");
    await redis.del("flash_sales:list:*");

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

// Update flash sale status
exports.updateFlashSaleStatus = async (req, res) => {
  try {
    const { flashSaleId } = req.params;
    const { status } = req.body;

    if (!flashSaleId || flashSaleId === "undefined") {
      return res.status(400).json({ error: "Valid flash sale ID is required" });
    }

    if (!["scheduled", "active", "ended", "cancelled"].includes(status)) {
      return res.status(400).json({
        error:
          "Invalid status. Must be: scheduled, active, ended, or cancelled",
      });
    }

    const updated = await db.query(
      `UPDATE flash_sales SET status = $1 WHERE id = $2 RETURNING *`,
      [status, flashSaleId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Flash sale not found" });
    }

    // Clear caches
    await redis.del("flash_sales:active");
    await redis.del("flash_sales:list:*");
    await redis.del(`flash_sale:${flashSaleId}`);

    res.json({ success: true, flashSale: updated.rows[0] });
  } catch (error) {
    console.error("Update flash sale status error:", error);
    res.status(500).json({ error: "Failed to update flash sale status" });
  }
};

// Delete flash sale
exports.deleteFlashSale = async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    if (!flashSaleId || flashSaleId === "undefined") {
      return res.status(400).json({ error: "Valid flash sale ID is required" });
    }

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

    await db.query("DELETE FROM flash_sales WHERE id = $1", [flashSaleId]);

    // Clear caches
    await redis.del("flash_sales:list:*");
    await redis.del(`flash_sale:${flashSaleId}`);

    res.json({ success: true, message: "Flash sale deleted successfully" });
  } catch (error) {
    console.error("Delete flash sale error:", error);
    res.status(500).json({ error: "Failed to delete flash sale" });
  }
};

// Get flash sale analytics
exports.getFlashSaleAnalytics = async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    if (!flashSaleId || flashSaleId === "undefined") {
      return res.status(400).json({ error: "Valid flash sale ID is required" });
    }

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

    res.json({
      overview: analytics.rows[0],
      topProducts: topProducts.rows,
    });
  } catch (error) {
    console.error("Get flash sale analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

// Add this function to flashSalesController.js (before module.exports)

// Get flash sale for a specific product
exports.getFlashSaleByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || productId === "undefined") {
      return res.json(null);
    }

    const now = new Date();

    const flashSale = await db.query(
      `SELECT 
        fs.id,
        fs.title,
        fs.description,
        fs.start_time,
        fs.end_time,
        fs.status,
        fsp.sale_price,
        fsp.original_price,
        fsp.max_quantity,
        fsp.sold_quantity,
        (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
        ROUND(((fsp.original_price - fsp.sale_price) / fsp.original_price) * 100) as discount_percentage
       FROM flash_sales fs
       JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
       WHERE fsp.product_id = $1
         AND fs.status = 'active'
         AND fs.start_time <= $2
         AND fs.end_time > $2
       LIMIT 1`,
      [productId, now]
    );

    if (flashSale.rows.length === 0) {
      return res.json(null);
    }

    const sale = flashSale.rows[0];
    res.json({
      id: sale.id,
      title: sale.title,
      description: sale.description,
      start_time: sale.start_time,
      end_time: sale.end_time,
      discount_percentage: sale.discount_percentage,
      status: sale.status,
      sale_price: sale.sale_price,
      original_price: sale.original_price,
      sold_quantity: sale.sold_quantity,
      remaining_quantity: sale.remaining_quantity,
    });
  } catch (error) {
    console.error("Get flash sale by product error:", error);
    res.json(null);
  }
};

module.exports = exports;

module.exports = exports;
