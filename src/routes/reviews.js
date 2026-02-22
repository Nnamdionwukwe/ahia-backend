// src/routes/reviews.js
// Admin review routes are in src/routes/adminReviews.js → /api/admin/reviews

const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authenticateToken } = require("../middleware/auth");

// ── User-scoped (must come before /:productId wildcard) ───────────────────────
router.get("/user/me", authenticateToken, reviewController.getUserReviews);
router.get("/user/orders", authenticateToken, reviewController.getUserOrders);

// ── Bulk submit ───────────────────────────────────────────────────────────────
router.post("/bulk", authenticateToken, reviewController.submitAllReviews);

// ── Single-product CRUD ───────────────────────────────────────────────────────
router.post("/:productId/add", authenticateToken, reviewController.addReview);
router.get("/:productId", reviewController.getReviews);
router.get("/:productId/summary", reviewController.getReviewSummary);
router.put("/:reviewId/edit", authenticateToken, reviewController.editReview);
router.delete("/:reviewId", authenticateToken, reviewController.deleteReview);
router.put(
  "/:reviewId/helpful",
  authenticateToken,
  reviewController.markHelpful,
);

module.exports = router;
