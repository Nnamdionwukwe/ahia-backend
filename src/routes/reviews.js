// src/routes/reviews.js
const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const {
  authenticateUser,
  authenticate,
  authorize,
} = require("../middleware/auth");

// ── Admin middleware shorthand ────────────────────────────────────────────────
const adminOnly = [authenticate, authorize("admin")];

// =============================================================================
// ADMIN ROUTES  (must come before /:productId to avoid param conflicts)
// =============================================================================

/**
 * @route  GET /api/reviews/admin/stats
 * @desc   Overall review stats — totals, distribution, top products, recent
 * @access Admin
 */
router.get("/admin/stats", ...adminOnly, reviewController.adminGetReviewStats);

/**
 * @route  GET /api/reviews/admin/all
 * @desc   All reviews with filters — page, limit, rating, sort, search, product_id
 * @access Admin
 */
router.get("/admin/all", ...adminOnly, reviewController.adminGetAllReviews);

/**
 * @route  DELETE /api/reviews/admin/:reviewId
 * @desc   Delete any review (admin — no ownership check)
 * @access Admin
 */
router.delete(
  "/admin/:reviewId",
  ...adminOnly,
  reviewController.adminDeleteReview,
);

// =============================================================================
// USER-SCOPED ROUTES  (must come before /:productId)
// =============================================================================

/**
 * @route  GET /api/reviews/user/me
 * @desc   Current user's pending + submitted reviews
 * @access Private
 */
router.get("/user/me", authenticateUser, reviewController.getUserReviews);

/**
 * @route  GET /api/reviews/user/orders
 * @desc   Delivered orders with items (for ChooseOrderSheet)
 * @access Private
 */
router.get("/user/orders", authenticateUser, reviewController.getUserOrders);

// =============================================================================
// BULK SUBMIT
// =============================================================================

/**
 * @route  POST /api/reviews/bulk
 * @desc   Submit reviews for multiple products at once (LeaveAllReviews)
 * @body   { reviews: [{ productId, rating, comment, images[], hide_profile }] }
 * @access Private
 */
router.post("/bulk", authenticateUser, reviewController.submitAllReviews);

// =============================================================================
// SINGLE-PRODUCT REVIEW CRUD
// =============================================================================

/**
 * @route  POST /api/reviews/:productId/add
 * @desc   Add a review for a product
 * @body   { rating, comment, images[], hide_profile }
 * @access Private
 */
router.post("/:productId/add", authenticateUser, reviewController.addReview);

/**
 * @route  GET /api/reviews/:productId
 * @desc   Paginated reviews for a product
 * @query  page, limit, sort (helpful | highest | lowest | recent)
 * @access Public
 */
router.get("/:productId", reviewController.getReviews);

/**
 * @route  GET /api/reviews/:productId/summary
 * @desc   Rating distribution + average for a product
 * @access Public
 */
router.get("/:productId/summary", reviewController.getReviewSummary);

/**
 * @route  PUT /api/reviews/:reviewId/edit
 * @desc   Edit an existing review (own reviews only)
 * @body   { rating, comment, images[], hide_profile }
 * @access Private
 */
router.put("/:reviewId/edit", authenticateUser, reviewController.editReview);

/**
 * @route  DELETE /api/reviews/:reviewId
 * @desc   Delete own review
 * @access Private
 */
router.delete("/:reviewId", authenticateUser, reviewController.deleteReview);

/**
 * @route  PUT /api/reviews/:reviewId/helpful
 * @desc   Toggle helpful on a review
 * @access Private
 */
router.put(
  "/:reviewId/helpful",
  authenticateUser,
  reviewController.markHelpful,
);

module.exports = router;
