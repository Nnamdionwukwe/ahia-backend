// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const flashSalesController = require("../controllers/flashSalesController");
const { authenticate, authorize } = require("../middleware/auth");

// Public routes - GET endpoints
router.get("/active", flashSalesController.getActiveFlashSales);
router.get("/upcoming", flashSalesController.getUpcomingFlashSales);
router.get("/product/:productId", flashSalesController.getFlashSaleByProductId);
router.get("/:flashSaleId/products", flashSalesController.getFlashSaleProducts);
router.get(
  "/:flashSaleId/analytics",
  flashSalesController.getFlashSaleAnalytics
);
router.get("/:flashSaleId", flashSalesController.getFlashSaleById);

// Admin routes - POST, PUT, DELETE endpoints
router.post(
  "/",
  authenticate,
  authorize("admin", "seller"),
  flashSalesController.createFlashSale
);
router.put(
  "/:flashSaleId/status",
  authenticate,
  authorize("admin"),
  flashSalesController.updateFlashSaleStatus
);
router.delete(
  "/:flashSaleId",
  authenticate,
  authorize("admin"),
  flashSalesController.deleteFlashSale
);

module.exports = router;
