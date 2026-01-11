// src/controllers/productController.js
const db = require("../config/database");
const redis = require("../config/redis");

// Get all products with filters
exports.getProducts = async (req, res) => {
  try {
    const { category, sort, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
            SELECT p.id, p.name, p.price, p.original_price, p.discount_percentage,
                   p.images, p.rating, p.total_reviews, p.created_at,
                   s.store_name, s.rating as seller_rating
            FROM products p
            LEFT JOIN sellers s ON p.seller_id = s.id
            WHERE p.stock_quantity > 0
        `;

    const params = [];

    if (category) {
      query += ` AND p.category = $${params.length + 1}`;
      params.push(category);
    }

    if (sort === "price_asc") {
      query += " ORDER BY p.price ASC";
    } else if (sort === "price_desc") {
      query += " ORDER BY p.price DESC";
    } else if (sort === "rating") {
      query += " ORDER BY p.rating DESC";
    } else {
      query += " ORDER BY p.created_at DESC";
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const products = await db.query(query, params);

    // Get total count
    let countQuery =
      "SELECT COUNT(*) as total FROM products WHERE stock_quantity > 0";
    if (category) {
      countQuery += ` AND category = $1`;
      const countParams = category ? [category] : [];
      const countResult = await db.query(countQuery, countParams);

      return res.json({
        data: products.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          pages: Math.ceil(countResult.rows[0].total / limit),
        },
      });
    }

    const countResult = await db.query(countQuery);
    res.json({
      data: products.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

exports.getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Try cache first
    // const cacheKey = `product:${id}`;
    // const cached = await redis.get(cacheKey);
    // if (cached) {
    //   return res.json(JSON.parse(cached));
    // }

    const product = await db.query(
      `SELECT p.*, s.store_name, s.rating as seller_rating, s.total_followers, s.verified
       FROM products p
       LEFT JOIN sellers s ON p.seller_id = s.id
       WHERE p.id = $1`,
      [id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if images exist in product_images table
    const productImagesQuery = await db.query(
      `SELECT image_url, alt_text, display_order
       FROM product_images
       WHERE product_id = $1
       ORDER BY display_order ASC`,
      [id]
    );

    // If no images in product_images table, use images from products.images column
    let images = productImagesQuery.rows;
    if (images.length === 0 && product.rows[0].images) {
      // Convert the images array from products table to the expected format
      images = product.rows[0].images.map((url, index) => ({
        image_url: url,
        alt_text: product.rows[0].name,
        display_order: index + 1,
      }));
    }

    const variants = await db.query(
      `SELECT id, color, size, sku, stock_quantity, base_price, discount_percentage
       FROM product_variants
       WHERE product_id = $1`,
      [id]
    );

    const result = {
      product: product.rows[0],
      images: images,
      variants: variants.rows,
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get product details error:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
};
// Search products (basic - full Elasticsearch in later phases)
exports.searchProducts = async (req, res) => {
  try {
    const { q, category } = req.query;

    if (!q) {
      return res.status(400).json({ error: "Search query required" });
    }

    let query = `
            SELECT p.id, p.name, p.price, p.discount_percentage, p.images,
                   p.rating, p.total_reviews
            FROM products p
            WHERE (p.name ILIKE $1 OR p.description ILIKE $1)
            AND p.stock_quantity > 0
        `;

    const params = [`%${q}%`];

    if (category) {
      query += ` AND p.category = $2`;
      params.push(category);
    }

    query += " ORDER BY p.rating DESC LIMIT 20";

    const results = await db.query(query, params);

    res.json({
      query: q,
      results: results.rows,
      count: results.rows.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
};

// Track product view
exports.trackView = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const product = await db.query(
      "SELECT category FROM products WHERE id = $1",
      [id]
    );

    if (product.rows.length > 0) {
      // Cache user view for personalization
      await redis.setex(
        `user_view:${userId}:${id}`,
        86400,
        product.rows[0].category
      );
    }

    res.json({ tracked: true });
  } catch (error) {
    console.error("Track view error:", error);
    res.status(500).json({ error: "Failed to track view" });
  }
};
