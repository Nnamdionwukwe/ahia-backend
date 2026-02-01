// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");
const { authenticateToken, requireRole } = require("../middleware/auth");

// ========================================
// PUBLIC ROUTES (Order matters!)
// ========================================

// Specific named routes FIRST
router.get("/active", seasonalSalesController.getActiveSeasonalSales);

// Product-specific routes - /all route MUST come before /:productId
router.get(
  "/product/:productId/all",
  seasonalSalesController.getAllSeasonalSalesByProductId, // Use the ALL function
);

router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId, // Use the SINGLE function
);

// Generic list route
router.get("/", seasonalSalesController.getAllSeasonalSales);

// Specific seasonal sale routes with :saleId
router.get(
  "/:saleId/products",
  seasonalSalesController.getSeasonalSaleProducts,
);
router.get("/:saleId", seasonalSalesController.getSeasonalSaleById);

// ========================================
// ADMIN ROUTES (Protected)
// ========================================

router.post(
  "/",
  authenticateToken,
  requireRole("admin"),
  seasonalSalesController.createSeasonalSale,
);

router.patch(
  "/:saleId/status",
  authenticateToken,
  requireRole("admin"),
  seasonalSalesController.updateSeasonalSaleStatus,
);

router.delete(
  "/:saleId",
  authenticateToken,
  requireRole("admin"),
  seasonalSalesController.deleteSeasonalSale,
);

module.exports = router;
