// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");

// Import auth middleware
const { authenticateToken, requireRole } = require("../middleware/auth");

// ========================================
// PUBLIC ROUTES (MUST come before /:id routes)
// ========================================

// Get all active seasonal sales (for homepage)
router.get("/active", seasonalSalesController.getActiveSeasonalSales);

// Get seasonal sale for a specific product
router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId
);

// ========================================
// ROUTES WITH PARAMETERS
// ========================================

// Get products for a specific seasonal sale
router.get(
  "/:saleId/products",
  seasonalSalesController.getSeasonalSaleProducts
);

// Get seasonal sale by ID
router.get("/:saleId", seasonalSalesController.getSeasonalSaleById);

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
