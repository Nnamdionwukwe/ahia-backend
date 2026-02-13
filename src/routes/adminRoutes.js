// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const flashSalesController = require("../controllers/flashSalesController");
const seasonalSalesController = require("../controllers/seasonalSalesController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// ========================================================
// USERS MANAGEMENT
// ========================================================
router.get(
  "/users",
  authenticateToken,
  requireAdmin,
  adminController.getAllUsers,
);

router.get(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.getUserById,
);

router.put(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.updateUser,
);

router.delete(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  adminController.deleteUser,
);

router.patch(
  "/users/:userId/verify",
  authenticateToken,
  requireAdmin,
  adminController.verifyUser,
);

router.patch(
  "/users/:userId/role",
  authenticateToken,
  requireAdmin,
  adminController.updateUserRole,
);

router.get(
  "/users/:userId/orders",
  authenticateToken,
  requireAdmin,
  adminController.getUserOrders,
);

router.get(
  "/users/:userId/addresses",
  authenticateToken,
  requireAdmin,
  adminController.getUserAddresses,
);

router.get(
  "/users/:userId/stats",
  authenticateToken,
  requireAdmin,
  adminController.getUserStats,
);

// ========================================================
// ORDERS MANAGEMENT
// ========================================================
router.get(
  "/orders",
  authenticateToken,
  requireAdmin,
  adminController.getAllOrders,
);

router.put(
  "/orders/:orderId/status",
  authenticateToken,
  requireAdmin,
  adminController.updateOrderStatus,
);

// ========================================================
// FLASH SALES MANAGEMENT
// ========================================================

// Get all flash sales (with filters)
router.get(
  "/flash-sales",
  authenticateToken,
  requireAdmin,
  flashSalesController.getAllFlashSales,
);

// Get specific flash sale details
router.get(
  "/flash-sales/:flashSaleId",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleById,
);

// Get flash sale products
router.get(
  "/flash-sales/:flashSaleId/products",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleProducts,
);

// Get flash sale analytics
router.get(
  "/flash-sales/:flashSaleId/analytics",
  authenticateToken,
  requireAdmin,
  flashSalesController.getFlashSaleAnalytics,
);

// Create new flash sale
router.post(
  "/flash-sales",
  authenticateToken,
  requireAdmin,
  flashSalesController.createFlashSale,
);

// Update flash sale status
router.put(
  "/flash-sales/:flashSaleId/status",
  authenticateToken,
  requireAdmin,
  flashSalesController.updateFlashSaleStatus,
);

// Delete flash sale
router.delete(
  "/flash-sales/:flashSaleId",
  authenticateToken,
  requireAdmin,
  flashSalesController.deleteFlashSale,
);

// ========================================================
// SEASONAL SALES MANAGEMENT
// ========================================================

// Get all seasonal sales (with filters)
router.get(
  "/seasonal-sales",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getAllSeasonalSales,
);

// Get specific seasonal sale details
router.get(
  "/seasonal-sales/:saleId",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getSeasonalSaleById,
);

// Get seasonal sale products
router.get(
  "/seasonal-sales/:saleId/products",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.getSeasonalSaleProducts,
);

// Create new seasonal sale
router.post(
  "/seasonal-sales",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.createSeasonalSale,
);

// Update seasonal sale status
router.patch(
  "/seasonal-sales/:saleId/status",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.updateSeasonalSaleStatus,
);

// Delete seasonal sale
router.delete(
  "/seasonal-sales/:saleId",
  authenticateToken,
  requireAdmin,
  seasonalSalesController.deleteSeasonalSale,
);

// ========================================================
// ANALYTICS
// ========================================================
router.get(
  "/analytics/platform",
  authenticateToken,
  requireAdmin,
  adminController.getPlatformAnalytics,
);

module.exports = router;
