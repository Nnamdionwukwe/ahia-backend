// src/controllers/productController.js
const db = require("../config/database");
const redis = require("../config/redis");

// Get all products
// exports.getAllProducts = async (req, res) => {
//   try {
//     const {
//       category,
//       page = 1,
//       limit = 20,
//       sort = "created_at",
//       order = "DESC",
//       minPrice,
//       maxPrice,
//       search,
//     } = req.query;

//     const offset = (page - 1) * limit;
//     const params = [];
//     let paramCount = 0;

//     // Base query
//     let query = `
//       SELECT p.*,
//              COUNT(*) OVER() as total_count
//       FROM products p
//       WHERE 1=1
//     `;

//     // Filters
//     if (category) {
//       paramCount++;
//       params.push(category);
//       query += ` AND p.category = $${paramCount}`;
//     }

//     if (minPrice) {
//       paramCount++;
//       params.push(minPrice);
//       query += ` AND p.price >= $${paramCount}`;
//     }

//     if (maxPrice) {
//       paramCount++;
//       params.push(maxPrice);
//       query += ` AND p.price <= $${paramCount}`;
//     }

//     if (search) {
//       paramCount++;
//       params.push(`%${search}%`);
//       query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
//     }

//     // Sorting
//     const validSortFields = ["created_at", "price", "name", "rating"];
//     const validOrders = ["ASC", "DESC"];
//     const sortField = validSortFields.includes(sort) ? sort : "created_at";
//     const sortOrder = validOrders.includes(order.toUpperCase())
//       ? order.toUpperCase()
//       : "DESC";

//     query += ` ORDER BY p.${sortField} ${sortOrder}`;

//     // Pagination
//     paramCount++;
//     params.push(limit);
//     query += ` LIMIT $${paramCount}`;

//     paramCount++;
//     params.push(offset);
//     query += ` OFFSET $${paramCount}`;

//     const result = await db.query(query, params);

//     res.json({
//       products: result.rows,
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total: result.rows[0]?.total_count || 0,
//         pages: Math.ceil((result.rows[0]?.total_count || 0) / limit),
//       },
//     });
//   } catch (error) {
//     console.error("Get all products error:", error);
//     res.status(500).json({ error: "Failed to fetch products" });
//   }
// };

// Get all products with automatic shuffle
exports.getAllProducts = async (req, res) => {
  try {
    const {
      category,
      page = 1,
      limit = 20,
      minPrice,
      maxPrice,
      search,
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 0;

    // Base query
    let query = `
      SELECT p.*, 
             COUNT(*) OVER() as total_count
      FROM products p
      WHERE 1=1
    `;

    // Filters
    if (category) {
      paramCount++;
      params.push(category);
      query += ` AND p.category = $${paramCount}`;
    }

    if (minPrice) {
      paramCount++;
      params.push(minPrice);
      query += ` AND p.price >= $${paramCount}`;
    }

    if (maxPrice) {
      paramCount++;
      params.push(maxPrice);
      query += ` AND p.price <= $${paramCount}`;
    }

    if (search) {
      paramCount++;
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
    }

    // CRITICAL: Add ORDER BY RANDOM() before LIMIT
    query += ` ORDER BY RANDOM()`;

    // Then add pagination
    paramCount++;
    params.push(limit);
    query += ` LIMIT $${paramCount}`;

    paramCount++;
    params.push(offset);
    query += ` OFFSET $${paramCount}`;

    console.log("SQL Query:", query);
    console.log("Params:", params);

    const result = await db.query(query, params);

    console.log(`✅ Returned ${result.rows.length} products (shuffled)`);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows[0]?.total_count || 0,
        pages: Math.ceil((result.rows[0]?.total_count || 0) / limit),
      },
      shuffled: true,
      shuffleTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get all products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// Test endpoint to verify shuffle
exports.testShuffle = async (req, res) => {
  try {
    const result1 = await db.query(`
      SELECT id, name FROM products ORDER BY RANDOM() LIMIT 5
    `);

    const result2 = await db.query(`
      SELECT id, name FROM products ORDER BY RANDOM() LIMIT 5
    `);

    res.json({
      message: "If these two arrays are different, shuffle works!",
      query1: result1.rows,
      query2: result2.rows,
      areDifferent:
        JSON.stringify(result1.rows) !== JSON.stringify(result2.rows),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Alternative: Get products with seeded random (for consistent shuffle per session)
exports.getProductsSeeded = async (req, res) => {
  try {
    const {
      category,
      page = 1,
      limit = 20,
      seed, // Client can pass a seed for session consistency
      minPrice,
      maxPrice,
      search,
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];
    let paramCount = 0;

    // Use seed if provided, otherwise use timestamp
    const randomSeed = seed || Date.now();

    // Base query
    let query = `
      SELECT p.*, 
             COUNT(*) OVER() as total_count
      FROM products p
      WHERE 1=1
    `;

    // Filters
    if (category) {
      paramCount++;
      params.push(category);
      query += ` AND p.category = $${paramCount}`;
    }

    if (minPrice) {
      paramCount++;
      params.push(minPrice);
      query += ` AND p.price >= $${paramCount}`;
    }

    if (maxPrice) {
      paramCount++;
      params.push(maxPrice);
      query += ` AND p.price <= $${paramCount}`;
    }

    if (search) {
      paramCount++;
      params.push(`%${search}%`);
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
    }

    // Seeded random for consistent results with same seed
    paramCount++;
    params.push(randomSeed);
    query += ` ORDER BY setseed($${paramCount}), RANDOM()`;

    // Pagination
    paramCount++;
    params.push(limit);
    query += ` LIMIT $${paramCount}`;

    paramCount++;
    params.push(offset);
    query += ` OFFSET $${paramCount}`;

    const result = await db.query(query, params);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows[0]?.total_count || 0,
        pages: Math.ceil((result.rows[0]?.total_count || 0) / limit),
      },
      shuffled: true,
      seed: randomSeed,
    });
  } catch (error) {
    console.error("Get products seeded error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check cache
    const cacheKey = `product:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const product = await db.query(
      `SELECT p.*, s.store_name, s.rating as seller_rating
       FROM products p
       LEFT JOIN sellers s ON p.seller_id = s.id
       WHERE p.id = $1`,
      [id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Get variants
    const variants = await db.query(
      `SELECT id, color, size, base_price, discount_percentage, stock_quantity
       FROM product_variants
       WHERE product_id = $1`,
      [id]
    );

    const productData = {
      ...product.rows[0],
      variants: variants.rows,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(productData));

    res.json(productData);
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
};

// Get product variants
exports.getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await db.query(
      `SELECT id, product_id, color, size, base_price, 
              discount_percentage, stock_quantity, sku
       FROM product_variants
       WHERE product_id = $1 AND stock_quantity >= 0
       ORDER BY color, size`,
      [productId]
    );

    res.json({
      variants: variants.rows,
      count: variants.rows.length,
    });
  } catch (error) {
    console.error("Get variants error:", error);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
};

// Get products by category
exports.getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const products = await db.query(
      `SELECT p.*, COUNT(*) OVER() as total_count
       FROM products p
       WHERE p.category = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [category, limit, offset]
    );

    res.json({
      products: products.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: products.rows[0]?.total_count || 0,
        pages: Math.ceil((products.rows[0]?.total_count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Get products by category error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await db.query(`
      SELECT DISTINCT category, COUNT(*) as product_count
      FROM products
      WHERE category IS NOT NULL AND stock_quantity > 0
      GROUP BY category
      ORDER BY product_count DESC
    `);

    res.json({
      categories: categories.rows.map((row) => ({
        name: row.category,
        slug: row.category.toLowerCase().replace(/\s+/g, "-"),
        count: parseInt(row.product_count),
      })),
      total: categories.rows.length,
    });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// Create product (Admin)
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      images,
      stock_quantity,
      seller_id,
    } = req.body;

    const product = await db.query(
      `INSERT INTO products 
       (name, description, price, category, images, stock_quantity, seller_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [name, description, price, category, images, stock_quantity, seller_id]
    );

    res.status(201).json({
      success: true,
      product: product.rows[0],
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// Update product (Admin)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");

    const values = [id, ...Object.values(updates)];

    const product = await db.query(
      `UPDATE products 
       SET ${fields}, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      values
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Clear cache
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      product: product.rows[0],
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// Delete product (Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Clear cache
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
};

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
// exports.getProductDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

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

//     // Get product attributes grouped by category
//     const attributes = await db.query(
//       `SELECT attribute_name, attribute_value, attribute_group, display_order
//        FROM product_attributes
//        WHERE product_id = $1
//        ORDER BY attribute_group, display_order`,
//       [id]
//     );

//     // Group attributes by category
//     const groupedAttributes = attributes.rows.reduce((acc, attr) => {
//       const group = attr.attribute_group || "other";
//       if (!acc[group]) {
//         acc[group] = [];
//       }
//       acc[group].push({
//         name: attr.attribute_name,
//         value: attr.attribute_value,
//       });
//       return acc;
//     }, {});

//     const result = {
//       product: productData,
//       images: images,
//       variants: variants.rows,
//       attributes: groupedAttributes,
//     };

//     await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);

//     res.json(result);
//   } catch (error) {
//     console.error("Get product details error:", error);
//     res.status(500).json({ error: "Failed to fetch product" });
//   }
// };

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

    // Map product images
    const images =
      productData.images && Array.isArray(productData.images)
        ? productData.images.map((url, index) => ({
            image_url: url,
            alt_text: productData.name,
            display_order: index + 1,
          }))
        : [];

    // Query variants WITHOUT image_url (it doesn't exist in the table)
    const variants = await db.query(
      `SELECT
        id,
        color,
        size,
        sku,
        stock_quantity,
        COALESCE(base_price, $2) as base_price,
        COALESCE(discount_percentage, 0) as discount_percentage
      FROM product_variants
      WHERE product_id = $1
      ORDER BY
        color NULLS LAST,
        CASE
          WHEN size ~ '^[0-9]+\.?[0-9]*$'
          THEN CAST(size AS DECIMAL)
          ELSE 999
        END`,
      [id, productData.price]
    );

    // Map product images to variants based on color matching
    const variantsWithImages = variants.rows.map((variant) => {
      // Get unique colors to map to images
      const uniqueColors = [...new Set(variants.rows.map((v) => v.color))];
      const colorIndex = uniqueColors.indexOf(variant.color);

      // Assign image based on color index
      variant.image_url =
        images[colorIndex % images.length]?.image_url ||
        (images.length > 0 ? images[0].image_url : null);

      return variant;
    });

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
      variants: variantsWithImages,
      attributes: groupedAttributes,
    };

    // Cache for 1 hour
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

// Add at the end of your productController.js file:

// Get product variants
exports.getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await db.query(
      `SELECT id, product_id, color, size, base_price,
              discount_percentage, stock_quantity, sku
       FROM product_variants
       WHERE product_id = $1 AND stock_quantity >= 0
       ORDER BY color, size`,
      [productId]
    );

    res.json({
      variants: variants.rows,
      count: variants.rows.length,
    });
  } catch (error) {
    console.error("Get variants error:", error);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
};

// Create product (Admin)
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      original_price,
      discount_percentage,
      category,
      brand,
      images,
      stock_quantity,
      seller_id,
      tags,
    } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        error: "Name, price, and category are required",
      });
    }

    const product = await db.query(
      `INSERT INTO products
       (name, description, price, original_price, discount_percentage,
        category, brand, images, stock_quantity, seller_id, tags,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        name,
        description,
        price,
        original_price || price,
        discount_percentage || 0,
        category,
        brand,
        images || [],
        stock_quantity || 0,
        seller_id,
        tags || [],
      ]
    );

    res.status(201).json({
      success: true,
      product: product.rows[0],
      message: "Product created successfully",
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// Update product (Admin)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.created_at;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields
      .map((field, index) => `${field} = $${index + 2}`)
      .join(", ");

    const query = `
      UPDATE products
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const product = await db.query(query, [id, ...values]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    await redis.del(`product:${id}`);

    res.json({
      success: true,
      product: product.rows[0],
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// Delete product (Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await db.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    await db.query("DELETE FROM products WHERE id = $1", [id]);
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
};

// Clear cache (Admin)
exports.clearCache = async (req, res) => {
  try {
    const { id } = req.params;
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear cache" });
  }
};

// Variant Management
exports.createVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      color,
      size,
      sku,
      stock_quantity,
      base_price,
      discount_percentage,
    } = req.body;

    const product = await db.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const variant = await db.query(
      `INSERT INTO product_variants
       (product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        color,
        size,
        sku || null,
        stock_quantity || 0,
        base_price || product.rows[0].price,
        discount_percentage || 0,
      ]
    );

    await redis.del(`product:${id}`);

    res.status(201).json({
      success: true,
      variant: variant.rows[0],
      message: "Variant created successfully",
    });
  } catch (error) {
    console.error("Create variant error:", error);
    res.status(500).json({ error: "Failed to create variant" });
  }
};

exports.updateVariant = async (req, res) => {
  try {
    const { id, variantId } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.product_id;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields
      .map((field, index) => `${field} = $${index + 3}`)
      .join(", ");

    const variant = await db.query(
      `UPDATE product_variants SET ${setClause} WHERE id = $1 AND product_id = $2 RETURNING *`,
      [variantId, id, ...values]
    );

    if (variant.rows.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await redis.del(`product:${id}`);

    res.json({
      success: true,
      variant: variant.rows[0],
      message: "Variant updated successfully",
    });
  } catch (error) {
    console.error("Update variant error:", error);
    res.status(500).json({ error: "Failed to update variant" });
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    const { id, variantId } = req.params;

    const result = await db.query(
      "DELETE FROM product_variants WHERE id = $1 AND product_id = $2 RETURNING *",
      [variantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await redis.del(`product:${id}`);

    res.json({
      success: true,
      message: "Variant deleted successfully",
    });
  } catch (error) {
    console.error("Delete variant error:", error);
    res.status(500).json({ error: "Failed to delete variant" });
  }
};

exports.getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await db.query(
      `SELECT id, product_id, color, size, base_price, 
              discount_percentage, stock_quantity, sku
       FROM product_variants
       WHERE product_id = $1 AND stock_quantity >= 0
       ORDER BY color, size`,
      [productId]
    );

    res.json({
      variants: variants.rows,
      count: variants.rows.length,
    });
  } catch (error) {
    console.error("Get variants error:", error);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
};

// Create product (Admin)
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      original_price,
      discount_percentage,
      category,
      brand,
      images,
      stock_quantity,
      seller_id,
      tags,
    } = req.body;

    // Validation
    if (!name || !price || !category) {
      return res.status(400).json({
        error: "Name, price, and category are required",
      });
    }

    const product = await db.query(
      `INSERT INTO products 
       (name, description, price, original_price, discount_percentage, 
        category, brand, images, stock_quantity, seller_id, tags, 
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        name,
        description,
        price,
        original_price || price,
        discount_percentage || 0,
        category,
        brand,
        images || [],
        stock_quantity || 0,
        seller_id,
        tags || [],
      ]
    );

    res.status(201).json({
      success: true,
      product: product.rows[0],
      message: "Product created successfully",
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// Update product (Admin)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating id or timestamps
    delete updates.id;
    delete updates.created_at;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Build dynamic update query
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields
      .map((field, index) => `${field} = ${index + 2}`)
      .join(", ");

    const query = `
      UPDATE products 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const product = await db.query(query, [id, ...values]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Clear cache
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      product: product.rows[0],
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// Delete product (Admin)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if product exists
    const product = await db.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Delete product (this will cascade delete variants, reviews, etc. if set up)
    await db.query("DELETE FROM products WHERE id = $1", [id]);

    // Clear cache
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
};

// Clear product cache (Admin)
exports.clearCache = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;
    await redis.del(cacheKey);

    res.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    console.error("Clear cache error:", error);
    res.status(500).json({ error: "Failed to clear cache" });
  }
};

// Create product variant (Admin)
exports.createVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      color,
      size,
      sku,
      stock_quantity,
      base_price,
      discount_percentage,
    } = req.body;

    // Check if product exists
    const product = await db.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const variant = await db.query(
      `INSERT INTO product_variants 
       (product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        color,
        size,
        sku || null,
        stock_quantity || 0,
        base_price || product.rows[0].price,
        discount_percentage || 0,
      ]
    );

    // Clear product cache
    await redis.del(`product:${id}`);

    res.status(201).json({
      success: true,
      variant: variant.rows[0],
      message: "Variant created successfully",
    });
  } catch (error) {
    console.error("Create variant error:", error);
    res.status(500).json({ error: "Failed to create variant" });
  }
};

// Update product variant (Admin)
exports.updateVariant = async (req, res) => {
  try {
    const { id, variantId } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.product_id;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields
      .map((field, index) => `${field} = ${index + 3}`)
      .join(", ");

    const query = `
      UPDATE product_variants 
      SET ${setClause}
      WHERE id = $1 AND product_id = $2
      RETURNING *
    `;

    const variant = await db.query(query, [variantId, id, ...values]);

    if (variant.rows.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Clear product cache
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      variant: variant.rows[0],
      message: "Variant updated successfully",
    });
  } catch (error) {
    console.error("Update variant error:", error);
    res.status(500).json({ error: "Failed to update variant" });
  }
};

// Delete product variant (Admin)
exports.deleteVariant = async (req, res) => {
  try {
    const { id, variantId } = req.params;

    const result = await db.query(
      "DELETE FROM product_variants WHERE id = $1 AND product_id = $2 RETURNING *",
      [variantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Clear product cache
    await redis.del(`product:${id}`);

    res.json({
      success: true,
      message: "Variant deleted successfully",
    });
  } catch (error) {
    console.error("Delete variant error:", error);
    res.status(500).json({ error: "Failed to delete variant" });
  }
};
