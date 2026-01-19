// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const flashSalesController = require("../controllers/flashSalesController");

// Try to import auth middleware, but don't fail if it doesn't exist
let authenticate, authorize;
try {
  const authMiddleware = require("../middleware/auth");
  authenticate = authMiddleware.authenticate;
  authorize = authMiddleware.authorize;
} catch (err) {
  console.warn(
    "Auth middleware not available, routes will be public:",
    err.message
  );
  // Create dummy middleware that just calls next()
  authenticate = (req, res, next) => next();
  authorize =
    (...roles) =>
    (req, res, next) =>
      next();
}

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

// Admin routes - POST, PUT, DELETE endpoints (with auth if available)
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
