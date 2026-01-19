// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");

// Create dummy middleware if auth doesn't exist
const authenticate = (req, res, next) => {
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    next();
  };
};

// Try to use real auth middleware if available
try {
  const authMiddleware = require("../middleware/auth");
  if (authMiddleware.authenticate) {
    module.authenticate = authMiddleware.authenticate;
  }
  if (authMiddleware.authorize) {
    module.authorize = authMiddleware.authorize;
  }
} catch (err) {
  // Auth middleware not available - use dummy middleware above
  console.warn("Auth middleware not available for seasonal sales routes");
}

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

module.exports = router;
