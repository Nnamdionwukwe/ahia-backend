// src/controllers/seasonalSalesController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Get seasonal sale for a specific product
exports.getSeasonalSaleByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || productId === "undefined") {
      return res.json(null);
    }

    const now = new Date();

    const seasonalSale = await db.query(
      `SELECT
        ss.id,
        ss.name,
        ss.description,
        ss.start_time,
        ss.end_time,
        ss.banner_color,
        ssp.sale_price,
        ssp.original_price,
        ssp.max_quantity,
        ssp.sold_quantity,
        (ssp.max_quantity - ssp.sold_quantity) as remaining_quantity,
        ROUND(((ssp.original_price - ssp.sale_price) / ssp.original_price) * 100) as discount_percentage
       FROM seasonal_sales ss
       JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ssp.product_id = $1
         AND ss.start_time <= $2
         AND ss.end_time > $2
       LIMIT 1`,
      [productId, now]
    );

    if (seasonalSale.rows.length === 0) {
      return res.json(null);
    }

    const sale = seasonalSale.rows[0];
    res.json({
      id: sale.id,
      name: sale.name,
      description: sale.description,
      start_time: sale.start_time,
      end_time: sale.end_time,
      banner_color: sale.banner_color,
      sale_price: sale.sale_price,
      original_price: sale.original_price,
      discount_percentage: sale.discount_percentage || 0,
      max_quantity: sale.max_quantity,
      sold_quantity: sale.sold_quantity,
      remaining_quantity: sale.remaining_quantity,
    });
  } catch (error) {
    console.error("Get seasonal sale by product error:", error);
    res.json(null);
  }
};

// Get ALL seasonal sales for a specific product
exports.getAllSeasonalSalesByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || productId === "undefined") {
      return res.json([]);
    }

    const now = new Date();

    const seasonalSales = await db.query(
      `SELECT  
        ss.id,
        ss.name,
        ss.season,
        ss.banner_color,
        ss.start_time,
        ss.end_time,
        ss.is_active = true,
        ssp.sale_price,
        ssp.original_price,
        ssp.max_quantity,
        ssp.sold_quantity,
        (ssp.max_quantity - ssp.sold_quantity) as remaining_quantity,
        ROUND(((ssp.original_price - ssp.sale_price) / ssp.original_price) * 100) as discount_percentage
       FROM seasonal_sales ss
       JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ssp.product_id = $1
         AND ss.end_time > $2
       ORDER BY 
         CASE 
           WHEN ss.start_time <= $2 AND ss.end_time > $2 THEN 1
           WHEN ss.start_time > $2 THEN 2
           ELSE 3
         END,
         ss.start_time ASC`,
      [productId, now]
    );

    res.json(seasonalSales.rows);
  } catch (error) {
    console.error("Get all seasonal sales by product error:", error);
    res.json([]);
  }
};

// Get seasonal sale for a specific product (SEPARATE from flash sales)
exports.getSeasonalSaleByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId || productId === "undefined") {
      return res.json(null);
    }

    const now = new Date();

    const seasonalSale = await db.query(
      `SELECT 
        ss.id,
        ss.name,
        ss.season,
        ss.description,
        ss.start_time,
        ss.end_time,
        ss.banner_color,
        ssp.sale_price,
        ssp.original_price,
        ssp.max_quantity,
        ssp.sold_quantity,
        (ssp.max_quantity - ssp.sold_quantity) as remaining_quantity,
        ROUND(((ssp.original_price - ssp.sale_price) / ssp.original_price) * 100) as discount_percentage
       FROM seasonal_sales ss
       JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ssp.product_id = $1
         AND ss.start_time <= $2
         AND ss.end_time > $2
       LIMIT 1`,
      [productId, now]
    );

    if (seasonalSale.rows.length === 0) {
      return res.json(null);
    }

    const sale = seasonalSale.rows[0];
    res.json({
      id: sale.id,
      name: sale.name,
      season: sale.season,
      description: sale.description,
      start_time: sale.start_time,
      end_time: sale.end_time,
      banner_color: sale.banner_color,
      sale_price: sale.sale_price,
      original_price: sale.original_price,
      discount_percentage: sale.discount_percentage,
      sold_quantity: sale.sold_quantity,
      remaining_quantity: sale.remaining_quantity,
    });
  } catch (error) {
    console.error("Get seasonal sale by product error:", error);
    res.json(null);
  }
};

// Get all active seasonal sales (for homepage)
exports.getActiveSeasonalSales = async (req, res) => {
  try {
    const cacheKey = "seasonal_sales:active";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const now = new Date();

    const seasonalSales = await db.query(
      `SELECT 
        ss.id,
        ss.name,
        ss.season,
        ss.description,
        ss.start_time,
        ss.end_time,
        ss.banner_color,
        ss.created_at,
        COUNT(ssp.id) as total_products,
        SUM(ssp.sold_quantity) as total_sold,
        SUM(ssp.max_quantity) as total_quantity
       FROM seasonal_sales ss
       LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ss.start_time <= $1
         AND ss.end_time > $1
       GROUP BY ss.id
       ORDER BY ss.created_at DESC`,
      [now]
    );

    if (seasonalSales.rows.length === 0) {
      return res.json({ seasonalSales: [] });
    }

    const result = { seasonalSales: seasonalSales.rows };
    await redis.setex(cacheKey, 60, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get active seasonal sales error:", error);
    res.status(500).json({
      error: "Failed to fetch seasonal sales",
      details: error.message,
    });
  }
};

// Get all seasonal sales (with status filter for list view)
exports.getAllSeasonalSales = async (req, res) => {
  try {
    const { status } = req.query;
    const cacheKey = `seasonal_sales:list:${status || "all"}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const now = new Date();
    let query = `
      SELECT ss.*, 
             COUNT(ssp.id) as total_products,
             SUM(ssp.sold_quantity) as total_sold,
             SUM(ssp.max_quantity) as total_quantity
      FROM seasonal_sales ss
      LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
      WHERE 1=1
    `;

    const params = [now];

    if (status === "active") {
      query += ` AND ss.start_time <= $1 AND ss.end_time > $1`;
    } else if (status === "upcoming") {
      query += ` AND ss.start_time > $1`;
    } else if (status === "ended") {
      query += ` AND ss.end_time <= $1`;
    }

    query += ` GROUP BY ss.id ORDER BY ss.start_time DESC`;

    const seasonalSales = await db.query(query, params);

    // Calculate time information
    for (const sale of seasonalSales.rows) {
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

    const result = { seasonalSales: seasonalSales.rows };
    await redis.setex(cacheKey, 120, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get all seasonal sales error:", error);
    res.status(500).json({ error: "Failed to fetch seasonal sales" });
  }
};

// Get all active seasonal sales (for homepage)
exports.getActiveSeasonalSales = async (req, res) => {
  try {
    const cacheKey = "seasonal_sales:active";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const now = new Date();

    const seasonalSales = await db.query(
      `SELECT 
        ss.id,
        ss.name,
        ss.description,
        ss.start_time,
        ss.end_time,
        ss.banner_color,
        ss.created_at,
        COUNT(ssp.id) as total_products,
        SUM(ssp.sold_quantity) as total_sold,
        SUM(ssp.max_quantity) as total_quantity
       FROM seasonal_sales ss
       LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ss.start_time <= $1
         AND ss.end_time > $1
       GROUP BY ss.id
       ORDER BY ss.created_at DESC`,
      [now]
    );

    if (seasonalSales.rows.length === 0) {
      return res.json({ seasonalSales: [] });
    }

    const result = { seasonalSales: seasonalSales.rows };
    await redis.setex(cacheKey, 60, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get active seasonal sales error:", error);
    res.status(500).json({
      error: "Failed to fetch seasonal sales",
      details: error.message,
    });
  }
};

// Get seasonal sale by ID
// exports.getSeasonalSaleById = async (req, res) => {
//   try {
//     const { saleId } = req.params;

//     if (!saleId || saleId === "undefined") {
//       return res.status(400).json({ error: "Valid sale ID is required" });
//     }

//     const cacheKey = `seasonal_sale:${saleId}`;
//     const cached = await redis.get(cacheKey);

//     if (cached) {
//       return res.json(JSON.parse(cached));
//     }

//     const seasonalSale = await db.query(
//       `SELECT
//         ss.*,
//         COUNT(ssp.id) as total_products,
//         SUM(ssp.sold_quantity) as total_sold,
//         SUM(ssp.max_quantity) as total_quantity
//        FROM seasonal_sales ss
//        LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
//        WHERE ss.id = $1
//        GROUP BY ss.id`,
//       [saleId]
//     );

//     if (seasonalSale.rows.length === 0) {
//       return res.status(404).json({ error: "Seasonal sale not found" });
//     }

//     const sale = seasonalSale.rows[0];
//     const now = new Date();

//     const result = {
//       seasonalSale: {
//         ...sale,
//         time_remaining_seconds: Math.max(
//           0,
//           Math.floor((new Date(sale.end_time) - now) / 1000)
//         ),
//       },
//     };

//     await redis.setex(cacheKey, 60, JSON.stringify(result));
//     res.json(result);
//   } catch (error) {
//     console.error("Get seasonal sale error:", error);
//     res.status(500).json({
//       error: "Failed to fetch seasonal sale",
//       details: error.message,
//     });
//   }
// };

exports.getSeasonalSaleById = async (req, res) => {
  try {
    const { saleId } = req.params;

    if (!saleId || saleId === "undefined") {
      return res.status(400).json({ error: "Valid sale ID is required" });
    }

    const cacheKey = `seasonal_sale:${saleId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const seasonalSale = await db.query(
      `SELECT 
        ss.*,
        COUNT(ssp.id) as total_products,
        SUM(ssp.sold_quantity) as total_sold,
        SUM(ssp.max_quantity) as total_quantity
       FROM seasonal_sales ss
       LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ss.id = $1
       GROUP BY ss.id`,
      [saleId]
    );

    if (seasonalSale.rows.length === 0) {
      return res.status(404).json({ error: "Seasonal sale not found" });
    }

    const sale = seasonalSale.rows[0];
    const now = new Date();

    const result = {
      seasonalSale: {
        ...sale,
        time_remaining_seconds: Math.max(
          0,
          Math.floor((new Date(sale.end_time) - now) / 1000)
        ),
      },
    };

    await redis.setex(cacheKey, 60, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error("Get seasonal sale error:", error);
    res.status(500).json({
      error: "Failed to fetch seasonal sale",
      details: error.message,
    });
  }
};

// Get products for a specific seasonal sale
// Update getSeasonalSaleProducts function in seasonalSalesController.js

exports.getSeasonalSaleProducts = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { page = 1, limit = 20, sort = "popularity" } = req.query;

    if (!saleId || saleId === "undefined") {
      return res.status(400).json({ error: "Valid sale ID is required" });
    }

    const cacheKey = `seasonal_sale:${saleId}:products:${page}:${limit}:${sort}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Verify seasonal sale exists
    const saleCheck = await db.query(
      "SELECT id, name, season, start_time, end_time FROM seasonal_sales WHERE id = $1",
      [saleId]
    );

    if (saleCheck.rows.length === 0) {
      return res.status(404).json({ error: "Seasonal sale not found" });
    }

    const seasonalSale = saleCheck.rows[0];

    // Determine sort order
    let orderBy = "ssp.sold_quantity DESC, p.name ASC";
    if (sort === "price_asc") {
      orderBy = "ssp.sale_price ASC";
    } else if (sort === "price_desc") {
      orderBy = "ssp.sale_price DESC";
    } else if (sort === "rating") {
      orderBy = "p.rating DESC";
    } else if (sort === "discount") {
      orderBy = "(ssp.original_price - ssp.sale_price) DESC";
    } else if (sort === "stock") {
      orderBy = "(ssp.max_quantity - ssp.sold_quantity) DESC";
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM seasonal_sale_products WHERE seasonal_sale_id = $1`,
      [saleId]
    );

    const total = parseInt(countResult.rows[0].total);

    // ✅ Get products with ALL necessary fields including season
    const products = await db.query(
      `SELECT 
        p.id,
        p.name,
        p.images,
        p.rating,
        p.category,
        p.brand,
        p.total_reviews,
        ss.season,
        ss.name as sale_name,
        ss.banner_color,
        ssp.sale_price,
        ssp.original_price,
        ssp.max_quantity,
        ssp.sold_quantity,
        (ssp.max_quantity - ssp.sold_quantity) as remaining_quantity,
        CASE 
          WHEN ssp.max_quantity > 0 
          THEN ROUND((ssp.sold_quantity::decimal / ssp.max_quantity) * 100)
          ELSE 0
        END as sold_percentage,
        ROUND(((ssp.original_price - ssp.sale_price) / ssp.original_price) * 100) as discount_percentage
       FROM seasonal_sale_products ssp
       JOIN products p ON ssp.product_id = p.id
       JOIN seasonal_sales ss ON ssp.seasonal_sale_id = ss.id
       WHERE ssp.seasonal_sale_id = $1
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [saleId, limit, offset]
    );

    const result = {
      seasonalSale: {
        id: seasonalSale.id,
        name: seasonalSale.name,
        season: seasonalSale.season,
        start_time: seasonalSale.start_time,
        end_time: seasonalSale.end_time,
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
    console.error("Get seasonal sale products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// exports.getSeasonalSaleProducts = async (req, res) => {
//   try {
//     const { saleId } = req.params;
//     const { page = 1, limit = 20, sort = "popularity" } = req.query;

//     if (!saleId || saleId === "undefined") {
//       return res.status(400).json({ error: "Valid sale ID is required" });
//     }

//     const cacheKey = `seasonal_sale:${saleId}:products:${page}:${limit}:${sort}`;
//     const cached = await redis.get(cacheKey);

//     if (cached) {
//       return res.json(JSON.parse(cached));
//     }

//     // Verify seasonal sale exists
//     const saleCheck = await db.query(
//       "SELECT id, name, start_time, end_time FROM seasonal_sales WHERE id = $1",
//       [saleId]
//     );

//     if (saleCheck.rows.length === 0) {
//       return res.status(404).json({ error: "Seasonal sale not found" });
//     }

//     const seasonalSale = saleCheck.rows[0];

//     // Determine sort order
//     let orderBy = "ssp.sold_quantity DESC, p.name ASC";
//     if (sort === "price_asc") {
//       orderBy = "ssp.sale_price ASC";
//     } else if (sort === "price_desc") {
//       orderBy = "ssp.sale_price DESC";
//     } else if (sort === "rating") {
//       orderBy = "p.rating DESC";
//     } else if (sort === "discount") {
//       orderBy = "(ssp.original_price - ssp.sale_price) DESC";
//     } else if (sort === "stock") {
//       orderBy = "(ssp.max_quantity - ssp.sold_quantity) DESC";
//     }

//     const offset = (parseInt(page) - 1) * parseInt(limit);

//     // Get total count
//     const countResult = await db.query(
//       `SELECT COUNT(*) as total FROM seasonal_sale_products WHERE seasonal_sale_id = $1`,
//       [saleId]
//     );

//     const total = parseInt(countResult.rows[0].total);

//     // Get products
//     const products = await db.query(
//       `SELECT
//         p.id,
//         p.name,
//         p.images,
//         p.rating,
//         p.category,
//         ss.season,
//         ss.name as sale_name,
//         ssp.sale_price,
//         ssp.original_price,
//         ssp.max_quantity,
//         ssp.sold_quantity,
//         (ssp.max_quantity - ssp.sold_quantity) as remaining_quantity,
//         CASE
//           WHEN ssp.max_quantity > 0
//           THEN ROUND((ssp.sold_quantity::decimal / ssp.max_quantity) * 100)
//           ELSE 0
//         END as sold_percentage,
//         ROUND(((ssp.original_price - ssp.sale_price) / ssp.original_price) * 100) as discount_percentage
//        FROM seasonal_sale_products ssp
//        JOIN products p ON ssp.product_id = p.id
//        JOIN seasonal_sales ss ON ssp.seasonal_sale_id = ss.id
//        WHERE ssp.seasonal_sale_id = $1
//        ORDER BY ${orderBy}
//        LIMIT $2 OFFSET $3`,
//       [saleId, limit, offset]
//     );

//     const result = {
//       seasonalSale: {
//         id: seasonalSale.id,
//         name: seasonalSale.name,
//         start_time: seasonalSale.start_time,
//         end_time: seasonalSale.end_time,
//       },
//       products: products.rows,
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total,
//         pages: Math.ceil(total / parseInt(limit)),
//       },
//     };

//     await redis.setex(cacheKey, 60, JSON.stringify(result));
//     res.json(result);
//   } catch (error) {
//     console.error("Get seasonal sale products error:", error);
//     res.status(500).json({ error: "Failed to fetch products" });
//   }
// };

// Add these functions to your existing seasonalSalesController.js

// Create seasonal sale (Admin only)
exports.createSeasonalSale = async (req, res) => {
  try {
    const {
      name,
      season,
      description,
      startTime,
      endTime,
      discountPercentage,
      bannerColor,
      productIds,
    } = req.body;

    // Validation
    if (!name || !season || !startTime || !endTime || !discountPercentage) {
      return res.status(400).json({
        error:
          "Missing required fields: name, season, startTime, endTime, discountPercentage",
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

    // Create seasonal sale
    const seasonalSale = await db.query(
      `INSERT INTO seasonal_sales (
        name, season, description, start_time, end_time, 
        discount_percentage, banner_color, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *`,
      [
        name,
        season,
        description || null,
        startTime,
        endTime,
        discountPercentage,
        bannerColor || null,
      ]
    );

    const saleId = seasonalSale.rows[0].id;

    // Add products to seasonal sale (if provided)
    let addedProducts = [];
    if (Array.isArray(productIds) && productIds.length > 0) {
      for (const productId of productIds) {
        try {
          // Get product details
          const product = await db.query(
            "SELECT id, price FROM products WHERE id = $1",
            [productId]
          );

          if (product.rows.length > 0) {
            const salePrice =
              product.rows[0].price * (1 - discountPercentage / 100);

            const addedProduct = await db.query(
              `INSERT INTO seasonal_sale_products (
                seasonal_sale_id, product_id, original_price, 
                sale_price, max_quantity, sold_quantity, created_at
              )
              VALUES ($1, $2, $3, $4, $5, 0, NOW())
              RETURNING *`,
              [
                saleId,
                productId,
                product.rows[0].price,
                salePrice,
                100, // Default max quantity
              ]
            );

            addedProducts.push(addedProduct.rows[0]);
          }
        } catch (err) {
          console.error(`Error adding product ${productId} to sale:`, err);
        }
      }
    }

    // Clear cache
    await redis.del("seasonal_sales:active");
    await redis.del("seasonal_sales:list:*");

    res.status(201).json({
      success: true,
      seasonalSale: seasonalSale.rows[0],
      products: addedProducts,
      message: `Seasonal sale created with ${addedProducts.length} products`,
    });
  } catch (error) {
    console.error("Create seasonal sale error:", error);
    res.status(500).json({
      error: "Failed to create seasonal sale",
      details: error.message,
    });
  }
};

// Update seasonal sale status (Admin only)
exports.updateSeasonalSaleStatus = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { status } = req.body;

    if (!saleId || saleId === "undefined") {
      return res.status(400).json({ error: "Valid sale ID is required" });
    }

    if (!["active", "paused", "ended", "cancelled"].includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be: active, paused, ended, or cancelled",
      });
    }

    const updated = await db.query(
      `UPDATE seasonal_sales 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status, saleId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Seasonal sale not found" });
    }

    // Clear caches
    await redis.del("seasonal_sales:active");
    await redis.del("seasonal_sales:list:*");
    await redis.del(`seasonal_sale:${saleId}`);

    res.json({
      success: true,
      seasonalSale: updated.rows[0],
      message: `Seasonal sale status updated to ${status}`,
    });
  } catch (error) {
    console.error("Update seasonal sale status error:", error);
    res.status(500).json({
      error: "Failed to update seasonal sale status",
      details: error.message,
    });
  }
};

// Delete seasonal sale (Admin only)
exports.deleteSeasonalSale = async (req, res) => {
  try {
    const { saleId } = req.params;

    if (!saleId || saleId === "undefined") {
      return res.status(400).json({ error: "Valid sale ID is required" });
    }

    // Verify sale exists
    const sale = await db.query(
      "SELECT id, status, start_time FROM seasonal_sales WHERE id = $1",
      [saleId]
    );

    if (sale.rows.length === 0) {
      return res.status(404).json({ error: "Seasonal sale not found" });
    }

    // Prevent deletion if sale has started (optional check)
    if (new Date(sale.rows[0].start_time) <= new Date()) {
      return res.status(400).json({
        error: "Cannot delete a seasonal sale that has already started",
      });
    }

    // Delete associated products first
    await db.query(
      "DELETE FROM seasonal_sale_products WHERE seasonal_sale_id = $1",
      [saleId]
    );

    // Delete the seasonal sale
    await db.query("DELETE FROM seasonal_sales WHERE id = $1", [saleId]);

    // Clear caches
    await redis.del("seasonal_sales:active");
    await redis.del("seasonal_sales:list:*");
    await redis.del(`seasonal_sale:${saleId}`);

    res.json({
      success: true,
      message: "Seasonal sale deleted successfully",
      saleId,
    });
  } catch (error) {
    console.error("Delete seasonal sale error:", error);
    res.status(500).json({
      error: "Failed to delete seasonal sale",
      details: error.message,
    });
  }
};

module.exports = exports;
