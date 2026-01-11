// src/controllers/productController.js
const db = require("../config/database");
const redis = require("../config/redis");

// Get all products with filters
exports.getProducts = async (req, res) => {
  try {
    const { category, brand, sort, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.id, p.name, p.price, p.original_price, p.discount_percentage,
             p.images, p.rating, p.total_reviews, p.brand, p.tags, p.created_at,
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

    if (brand) {
      query += ` AND p.brand = $${params.length + 1}`;
      params.push(brand);
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
    const countParams = [];

    if (category) {
      countQuery += ` AND category = $${countParams.length + 1}`;
      countParams.push(category);
    }

    if (brand) {
      countQuery += ` AND brand = $${countParams.length + 1}`;
      countParams.push(brand);
    }

    const countResult = await db.query(countQuery, countParams);

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

// Add this to getProductDetails function
exports.getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `product:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

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

    const productData = product.rows[0];

    const images =
      productData.images && Array.isArray(productData.images)
        ? productData.images.map((url, index) => ({
            image_url: url,
            alt_text: productData.name,
            display_order: index + 1,
          }))
        : [];

    const variants = await db.query(
      `SELECT id, color, size, sku, stock_quantity, base_price, discount_percentage
       FROM product_variants
       WHERE product_id = $1`,
      [id]
    );

    // Get product attributes grouped by category
    const attributes = await db.query(
      `SELECT attribute_name, attribute_value, attribute_group, display_order
       FROM product_attributes
       WHERE product_id = $1
       ORDER BY attribute_group, display_order`,
      [id]
    );

    // Group attributes by category
    const groupedAttributes = attributes.rows.reduce((acc, attr) => {
      const group = attr.attribute_group || "other";
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push({
        name: attr.attribute_name,
        value: attr.attribute_value,
      });
      return acc;
    }, {});

    const result = {
      product: productData,
      images: images,
      variants: variants.rows,
      attributes: groupedAttributes,
    };

    await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);

    res.json(result);
  } catch (error) {
    console.error("Get product details error:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
};

// exports.getProductDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Try cache first
//     const cacheKey = `product:${id}`;
//     const cached = await redis.get(cacheKey);
//     if (cached) {
//       return res.json(JSON.parse(cached));
//     }

//     const product = await db.query(
//       `SELECT p.*, s.store_name, s.rating as seller_rating, s.total_followers, s.verified
//        FROM products p
//        LEFT JOIN sellers s ON p.seller_id = s.id
//        WHERE p.id = $1`,
//       [id]
//     );

//     if (product.rows.length === 0) {
//       return res.status(404).json({ error: "Product not found" });
//     }

//     const productData = product.rows[0];

//     // Format images from the products.images JSONB array
//     const images =
//       productData.images && Array.isArray(productData.images)
//         ? productData.images.map((url, index) => ({
//             image_url: url,
//             alt_text: productData.name,
//             display_order: index + 1,
//           }))
//         : [];

//     const variants = await db.query(
//       `SELECT id, color, size, sku, stock_quantity, base_price, discount_percentage
//        FROM product_variants
//        WHERE product_id = $1`,
//       [id]
//     );

//     const result = {
//       product: productData,
//       images: images,
//       variants: variants.rows,
//     };

//     // Cache for 1 hour
//     await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);

//     res.json(result);
//   } catch (error) {
//     console.error("Get product details error:", error);
//     res.status(500).json({ error: "Failed to fetch product" });
//   }
// };

// Search products with brand and tags
exports.searchProducts = async (req, res) => {
  try {
    const { q, category, brand, tag } = req.query;

    if (!q && !tag) {
      return res.status(400).json({ error: "Search query or tag required" });
    }

    let query = `
      SELECT p.id, p.name, p.price, p.discount_percentage, p.images,
             p.rating, p.total_reviews, p.brand, p.tags
      FROM products p
      WHERE p.stock_quantity > 0
    `;

    const params = [];

    if (q) {
      query += ` AND (p.name ILIKE $${
        params.length + 1
      } OR p.description ILIKE $${params.length + 1} OR p.brand ILIKE $${
        params.length + 1
      })`;
      params.push(`%${q}%`);
    }

    if (category) {
      query += ` AND p.category = $${params.length + 1}`;
      params.push(category);
    }

    if (brand) {
      query += ` AND p.brand = $${params.length + 1}`;
      params.push(brand);
    }

    if (tag) {
      query += ` AND $${params.length + 1} = ANY(p.tags)`;
      params.push(tag);
    }

    query += " ORDER BY p.rating DESC LIMIT 20";

    const results = await db.query(query, params);

    res.json({
      query: q || `tag:${tag}`,
      results: results.rows,
      count: results.rows.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
};

// Search products (basic - full Elasticsearch in later phases)
// exports.searchProducts = async (req, res) => {
//   try {
//     const { q, category } = req.query;

//     if (!q) {
//       return res.status(400).json({ error: "Search query required" });
//     }

//     let query = `
//             SELECT p.id, p.name, p.price, p.discount_percentage, p.images,
//                    p.rating, p.total_reviews
//             FROM products p
//             WHERE (p.name ILIKE $1 OR p.description ILIKE $1)
//             AND p.stock_quantity > 0
//         `;

//     const params = [`%${q}%`];

//     if (category) {
//       query += ` AND p.category = $2`;
//       params.push(category);
//     }

//     query += " ORDER BY p.rating DESC LIMIT 20";

//     const results = await db.query(query, params);

//     res.json({
//       query: q,
//       results: results.rows,
//       count: results.rows.length,
//     });
//   } catch (error) {
//     console.error("Search error:", error);
//     res.status(500).json({ error: "Search failed" });
//   }
// };

// Get all brands (for filters)
exports.getBrands = async (req, res) => {
  try {
    const brands = await db.query(`
      SELECT DISTINCT brand, COUNT(*) as product_count
      FROM products
      WHERE brand IS NOT NULL AND stock_quantity > 0
      GROUP BY brand
      ORDER BY brand ASC
    `);

    res.json({
      brands: brands.rows,
    });
  } catch (error) {
    console.error("Get brands error:", error);
    res.status(500).json({ error: "Failed to fetch brands" });
  }
};

// Get all tags (for filters)
exports.getTags = async (req, res) => {
  try {
    const tags = await db.query(`
      SELECT DISTINCT unnest(tags) as tag, COUNT(*) as product_count
      FROM products
      WHERE tags IS NOT NULL AND stock_quantity > 0
      GROUP BY tag
      ORDER BY product_count DESC
      LIMIT 50
    `);

    res.json({
      tags: tags.rows,
    });
  } catch (error) {
    console.error("Get tags error:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
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
      await redis.set(
        `user_view:${userId}:${id}`,
        product.rows[0].category,
        "EX",
        86400
      );
    }

    res.json({ tracked: true });
  } catch (error) {
    console.error("Track view error:", error);
    res.status(500).json({ error: "Failed to track view" });
  }
};
