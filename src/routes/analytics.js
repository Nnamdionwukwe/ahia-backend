// src/routes/analytics.js
const express = require("express");
const router = express.Router();
const {
  authenticateToken,
  requireRole,
  requireSeller,
} = require("../middleware/auth");
const analyticsController = require("../controllers/analyticsController");

/**
 * @route   POST /api/analytics/track
 * @desc    Track analytics event
 * @access  Public (with optional auth)
 * @body    { eventType, eventData, sessionId }
 */
router.post("/track", analyticsController.trackEvent);

/**
 * @route   GET /api/analytics/user
 * @desc    Get user's own analytics
 * @access  Private
 * @query   period (7d, 30d, 90d)
 */
router.get("/user", authenticateToken, analyticsController.getUserAnalytics);

/**
 * @route   GET /api/analytics/product/:productId
 * @desc    Get product analytics (views, conversions, etc.)
 * @access  Private (Seller/Admin)
 * @param   productId - UUID of product
 * @query   period (7d, 30d, 90d)
 */
router.get(
  "/product/:productId",
  authenticateToken,
  requireSeller,
  analyticsController.getProductAnalytics
);

/**
 * @route   GET /api/analytics/seller
 * @desc    Get seller dashboard analytics
 * @access  Private (Seller only)
 * @query   period (7d, 30d, 90d)
 */
router.get(
  "/seller",
  authenticateToken,
  requireSeller,
  analyticsController.getSellerAnalytics
);

/**
 * @route   GET /api/analytics/platform
 * @desc    Get platform-wide analytics
 * @access  Admin only
 * @query   period (7d, 30d, 90d)
 */
router.get(
  "/platform",
  authenticateToken,
  requireRole("admin"),
  analyticsController.getPlatformAnalytics
);

/**
 * @route   GET /api/analytics/trending
 * @desc    Get trending products from Redis
 * @access  Public
 * @query   limit (default: 20)
 */
router.get("/trending", analyticsController.getTrendingProducts);

module.exports = router;
