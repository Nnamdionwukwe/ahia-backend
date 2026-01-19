// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");
const { authenticate, authorize } = require("../middleware/auth");

// Public routes
router.get("/active", seasonalSalesController.getActiveSeasonalSales);
router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId
);
router.get("/:saleId", seasonalSalesController.getSeasonalSaleById);

module.exports = router;
