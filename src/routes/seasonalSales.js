// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");

// Import auth middleware
const { authenticateToken, requireRole } = require("../middleware/auth");

// ========================================
// PUBLIC ROUTES (Order matters!)
// ========================================

// Specific named routes FIRST
router.get("/active", seasonalSalesController.getActiveSeasonalSales);

// Product-specific routes
router.get(
  "/product/:productId/all",
  seasonalSalesController.getSeasonalSaleByProductId
);
router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId
);

// Generic list route
router.get("/", seasonalSalesController.getAllSeasonalSales);

// Specific seasonal sale routes with :saleId
router.get(
  "/:saleId/products",
  seasonalSalesController.getSeasonalSaleProducts
);

// Get seasonal sale by ID
router.get("/:saleId", seasonalSalesController.getSeasonalSaleById);

// In seasonalSales.js routes file
router.get(
  "/product/:productId/all",
  seasonalSalesController.getAllSeasonalSalesByProductId
);
router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId
);

// ========================================
// ADMIN ROUTES (Protected)
// ========================================

// Create new seasonal sale (Admin only)
router.post(
  "/",
  authenticateToken,
  requireRole("admin"),
  seasonalSalesController.createSeasonalSale
);

// Update seasonal sale status (Admin only)
router.patch(
  "/:saleId/status",
  authenticateToken,
  requireRole("admin"),
  seasonalSalesController.updateSeasonalSaleStatus
);

// Delete seasonal sale (Admin only)
router.delete(
  "/:saleId",
  authenticateToken,
  requireRole("admin"),
  seasonalSalesController.deleteSeasonalSale
);

module.exports = router;
