// src/controllers/reviewController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Add review
exports.addReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { rating, title, comment, images } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const review = await db.query(
      `INSERT INTO reviews (id, product_id, user_id, rating, title, comment, images, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             RETURNING *`,
      [
        uuidv4(),
        productId,
        userId,
        rating,
        title,
        comment,
        JSON.stringify(images || []),
      ]
    );

    // Update product rating
    await updateProductRating(productId);

    // Clear cache
    await redis.del(`reviews:${productId}`);
    await redis.del(`product:${productId}`);

    res.status(201).json({
      success: true,
      review: review.rows[0],
    });
  } catch (error) {
    console.error("Add review error:", error);
    res.status(500).json({ error: "Failed to add review" });
  }
};

// Get reviews for product
exports.getReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = "helpful" } = req.query;
    const offset = (page - 1) * limit;

    // Check cache
    const cacheKey = `reviews:${productId}:${page}:${sort}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    let orderBy = "r.created_at DESC";
    if (sort === "helpful") {
      orderBy = "r.helpful_count DESC, r.created_at DESC";
    } else if (sort === "highest") {
      orderBy = "r.rating DESC, r.created_at DESC";
    } else if (sort === "lowest") {
      orderBy = "r.rating ASC, r.created_at DESC";
    }

    const reviews = await db.query(
      `SELECT r.*, u.full_name, u.profile_image
             FROM reviews r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.product_id = $1
             ORDER BY ${orderBy}
             LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    );

    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM reviews WHERE product_id = $1",
      [productId]
    );

    const result = {
      reviews: reviews.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalResult.rows[0].total),
        pages: Math.ceil(totalResult.rows[0].total / limit),
      },
    };

    // Cache for 1 hour
    // await redis.setex(cacheKey, 3600, JSON.stringify(result));
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

// Get review summary (rating distribution)
exports.getReviewSummary = async (req, res) => {
  try {
    const { productId } = req.params;

    const cacheKey = `review_summary:${productId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get rating distribution
    const distribution = await db.query(
      `SELECT rating, COUNT(*) as count
             FROM reviews
             WHERE product_id = $1
             GROUP BY rating
             ORDER BY rating DESC`,
      [productId]
    );

    // Get average rating
    const average = await db.query(
      `SELECT AVG(rating)::DECIMAL(3,2) as average, COUNT(*) as total
             FROM reviews
             WHERE product_id = $1`,
      [productId]
    );

    const result = {
      average: parseFloat(average.rows[0]?.average || 0),
      total: parseInt(average.rows[0]?.total || 0),
      distribution: distribution.rows.reduce((acc, row) => {
        acc[row.rating] = parseInt(row.count);
        return acc;
      }, {}),
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(result));

    res.json(result);
  } catch (error) {
    console.error("Get review summary error:", error);
    res.status(500).json({ error: "Failed to fetch review summary" });
  }
};

// Mark review as helpful
exports.markHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const updated = await db.query(
      `UPDATE reviews
             SET helpful_count = helpful_count + 1
             WHERE id = $1
             RETURNING *`,
      [reviewId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Review not found" });
    }

    // Clear cache
    const review = updated.rows[0];
    await redis.del(`reviews:${review.product_id}:*`);
    await redis.del(`review_summary:${review.product_id}`);

    res.json({ success: true, helpful_count: updated.rows[0].helpful_count });
  } catch (error) {
    console.error("Mark helpful error:", error);
    res.status(500).json({ error: "Failed to update helpful count" });
  }
};

// Helper: Update product rating
async function updateProductRating(productId) {
  const result = await db.query(
    `SELECT AVG(rating)::DECIMAL(3,2) as avg, COUNT(*) as total
         FROM reviews
         WHERE product_id = $1`,
    [productId]
  );

  const avgRating = parseFloat(result.rows[0]?.avg || 0);
  const totalReviews = parseInt(result.rows[0]?.total || 0);

  await db.query(
    `UPDATE products
         SET rating = $1, total_reviews = $2, updated_at = NOW()
         WHERE id = $3`,
    [avgRating, totalReviews, productId]
  );
}
