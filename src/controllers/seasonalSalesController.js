// src/controllers/seasonalSalesController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

/**
 * Get all active seasonal sales
 * GET /api/seasonal-sales/active
 */
exports.getActiveSeasonalSales = async (req, res) => {
  try {
    const query = `
      SELECT 
        id,
        name,
        season,
        description,
        discount_percentage,
        banner_color,
        start_time,
        end_time,
        status
      FROM seasonal_sales
      WHERE status = 'active' 
        AND end_time > NOW()
      ORDER BY start_time DESC
    `;

    const result = await db.query(query);
    const seasonalSales = result.rows || [];

    res.json({
      seasonalSales,
      total: seasonalSales.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching active seasonal sales:", error);
    res.status(500).json({
      error: "Failed to fetch active seasonal sales",
      message: error.message,
    });
  }
};

/**
 * Get seasonal sale by ID
 * GET /api/seasonal-sales/:saleId
 */
exports.getSeasonalSaleById = async (req, res) => {
  try {
    const { saleId } = req.params;

    const query = `
      SELECT 
        id,
        name,
        season,
        description,
        discount_percentage,
        banner_color,
        start_time,
        end_time,
        status,
        created_at,
        updated_at
      FROM seasonal_sales
      WHERE id = $1
    `;

    const result = await db.query(query, [saleId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Seasonal sale not found",
        saleId,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching seasonal sale:", error);
    res.status(500).json({
      error: "Failed to fetch seasonal sale",
      message: error.message,
    });
  }
};

/**
 * Get products for a specific seasonal sale
 * GET /api/seasonal-sales/:saleId/products
 */
exports.getSeasonalSaleProducts = async (req, res) => {
  try {
    const { saleId } = req.params;
    const limit = parseInt(req.query.limit) || 12;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    // First, verify the seasonal sale exists
    const saleQuery = `
      SELECT id FROM seasonal_sales WHERE id = $1
    `;
    const saleResult = await db.query(saleQuery, [saleId]);

    if (saleResult.rows.length === 0) {
      return res.status(404).json({
        error: "Seasonal sale not found",
        saleId,
      });
    }

    // Get products associated with this seasonal sale
    const productsQuery = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.original_price,
        p.image_url,
        p.category,
        p.stock,
        p.rating,
        p.reviews_count,
        COALESCE(ss.discount_percentage, 0) as discount_percentage
      FROM products p
      JOIN seasonal_sale_products ssp ON p.id = ssp.product_id
      JOIN seasonal_sales ss ON ssp.seasonal_sale_id = ss.id
      WHERE ss.id = $1
      ORDER BY p.rating DESC, p.reviews_count DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(productsQuery, [saleId, limit, offset]);
    const products = result.rows || [];

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      JOIN seasonal_sale_products ssp ON p.id = ssp.product_id
      WHERE ssp.seasonal_sale_id = $1
    `;
    const countResult = await db.query(countQuery, [saleId]);
    const total = parseInt(countResult.rows[0]?.total || 0);

    res.json({
      products,
      saleId: parseInt(saleId),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching seasonal sale products:", error);
    res.status(500).json({
      error: "Failed to fetch seasonal sale products",
      message: error.message,
    });
  }
};

/**
 * Get seasonal sale by product ID
 * GET /api/seasonal-sales/product/:productId
 */
exports.getSeasonalSaleByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    const query = `
      SELECT 
        ss.id,
        ss.name,
        ss.season,
        ss.description,
        ss.discount_percentage,
        ss.banner_color,
        ss.start_time,
        ss.end_time,
        ss.status
      FROM seasonal_sales ss
      JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
      WHERE ssp.product_id = $1
        AND ss.status = 'active'
        AND ss.end_time > NOW()
      ORDER BY ss.start_time DESC
    `;

    const result = await db.query(query, [productId]);
    const seasonalSales = result.rows || [];

    res.json({
      productId: parseInt(productId),
      seasonalSales,
      total: seasonalSales.length,
    });
  } catch (error) {
    console.error("Error fetching seasonal sales by product:", error);
    res.status(500).json({
      error: "Failed to fetch seasonal sales for product",
      message: error.message,
    });
  }
};

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
