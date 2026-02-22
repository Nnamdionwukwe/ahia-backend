// src/controllers/reviewController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// ── Helper: recalculate + persist product rating ──────────────────────────────
async function updateProductRating(productId) {
  const result = await db.query(
    `SELECT AVG(rating)::DECIMAL(3,2) AS avg, COUNT(*) AS total
     FROM reviews WHERE product_id = $1`,
    [productId],
  );
  await db.query(
    `UPDATE products SET rating = $1, total_reviews = $2, updated_at = NOW() WHERE id = $3`,
    [
      parseFloat(result.rows[0]?.avg || 0),
      parseInt(result.rows[0]?.total || 0),
      productId,
    ],
  );
}

// ── Helper: bust all review-related cache for a product ───────────────────────
async function bustReviewCache(productId) {
  const keys = await redis.keys(`reviews:${productId}:*`);
  if (keys.length) await redis.del(...keys);
  await redis.del(`review_summary:${productId}`);
  await redis.del(`product:${productId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reviews/:productId/add
// ─────────────────────────────────────────────────────────────────────────────
exports.addReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { rating, comment, images, hide_profile } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const existing = await db.query(
      "SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2",
      [productId, userId],
    );
    if (existing.rows.length) {
      return res
        .status(409)
        .json({ error: "You have already reviewed this product" });
    }

    const review = await db.query(
      `INSERT INTO reviews
         (id, product_id, user_id, rating, comment, images, hide_profile, helpful_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())
       RETURNING *`,
      [
        uuidv4(),
        productId,
        userId,
        rating,
        comment || null,
        JSON.stringify(images || []),
        hide_profile || false,
      ],
    );

    await updateProductRating(productId);
    await bustReviewCache(productId);

    res.status(201).json({ success: true, review: review.rows[0] });
  } catch (error) {
    console.error("Add review error:", error);
    res.status(500).json({ error: "Failed to add review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/reviews/:reviewId/edit
// ─────────────────────────────────────────────────────────────────────────────
exports.editReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;
    const { rating, comment, images, hide_profile } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const existing = await db.query(
      "SELECT * FROM reviews WHERE id = $1 AND user_id = $2",
      [reviewId, userId],
    );
    if (!existing.rows.length) {
      return res
        .status(404)
        .json({ error: "Review not found or not yours to edit" });
    }

    const current = existing.rows[0];

    const updated = await db.query(
      `UPDATE reviews
       SET rating       = $1,
           comment      = $2,
           images       = $3,
           hide_profile = $4,
           updated_at   = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        rating ?? current.rating,
        comment ?? current.comment,
        JSON.stringify(images ?? JSON.parse(current.images || "[]")),
        hide_profile ?? current.hide_profile,
        reviewId,
      ],
    );

    await updateProductRating(current.product_id);
    await bustReviewCache(current.product_id);

    res.json({ success: true, review: updated.rows[0] });
  } catch (error) {
    console.error("Edit review error:", error);
    res.status(500).json({ error: "Failed to edit review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/reviews/:reviewId  (user — own reviews only)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;

    const existing = await db.query(
      "SELECT * FROM reviews WHERE id = $1 AND user_id = $2",
      [reviewId, userId],
    );
    if (!existing.rows.length) {
      return res
        .status(404)
        .json({ error: "Review not found or not yours to delete" });
    }

    const { product_id } = existing.rows[0];

    await db.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
    await updateProductRating(product_id);
    await bustReviewCache(product_id);

    res.json({ success: true, message: "Review deleted" });
  } catch (error) {
    console.error("Delete review error:", error);
    res.status(500).json({ error: "Failed to delete review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews/user/me
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserReviews = async (req, res) => {
  try {
    const userId = req.user.id;

    const pending = await db.query(
      `SELECT DISTINCT p.id, p.name, p.images, oi.variant_id,
              pv.name AS variant
       FROM order_items oi
       JOIN orders o      ON oi.order_id = o.id
       JOIN products p    ON oi.product_id = p.id
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       WHERE o.user_id = $1
         AND o.status IN ('delivered','completed')
         AND NOT EXISTS (
           SELECT 1 FROM reviews r
           WHERE r.product_id = p.id AND r.user_id = $1
         )
       ORDER BY o.created_at DESC`,
      [userId],
    );

    const reviewed = await db.query(
      `SELECT r.*, p.name AS product_name, p.images AS product_images,
              pv.name AS variant
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       LEFT JOIN product_variants pv ON r.variant_id = pv.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId],
    );

    const helpfulResult = await db.query(
      `SELECT COALESCE(SUM(helpful_count), 0) AS total FROM reviews WHERE user_id = $1`,
      [userId],
    );

    res.json({
      success: true,
      pending: pending.rows.map((row) => ({
        id: row.id,
        name: row.name,
        variant: row.variant || "",
        image: (() => {
          try {
            return JSON.parse(row.images || "[]")[0] || "";
          } catch {
            return "";
          }
        })(),
        waitingCount: "999+",
      })),
      reviewed: reviewed.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        name: row.product_name,
        variant: row.variant || "",
        image: (() => {
          try {
            return JSON.parse(row.product_images || "[]")[0] || "";
          } catch {
            return "";
          }
        })(),
        rating: row.rating,
        reviewText: row.comment || "",
        date: new Date(row.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        helpfulCount: row.helpful_count || 0,
        hide_profile: row.hide_profile,
        images: (() => {
          try {
            return JSON.parse(row.images || "[]");
          } catch {
            return [];
          }
        })(),
      })),
      helpfulTotal: parseInt(helpfulResult.rows[0]?.total || 0),
    });
  } catch (error) {
    console.error("Get user reviews error:", error);
    res.status(500).json({ error: "Failed to fetch user reviews" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews/user/orders
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await db.query(
      `SELECT o.id, o.created_at, o.delivered_at,
              json_agg(
                json_build_object(
                  'id',      oi.id,
                  'name',    p.name,
                  'variant', COALESCE(pv.name, ''),
                  'image',   (SELECT img FROM jsonb_array_elements_text(p.images::jsonb) img LIMIT 1)
                )
                ORDER BY oi.created_at
              ) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p     ON oi.product_id = p.id
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       WHERE o.user_id = $1
         AND o.status IN ('delivered','completed')
       GROUP BY o.id
       ORDER BY COALESCE(o.delivered_at, o.created_at) DESC`,
      [userId],
    );

    res.json({
      success: true,
      orders: orders.rows.map((o) => ({
        id: o.id,
        deliveredDate: new Date(
          o.delivered_at || o.created_at,
        ).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        items: o.items || [],
      })),
    });
  } catch (error) {
    console.error("Get user orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reviews/bulk
// ─────────────────────────────────────────────────────────────────────────────
exports.submitAllReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviews } = req.body;

    if (!Array.isArray(reviews) || !reviews.length) {
      return res
        .status(400)
        .json({ error: "reviews must be a non-empty array" });
    }

    const results = [];
    const errors = [];

    for (const r of reviews) {
      const { productId, rating, comment, images, hide_profile } = r;

      if (!productId || !rating || rating < 1 || rating > 5) {
        errors.push({
          productId,
          error: "Invalid rating or missing productId",
        });
        continue;
      }

      const existing = await db.query(
        "SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2",
        [productId, userId],
      );
      if (existing.rows.length) {
        errors.push({ productId, error: "Already reviewed" });
        continue;
      }

      try {
        const inserted = await db.query(
          `INSERT INTO reviews
             (id, product_id, user_id, rating, comment, images, hide_profile, helpful_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())
           RETURNING *`,
          [
            uuidv4(),
            productId,
            userId,
            rating,
            comment || null,
            JSON.stringify(images || []),
            hide_profile || false,
          ],
        );

        await updateProductRating(productId);
        await bustReviewCache(productId);
        results.push(inserted.rows[0]);
      } catch (err) {
        errors.push({ productId, error: err.message });
      }
    }

    res
      .status(201)
      .json({
        success: true,
        submitted: results.length,
        reviews: results,
        errors,
      });
  } catch (error) {
    console.error("Submit all reviews error:", error);
    res.status(500).json({ error: "Failed to submit reviews" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews/:productId
// ─────────────────────────────────────────────────────────────────────────────
exports.getReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = "helpful" } = req.query;
    const offset = (page - 1) * limit;

    const cacheKey = `reviews:${productId}:${page}:${sort}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const orderMap = {
      helpful: "r.helpful_count DESC, r.created_at DESC",
      highest: "r.rating DESC, r.created_at DESC",
      lowest: "r.rating ASC, r.created_at DESC",
      recent: "r.created_at DESC",
    };
    const orderBy = orderMap[sort] || orderMap.helpful;

    const reviews = await db.query(
      `SELECT r.*,
              CASE WHEN r.hide_profile THEN 'Anonymous' ELSE u.full_name END AS full_name,
              CASE WHEN r.hide_profile THEN NULL ELSE u.profile_image END AS profile_image
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.product_id = $1
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset],
    );

    const totalResult = await db.query(
      "SELECT COUNT(*) AS total FROM reviews WHERE product_id = $1",
      [productId],
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

    await redis.setex(cacheKey, 3600, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews/:productId/summary
// ─────────────────────────────────────────────────────────────────────────────
exports.getReviewSummary = async (req, res) => {
  try {
    const { productId } = req.params;

    const cacheKey = `review_summary:${productId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const [distribution, average] = await Promise.all([
      db.query(
        `SELECT rating, COUNT(*) AS count FROM reviews WHERE product_id = $1 GROUP BY rating ORDER BY rating DESC`,
        [productId],
      ),
      db.query(
        `SELECT AVG(rating)::DECIMAL(3,2) AS average, COUNT(*) AS total FROM reviews WHERE product_id = $1`,
        [productId],
      ),
    ]);

    const result = {
      average: parseFloat(average.rows[0]?.average || 0),
      total: parseInt(average.rows[0]?.total || 0),
      distribution: distribution.rows.reduce((acc, row) => {
        acc[row.rating] = parseInt(row.count);
        return acc;
      }, {}),
    };

    await redis.setex(cacheKey, 3600, JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error("Get review summary error:", error);
    res.status(500).json({ error: "Failed to fetch review summary" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/reviews/:reviewId/helpful
// ─────────────────────────────────────────────────────────────────────────────
exports.markHelpful = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;

    const alreadyMarked = await db.query(
      "SELECT id FROM review_helpful WHERE review_id = $1 AND user_id = $2",
      [reviewId, userId],
    );

    let helpful_count;

    if (alreadyMarked.rows.length) {
      await db.query(
        "DELETE FROM review_helpful WHERE review_id = $1 AND user_id = $2",
        [reviewId, userId],
      );
      const updated = await db.query(
        `UPDATE reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = $1 RETURNING helpful_count, product_id`,
        [reviewId],
      );
      helpful_count = updated.rows[0].helpful_count;
      await bustReviewCache(updated.rows[0].product_id);
    } else {
      await db.query(
        "INSERT INTO review_helpful (id, review_id, user_id, created_at) VALUES ($1, $2, $3, NOW())",
        [uuidv4(), reviewId, userId],
      );
      const updated = await db.query(
        `UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count, product_id`,
        [reviewId],
      );
      helpful_count = updated.rows[0].helpful_count;
      await bustReviewCache(updated.rows[0].product_id);
    }

    res.json({
      success: true,
      helpful: !alreadyMarked.rows.length,
      helpful_count,
    });
  } catch (error) {
    console.error("Mark helpful error:", error);
    res.status(500).json({ error: "Failed to update helpful count" });
  }
};

// =============================================================================
// ADMIN CONTROLLERS
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reviews
// Query: page, limit, rating, sort, search, product_id
// ─────────────────────────────────────────────────────────────────────────────
exports.adminGetAllReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      rating,
      sort = "recent",
      search,
      product_id,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = [];

    if (rating) {
      params.push(parseInt(rating));
      where.push(`r.rating = $${params.length}`);
    }

    if (product_id) {
      params.push(product_id);
      where.push(`r.product_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(u.full_name ILIKE $${params.length} OR p.name ILIKE $${params.length} OR r.comment ILIKE $${params.length})`,
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const orderMap = {
      recent: "r.created_at DESC",
      oldest: "r.created_at ASC",
      highest: "r.rating DESC, r.created_at DESC",
      lowest: "r.rating ASC, r.created_at DESC",
      helpful: "r.helpful_count DESC, r.created_at DESC",
    };
    const orderBy = orderMap[sort] || orderMap.recent;

    // Count
    const countResult = await db.query(
      `SELECT COUNT(*) AS total
       FROM reviews r
       LEFT JOIN users    u ON r.user_id    = u.id
       LEFT JOIN products p ON r.product_id = p.id
       ${whereClause}`,
      params,
    );

    // Rows
    const dataParams = [...params, parseInt(limit), offset];
    const reviews = await db.query(
      `SELECT
         r.id,
         r.rating,
         r.comment,
         r.images,
         r.helpful_count,
         r.hide_profile,
         r.created_at,
         r.updated_at,
         r.product_id,
         p.name   AS product_name,
         r.user_id,
         CASE WHEN r.hide_profile THEN 'Anonymous' ELSE u.full_name   END AS user_name,
         CASE WHEN r.hide_profile THEN NULL         ELSE u.email       END AS user_email,
         CASE WHEN r.hide_profile THEN NULL         ELSE u.profile_image END AS user_avatar
       FROM reviews r
       LEFT JOIN users    u ON r.user_id    = u.id
       LEFT JOIN products p ON r.product_id = p.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        reviews: reviews.rows.map((r) => ({
          ...r,
          images: (() => {
            try {
              return JSON.parse(r.images || "[]");
            } catch {
              return [];
            }
          })(),
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Admin get all reviews error:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/reviews/:reviewId  (admin — any review)
// ─────────────────────────────────────────────────────────────────────────────
exports.adminDeleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const existing = await db.query("SELECT * FROM reviews WHERE id = $1", [
      reviewId,
    ]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: "Review not found" });
    }

    const { product_id } = existing.rows[0];

    await db.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
    await updateProductRating(product_id);
    await bustReviewCache(product_id);

    res.json({ success: true, message: "Review deleted by admin" });
  } catch (error) {
    console.error("Admin delete review error:", error);
    res.status(500).json({ error: "Failed to delete review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reviews/stats
// ─────────────────────────────────────────────────────────────────────────────
exports.adminGetReviewStats = async (req, res) => {
  try {
    const [overall, distribution, topProducts, recent] = await Promise.all([
      // Overall numbers
      db.query(`
        SELECT
          COUNT(*)                                          AS total_reviews,
          COALESCE(AVG(rating)::DECIMAL(3,2), 0)           AS average_rating,
          COUNT(*) FILTER (WHERE rating = 5)               AS five_star,
          COUNT(*) FILTER (WHERE rating = 4)               AS four_star,
          COUNT(*) FILTER (WHERE rating = 3)               AS three_star,
          COUNT(*) FILTER (WHERE rating <= 2)              AS low_star,
          COALESCE(SUM(helpful_count), 0)                  AS total_helpful,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
        FROM reviews
      `),

      // Rating distribution
      db.query(`
        SELECT rating, COUNT(*) AS count
        FROM reviews
        GROUP BY rating
        ORDER BY rating DESC
      `),

      // Most reviewed products
      db.query(`
        SELECT
          p.id,
          p.name,
          COUNT(r.id)                        AS review_count,
          AVG(r.rating)::DECIMAL(3,2)        AS avg_rating
        FROM reviews r
        JOIN products p ON r.product_id = p.id
        GROUP BY p.id, p.name
        ORDER BY review_count DESC
        LIMIT 5
      `),

      // Latest 5 reviews
      db.query(`
        SELECT
          r.id, r.rating, r.comment, r.created_at,
          p.name AS product_name,
          CASE WHEN r.hide_profile THEN 'Anonymous' ELSE u.full_name END AS user_name
        FROM reviews r
        LEFT JOIN users    u ON r.user_id    = u.id
        LEFT JOIN products p ON r.product_id = p.id
        ORDER BY r.created_at DESC
        LIMIT 5
      `),
    ]);

    const row = overall.rows[0];

    res.json({
      success: true,
      data: {
        overview: {
          total_reviews: parseInt(row.total_reviews),
          average_rating: parseFloat(row.average_rating),
          five_star: parseInt(row.five_star),
          four_star: parseInt(row.four_star),
          three_star: parseInt(row.three_star),
          low_star: parseInt(row.low_star),
          total_helpful: parseInt(row.total_helpful),
          this_week: parseInt(row.this_week),
          this_month: parseInt(row.this_month),
        },
        distribution: distribution.rows.map((r) => ({
          rating: parseInt(r.rating),
          count: parseInt(r.count),
        })),
        top_products: topProducts.rows.map((r) => ({
          id: r.id,
          name: r.name,
          review_count: parseInt(r.review_count),
          avg_rating: parseFloat(r.avg_rating),
        })),
        recent_reviews: recent.rows,
      },
    });
  } catch (error) {
    console.error("Admin review stats error:", error);
    res.status(500).json({ error: "Failed to fetch review stats" });
  }
};
