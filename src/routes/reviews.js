// src/routes/reviews.js
const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authenticateUser } = require("../middleware/auth");

// ── User-scoped routes (must come BEFORE /:productId to avoid param conflicts) ──

/**
 * @route  GET /api/reviews/user/me
 * @desc   Get current user's pending + submitted reviews (Reviews.jsx)
 * @access Private
 */
router.get("/user/me", authenticateUser, reviewController.getUserReviews);

/**
 * @route  GET /api/reviews/user/orders
 * @desc   Get delivered orders with items (ChooseOrderSheet.jsx)
 * @access Private
 */
router.get("/user/orders", authenticateUser, reviewController.getUserOrders);

// ── Bulk submit (LeaveAllReviews.jsx) ─────────────────────────────────────────

/**
 * @route  POST /api/reviews/bulk
 * @desc   Submit reviews for multiple products at once
 * @body   { reviews: [{ productId, rating, comment, images[], hide_profile }] }
 * @access Private
 */
router.post("/bulk", authenticateUser, reviewController.submitAllReviews);

// ── Single-product review CRUD ────────────────────────────────────────────────

/**
 * @route  POST /api/reviews/:productId/add
 * @desc   Add a review (Reviews.jsx → LeaveReviewSheet, LeaveReview.jsx)
 * @body   { rating, comment, images[], hide_profile }
 * @access Private
 */
router.post("/:productId/add", authenticateUser, reviewController.addReview);

/**
 * @route  GET /api/reviews/:productId
 * @desc   Get paginated reviews for a product
 * @query  page, limit, sort (helpful | highest | lowest | recent)
 * @access Public
 */
router.get("/:productId", reviewController.getReviews);

/**
 * @route  GET /api/reviews/:productId/summary
 * @desc   Get rating distribution + average for a product
 * @access Public
 */
router.get("/:productId/summary", reviewController.getReviewSummary);

/**
 * @route  PUT /api/reviews/:reviewId/edit
 * @desc   Edit an existing review (ReviewedCard → Edit button → LeaveReviewSheet)
 * @body   { rating, comment, images[], hide_profile }
 * @access Private
 */
router.put("/:reviewId/edit", authenticateUser, reviewController.editReview);

/**
 * @route  DELETE /api/reviews/:reviewId
 * @desc   Delete a review (ReviewedCard → Delete button)
 * @access Private
 */
router.delete("/:reviewId", authenticateUser, reviewController.deleteReview);

/**
 * @route  PUT /api/reviews/:reviewId/helpful
 * @desc   Toggle helpful on a review (ReviewedCard → Helpful button)
 * @access Private
 */
router.put(
  "/:reviewId/helpful",
  authenticateUser,
  reviewController.markHelpful,
);

module.exports = router;
