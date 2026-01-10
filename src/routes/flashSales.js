// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const {
  authenticateToken,
  requireRole,
  requireSeller,
} = require("../middleware/auth");
const flashSalesController = require("../controllers/flashSalesController");

// =============================================
// PUBLIC ROUTES
// =============================================

/**
 * @route   GET /api/flash-sales/active
 * @desc    Get currently active flash sales
 * @access  Public
 */
router.get("/active", flashSalesController.getActiveFlashSales);

/**
 * @route   GET /api/flash-sales/upcoming
 * @desc    Get upcoming scheduled flash sales
 * @access  Public
 */
router.get("/upcoming", flashSalesController.getUpcomingFlashSales);

/**
 * @route   GET /api/flash-sales/:flashSaleId
 * @desc    Get specific flash sale details
 * @access  Public
 */
router.get("/:flashSaleId", flashSalesController.getFlashSaleDetails);

// =============================================
// CUSTOMER ROUTES (Authenticated)
// =============================================

/**
 * @route   POST /api/flash-sales/purchase
 * @desc    Purchase a flash sale product
 * @access  Private
 * @body    { flashSaleProductId, quantity }
 */
router.post(
  "/purchase",
  authenticateToken,
  flashSalesController.purchaseFlashSaleProduct
);

// =============================================
// SELLER/ADMIN ROUTES
// =============================================

/**
 * @route   POST /api/flash-sales
 * @desc    Create a new flash sale
 * @access  Private (Seller/Admin)
 * @body    { title, description, startTime, endTime, productIds, discountPercentage, maxQuantity }
 */
router.post(
  "/",
  authenticateToken,
  requireSeller,
  flashSalesController.createFlashSale
);

/**
 * @route   PUT /api/flash-sales/:flashSaleId/status
 * @desc    Update flash sale status
 * @access  Private (Seller/Admin)
 * @body    { status: 'scheduled' | 'active' | 'ended' | 'cancelled' }
 */
router.put(
  "/:flashSaleId/status",
  authenticateToken,
  requireSeller,
  flashSalesController.updateFlashSaleStatus
);

/**
 * @route   GET /api/flash-sales/:flashSaleId/analytics
 * @desc    Get flash sale analytics and performance data
 * @access  Private (Seller/Admin)
 */
router.get(
  "/:flashSaleId/analytics",
  authenticateToken,
  requireSeller,
  flashSalesController.getFlashSaleAnalytics
);

/**
 * @route   DELETE /api/flash-sales/:flashSaleId
 * @desc    Delete a scheduled flash sale (before it starts)
 * @access  Private (Admin only)
 */
router.delete(
  "/:flashSaleId",
  authenticateToken,
  requireRole("admin"),
  flashSalesController.deleteFlashSale
);

module.exports = router;
