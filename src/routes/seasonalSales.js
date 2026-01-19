// src/routes/seasonalSales.js
const express = require("express");
const router = express.Router();
const seasonalSalesController = require("../controllers/seasonalSalesController");

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

// Public routes
router.get("/active", seasonalSalesController.getActiveSeasonalSales);
router.get(
  "/product/:productId",
  seasonalSalesController.getSeasonalSaleByProductId
);
router.get(
  "/:saleId/products",
  seasonalSalesController.getSeasonalSaleProducts
);
router.get("/:saleId", seasonalSalesController.getSeasonalSaleById);

module.exports = router;
