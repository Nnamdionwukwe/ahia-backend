const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { authenticateUser, requireRole } = require("../middleware/auth");

// Public routes
router.get("/", productController.getProducts);
router.get("/search", productController.searchProducts);
router.get("/brands", productController.getBrands);
router.get("/tags", productController.getTags);
router.get("/categories", productController.getCategories);
router.get("/:id/details", productController.getProductDetails);
router.get("/:productId/variants", productController.getProductVariants);

// Protected routes
router.post("/:id/view", authenticateUser, productController.trackView);

// Admin routes
router.post(
  "/",
  authenticateUser,
  requireRole("admin"),
  productController.createProduct
);
router.put(
  "/:id",
  authenticateUser,
  requireRole("admin"),
  productController.updateProduct
);
router.delete(
  "/:id",
  authenticateUser,
  requireRole("admin"),
  productController.deleteProduct
);
router.delete(
  "/:id/cache",
  authenticateUser,
  requireRole("admin"),
  productController.clearCache
);

// Variant management (Admin)
router.post(
  "/:id/variants",
  authenticateUser,
  requireRole("admin"),
  productController.createVariant
);
router.put(
  "/:id/variants/:variantId",
  authenticateUser,
  requireRole("admin"),
  productController.updateVariant
);
router.delete(
  "/:id/variants/:variantId",
  authenticateUser,
  requireRole("admin"),
  productController.deleteVariant
);

module.exports = router;
