// src/routes/reviews.js
const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authenticateUser } = require("../middleware/auth");

router.post("/:productId/add", authenticateUser, reviewController.addReview);
router.get("/:productId", reviewController.getReviews);
router.get("/:productId/summary", reviewController.getReviewSummary);
router.put(
  "/:reviewId/helpful",
  authenticateUser,
  reviewController.markHelpful
);

module.exports = router;
