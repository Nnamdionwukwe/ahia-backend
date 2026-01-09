// src/routes/advancedRoutes.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");

// Controllers
const wishlistController = require("../controllers/wishlistController");
const recommendationsController = require("../controllers/recommendationsController");
const flashSalesController = require("../controllers/flashSalesController");
const notificationsController = require("../controllers/notificationsController");
const analyticsController = require("../controllers/analyticsController");

// =============================================
// WISHLIST ROUTES
// =============================================
router.post(
  "/wishlist/:productId",
  authenticateToken,
  wishlistController.addToWishlist
);

router.get("/wishlist", authenticateToken, wishlistController.getWishlist);

router.delete(
  "/wishlist/:productId",
  authenticateToken,
  wishlistController.removeFromWishlist
);

router.get(
  "/wishlist/check/:productId",
  authenticateToken,
  wishlistController.checkWishlist
);

router.get(
  "/wishlist/stats",
  authenticateToken,
  wishlistController.getWishlistStats
);

// =============================================
// RECOMMENDATIONS ROUTES
// =============================================
router.get(
  "/recommendations/similar/:productId",
  recommendationsController.getSimilarProducts
);

router.get(
  "/recommendations/personalized",
  authenticateToken,
  recommendationsController.getPersonalizedRecommendations
);

router.get(
  "/recommendations/trending",
  recommendationsController.getTrendingProducts
);

router.get(
  "/recommendations/recently-viewed",
  authenticateToken,
  recommendationsController.getRecentlyViewed
);

router.get(
  "/recommendations/bundle/:productId",
  recommendationsController.getBundleRecommendations
);

// =============================================
// FLASH SALES ROUTES
// =============================================
router.post(
  "/flash-sales",
  authenticateToken,
  // Add seller/admin middleware here
  flashSalesController.createFlashSale
);

router.get("/flash-sales/active", flashSalesController.getActiveFlashSales);

router.get("/flash-sales/upcoming", flashSalesController.getUpcomingFlashSales);

router.post(
  "/flash-sales/purchase",
  authenticateToken,
  flashSalesController.purchaseFlashSaleProduct
);

router.get(
  "/flash-sales/:flashSaleId/analytics",
  authenticateToken,
  // Add seller/admin middleware
  flashSalesController.getFlashSaleAnalytics
);

// =============================================
// NOTIFICATIONS ROUTES
// =============================================
router.get(
  "/notifications",
  authenticateToken,
  notificationsController.getNotifications
);

router.put(
  "/notifications/:notificationId/read",
  authenticateToken,
  notificationsController.markAsRead
);

router.put(
  "/notifications/read-all",
  authenticateToken,
  notificationsController.markAllAsRead
);

router.delete(
  "/notifications/:notificationId",
  authenticateToken,
  notificationsController.deleteNotification
);

router.get(
  "/notifications/preferences",
  authenticateToken,
  notificationsController.getPreferences
);

router.put(
  "/notifications/preferences",
  authenticateToken,
  notificationsController.updatePreferences
);

// Server-Sent Events for real-time notifications
router.get(
  "/notifications/stream",
  authenticateToken,
  notificationsController.streamNotifications
);

// =============================================
// ANALYTICS ROUTES
// =============================================
router.post("/analytics/track", analyticsController.trackEvent);

router.get(
  "/analytics/user",
  authenticateToken,
  analyticsController.getUserAnalytics
);

router.get(
  "/analytics/product/:productId",
  authenticateToken,
  // Add seller/admin middleware
  analyticsController.getProductAnalytics
);

router.get(
  "/analytics/seller",
  authenticateToken,
  // Add seller middleware
  analyticsController.getSellerAnalytics
);

router.get(
  "/analytics/platform",
  authenticateToken,
  // Add admin middleware
  analyticsController.getPlatformAnalytics
);

router.get("/analytics/trending", analyticsController.getTrendingProducts);

module.exports = router;
