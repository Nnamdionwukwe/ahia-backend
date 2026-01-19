// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const flashSalesController = require("../controllers/flashSalesController");

// Import auth middleware
const { authenticateToken, requireRole } = require("../middleware/auth");

// Public routes - GET endpoints (MUST come before /:id routes)
router.get("/active", flashSalesController.getActiveFlashSales);
router.get("/upcoming", flashSalesController.getUpcomingFlashSales);
router.get("/product/:productId", flashSalesController.getFlashSaleByProductId);

// Routes with parameters
router.get("/:flashSaleId/products", flashSalesController.getFlashSaleProducts);
router.get(
  "/:flashSaleId/analytics",
  flashSalesController.getFlashSaleAnalytics
);
router.get("/:flashSaleId", flashSalesController.getFlashSaleById);

// Admin routes - POST, PUT, DELETE
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "seller"),
  flashSalesController.createFlashSale
);

router.put(
  "/:flashSaleId/status",
  authenticateToken,
  requireRole("admin"),
  flashSalesController.updateFlashSaleStatus
);

router.delete(
  "/:flashSaleId",
  authenticateToken,
  requireRole("admin"),
  flashSalesController.deleteFlashSale
);

module.exports = router;
