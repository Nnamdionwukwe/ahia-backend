// src/routes/adminReviews.js
// Mounted in server.js as: app.use("/api/admin/adminReviews", adminReviewsRouter)

const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const adminOnly = [authenticateToken, requireAdmin];

/**
 * @route  GET /api/admin/reviews/stats
 * @desc   Overall review stats — totals, distribution, top products, recent
 * @access Admin
 */
router.get("/stats", ...adminOnly, reviewController.adminGetReviewStats);

/**
 * @route  GET /api/admin/reviews
 * @desc   All reviews — page, limit, rating, sort, search, product_id
 * @access Admin
 */
router.get("/", ...adminOnly, reviewController.adminGetAllReviews);

/**
 * @route  DELETE /api/admin/reviews/:reviewId
 * @desc   Delete any review (no ownership check)
 * @access Admin
 */
router.delete("/:reviewId", ...adminOnly, reviewController.adminDeleteReview);

module.exports = router;
