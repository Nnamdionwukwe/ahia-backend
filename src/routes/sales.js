const express = require("express");
const router = express.Router();
const db = require("../config/database");

// Get active seasonal sale for a product
router.get("/seasonal-sales/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await db.query(
      `
      SELECT 
        ss.id,
        ss.name,
        ss.season,
        ss.description,
        ss.start_time,
        ss.end_time,
        ss.discount_percentage,
        ss.banner_color,
        ssp.sale_price
      FROM seasonal_sales ss
      JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
      WHERE ssp.product_id = $1
        AND ss.is_active = TRUE
        AND NOW() BETWEEN ss.start_time AND ss.end_time
      ORDER BY ss.end_time ASC
      LIMIT 1
    `,
      [productId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching seasonal sale:", error);
    res.status(500).json({ error: "Failed to fetch seasonal sale" });
  }
});

// Get active flash sale for a product
router.get("/flash-sales/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await db.query(
      `
      SELECT 
        fs.id,
        fs.title,
        fs.description,
        fs.start_time,
        fs.end_time,
        fs.discount_percentage,
        fs.status,
        fsp.sale_price,
        fsp.original_price,
        fsp.sold_quantity,
        fsp.max_quantity,
        (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity
      FROM flash_sales fs
      JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
      WHERE fsp.product_id = $1
        AND fs.status = 'active'
        AND NOW() BETWEEN fs.start_time AND fs.end_time
      ORDER BY fs.end_time ASC
      LIMIT 1
    `,
      [productId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching flash sale:", error);
    res.status(500).json({ error: "Failed to fetch flash sale" });
  }
});

// Get all active seasonal sales
router.get("/seasonal-sales/active", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ss.*,
        COUNT(ssp.product_id) as product_count
      FROM seasonal_sales ss
      LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
      WHERE ss.is_active = TRUE
        AND NOW() BETWEEN ss.start_time AND ss.end_time
      GROUP BY ss.id
      ORDER BY ss.end_time ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching active seasonal sales:", error);
    res.status(500).json({ error: "Failed to fetch seasonal sales" });
  }
});

// Get all active flash sales
router.get("/flash-sales/active", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        fs.*,
        COUNT(fsp.product_id) as product_count,
        SUM(fsp.sold_quantity) as total_sold,
        SUM(fsp.max_quantity) as total_available
      FROM flash_sales fs
      LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
      WHERE fs.status = 'active'
        AND NOW() BETWEEN fs.start_time AND fs.end_time
      GROUP BY fs.id
      ORDER BY fs.end_time ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching active flash sales:", error);
    res.status(500).json({ error: "Failed to fetch flash sales" });
  }
});

// Get products in a seasonal sale
router.get("/seasonal-sales/:saleId/products", async (req, res) => {
  try {
    const { saleId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `
      SELECT 
        p.*,
        ssp.sale_price,
        ss.discount_percentage as sale_discount
      FROM seasonal_sale_products ssp
      JOIN products p ON ssp.product_id = p.id
      JOIN seasonal_sales ss ON ssp.seasonal_sale_id = ss.id
      WHERE ssp.seasonal_sale_id = $1
        AND p.stock_quantity > 0
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [saleId, limit, offset]
    );

    const countResult = await db.query(
      `
      SELECT COUNT(*) as total
      FROM seasonal_sale_products ssp
      JOIN products p ON ssp.product_id = p.id
      WHERE ssp.seasonal_sale_id = $1
        AND p.stock_quantity > 0
    `,
      [saleId]
    );

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching seasonal sale products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Get products in a flash sale
router.get("/flash-sales/:saleId/products", async (req, res) => {
  try {
    const { saleId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(
      `
      SELECT 
        p.*,
        fsp.sale_price,
        fsp.original_price,
        fsp.sold_quantity,
        fsp.max_quantity,
        (fsp.max_quantity - fsp.sold_quantity) as remaining_quantity,
        fs.discount_percentage as sale_discount
      FROM flash_sale_products fsp
      JOIN products p ON fsp.product_id = p.id
      JOIN flash_sales fs ON fsp.flash_sale_id = fs.id
      WHERE fsp.flash_sale_id = $1
        AND (fsp.max_quantity - fsp.sold_quantity) > 0
      ORDER BY fsp.sold_quantity DESC
      LIMIT $2 OFFSET $3
    `,
      [saleId, limit, offset]
    );

    const countResult = await db.query(
      `
      SELECT COUNT(*) as total
      FROM flash_sale_products fsp
      WHERE fsp.flash_sale_id = $1
        AND (fsp.max_quantity - fsp.sold_quantity) > 0
    `,
      [saleId]
    );

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching flash sale products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

module.exports = router;
