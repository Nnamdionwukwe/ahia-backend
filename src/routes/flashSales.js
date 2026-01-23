// // src/routes/flashSales.js
// const express = require("express");
// const router = express.Router();
// const flashSalesController = require("../controllers/flashSalesController");

// // Try to import auth middleware, but don't fail if it doesn't exist
// let authenticate, authorize;
// try {
//   const authMiddleware = require("../middleware/auth");
//   if (authMiddleware.authenticateToken) {
//     authenticate = authMiddleware.authenticateToken;
//   }
//   if (authMiddleware.requireRole) {
//     authorize = authMiddleware.requireRole;
//   }
// } catch (err) {
//   console.warn("Auth middleware not available for flash sales routes");
//   authenticate = (req, res, next) => next();
//   authorize =
//     (...roles) =>
//     (req, res, next) =>
//       next();
// }

// // Public GET routes - MUST come BEFORE parameterized routes
// router.get("/active", flashSalesController.getActiveFlashSales);
// router.get("/upcoming", flashSalesController.getUpcomingFlashSales);

// // List route with query parameters (status param)
// router.get("/", flashSalesController.getAllFlashSales);

// // Specific flash sale routes - MUST come AFTER generic routes
// router.get("/product/:productId", flashSalesController.getFlashSaleByProductId);
// router.get("/:flashSaleId/products", flashSalesController.getFlashSaleProducts);
// router.get(
//   "/:flashSaleId/analytics",
//   flashSalesController.getFlashSaleAnalytics
// );
// router.get("/:flashSaleId", flashSalesController.getFlashSaleById);

// // Admin routes - POST, PUT, DELETE
// router.post(
//   "/",
//   authenticate,
//   authorize("admin", "seller"),
//   flashSalesController.createFlashSale
// );

// router.put(
//   "/:flashSaleId/status",
//   authenticate,
//   authorize("admin"),
//   flashSalesController.updateFlashSaleStatus
// );

// router.delete(
//   "/:flashSaleId",
//   authenticate,
//   authorize("admin"),
//   flashSalesController.deleteFlashSale
// );

// module.exports = router;

// src/routes/flashSales.js
const express = require("express");
const router = express.Router();
const flashSalesController = require("../controllers/flashSalesController");

// Try to import auth middleware, but don't fail if it doesn't exist
let authenticate, authorize;
try {
  const authMiddleware = require("../middleware/auth");
  if (authMiddleware.authenticateToken) {
    authenticate = authMiddleware.authenticateToken;
  }
  if (authMiddleware.requireRole) {
    authorize = authMiddleware.requireRole;
  }
} catch (err) {
  console.warn("Auth middleware not available for flash sales routes");
  authenticate = (req, res, next) => next();
  authorize =
    (...roles) =>
    (req, res, next) =>
      next();
}

// ========================================
// PUBLIC GET ROUTES (Order matters!)
// ========================================

// Specific named routes FIRST
router.get("/active", flashSalesController.getActiveFlashSales);
router.get("/upcoming", flashSalesController.getUpcomingFlashSales);

// Product-specific routes
router.get(
  "/product/:productId/all",
  flashSalesController.getFlashSaleByProductId
);
router.get("/product/:productId", flashSalesController.getFlashSaleByProductId);

// Generic list route
router.get("/", flashSalesController.getAllFlashSales);

// Specific flash sale routes with :flashSaleId
router.get("/:flashSaleId/products", flashSalesController.getFlashSaleProducts);
router.get(
  "/:flashSaleId/analytics",
  flashSalesController.getFlashSaleAnalytics
);
router.get("/:flashSaleId", flashSalesController.getFlashSaleById);

// ========================================
// ADMIN ROUTES - POST, PUT, DELETE
// ========================================

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
