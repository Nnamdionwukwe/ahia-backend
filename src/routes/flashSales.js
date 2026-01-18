// // src/routes/flashSales.js
// const express = require("express");
// const router = express.Router();
// const {
//   authenticateToken,
//   requireRole,
//   requireSeller,
// } = require("../middleware/auth");
// const flashSalesController = require("../controllers/flashSalesController");

// // =============================================
// // PUBLIC ROUTES
// // =============================================

// /**
//  * @route   GET /api/flash-sales/active
//  * @desc    Get currently active flash sales
//  * @access  Public
//  */
// router.get("/active", flashSalesController.getActiveFlashSales);

// /**
//  * @route   GET /api/flash-sales/upcoming
//  * @desc    Get upcoming scheduled flash sales
//  * @access  Public
//  */
// router.get("/upcoming", flashSalesController.getUpcomingFlashSales);

// /**
//  * @route   GET /api/flash-sales/:flashSaleId
//  * @desc    Get specific flash sale details
//  * @access  Public
//  */
// router.get("/:flashSaleId", flashSalesController.getFlashSaleDetails);

// // =============================================
// // CUSTOMER ROUTES (Authenticated)
// // =============================================

// /**
//  * @route   POST /api/flash-sales/purchase
//  * @desc    Purchase a flash sale product
//  * @access  Private
//  * @body    { flashSaleProductId, quantity }
//  */
// router.post(
//   "/purchase",
//   authenticateToken,
//   flashSalesController.purchaseFlashSaleProduct
// );

// // =============================================
// // SELLER/ADMIN ROUTES
// // =============================================

// /**
//  * @route   POST /api/flash-sales
//  * @desc    Create a new flash sale
//  * @access  Private (Seller/Admin)
//  * @body    { title, description, startTime, endTime, productIds, discountPercentage, maxQuantity }
//  */
// router.post(
//   "/",
//   authenticateToken,
//   requireSeller,
//   flashSalesController.createFlashSale
// );

// /**
//  * @route   PUT /api/flash-sales/:flashSaleId/status
//  * @desc    Update flash sale status
//  * @access  Private (Seller/Admin)
//  * @body    { status: 'scheduled' | 'active' | 'ended' | 'cancelled' }
//  */
// router.put(
//   "/:flashSaleId/status",
//   authenticateToken,
//   requireSeller,
//   flashSalesController.updateFlashSaleStatus
// );

// /**
//  * @route   GET /api/flash-sales/:flashSaleId/analytics
//  * @desc    Get flash sale analytics and performance data
//  * @access  Private (Seller/Admin)
//  */
// router.get(
//   "/:flashSaleId/analytics",
//   authenticateToken,
//   requireSeller,
//   flashSalesController.getFlashSaleAnalytics
// );

// /**
//  * @route   DELETE /api/flash-sales/:flashSaleId
//  * @desc    Delete a scheduled flash sale (before it starts)
//  * @access  Private (Admin only)
//  */
// router.delete(
//   "/:flashSaleId",
//   authenticateToken,
//   requireRole("admin"),
//   flashSalesController.deleteFlashSale
// );

// module.exports = router;

// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const flashSalesController = require("../controllers/flashSalesController");
const { protect, authorize } = require("../middleware/auth");

// Public routes
// Get all flash sales (list)
router.get("/", flashSalesController.getAllFlashSales);

// Get active flash sales only (for homepage)
router.get("/active", flashSalesController.getActiveFlashSales);

// Get upcoming flash sales
router.get("/upcoming", flashSalesController.getUpcomingFlashSales);

// Get specific flash sale by ID with all its products
router.get("/:flashSaleId", flashSalesController.getFlashSaleById);

// Get products for a specific flash sale (with pagination and sorting)
router.get("/:flashSaleId/products", flashSalesController.getFlashSaleProducts);

// Get flash sale analytics (Admin/Seller only)
router.get(
  "/:flashSaleId/analytics",
  protect,
  authorize("admin", "seller"),
  flashSalesController.getFlashSaleAnalytics
);

// Protected routes
// Purchase flash sale product
router.post(
  "/purchase",
  protect,
  flashSalesController.purchaseFlashSaleProduct
);

// Admin/Seller routes
// Create flash sale
router.post(
  "/create",
  protect,
  authorize("admin", "seller"),
  flashSalesController.createFlashSale
);

// Update flash sale status
router.patch(
  "/:flashSaleId/status",
  protect,
  authorize("admin", "seller"),
  flashSalesController.updateFlashSaleStatus
);

// Delete flash sale
router.delete(
  "/:flashSaleId",
  protect,
  authorize("admin"),
  flashSalesController.deleteFlashSale
);

module.exports = router;
