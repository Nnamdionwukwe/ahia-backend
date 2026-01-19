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
        ss.status,
        ssp.sale_price,
        ssp.original_price,
        ROUND(((ssp.original_price - ssp.sale_price) / ssp.original_price) * 100) as discount_percentage
       FROM seasonal_sales ss
       JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
       WHERE ssp.product_id = $1
         AND ss.status = 'active'
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
      status: sale.status,
      sale_price: sale.sale_price,
      original_price: sale.original_price,
      discount_percentage: sale.discount_percentage,
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
        id,
        name,
        description,
        start_time,
        end_time,
        banner_color,
        status,
        created_at
       FROM seasonal_sales
       WHERE status = 'active'
         AND start_time <= $1
         AND end_time > $1
       ORDER BY created_at DESC`,
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
      `SELECT * FROM seasonal_sales WHERE id = $1`,
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

module.exports = exports;
