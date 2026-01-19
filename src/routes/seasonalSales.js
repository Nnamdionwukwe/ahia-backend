// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");

// Import auth middleware
const { authenticateToken, requireRole } = require("../middleware/auth");

// Public routes (MUST come before /:id routes)
router.get("/active", seasonalSalesController.getActiveSeasonalSales);
router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId
);

// Routes with parameters
router.get(
  "/:saleId/products",
  seasonalSalesController.getSeasonalSaleProducts
);
router.get("/:saleId", seasonalSalesController.getSeasonalSaleById);

// Admin routes could go here when needed
// router.post("/", authenticateToken, requireRole("admin"), seasonalSalesController.createSeasonalSale);

module.exports = router;
