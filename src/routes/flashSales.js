// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const flashSalesController = require("../controllers/flashSalesController");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Public routes (no authentication required)
// Get all flash sales (list view)
router.get("/", flashSalesController.getAllFlashSales);

// Get active flash sales only (for homepage)
router.get("/active", flashSalesController.getActiveFlashSales);

// Get upcoming flash sales
router.get("/upcoming", flashSalesController.getUpcomingFlashSales);

// Get specific flash sale by ID with all its products
router.get("/:flashSaleId", flashSalesController.getFlashSaleById);

// Get products for a specific flash sale (with pagination and sorting)
router.get("/:flashSaleId/products", flashSalesController.getFlashSaleProducts);

// Protected routes (require authentication)
// Purchase flash sale product
router.post(
  "/purchase",
  authenticateToken,
  flashSalesController.purchaseFlashSaleProduct
);

// Admin/Seller routes (require specific roles)
// Get flash sale analytics (Admin/Seller only)
router.get(
  "/:flashSaleId/analytics",
  authenticateToken,
  requireRole("admin", "seller"),
  flashSalesController.getFlashSaleAnalytics
);

// Create flash sale
router.post(
  "/create",
  authenticateToken,
  requireRole("admin", "seller"),
  flashSalesController.createFlashSale
);

// Update flash sale status
router.patch(
  "/:flashSaleId/status",
  authenticateToken,
  requireRole("admin", "seller"),
  flashSalesController.updateFlashSaleStatus
);

// Delete flash sale (Admin only)
router.delete(
  "/:flashSaleId",
  authenticateToken,
  requireRole("admin"),
  flashSalesController.deleteFlashSale
);

module.exports = router;
