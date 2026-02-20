// routes/adminCartRoutes.js
const express = require("express");
const router = express.Router();
const adminCartController = require("../controllers/adminCartController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// All admin cart routes require auth + admin role
router.use(authenticateToken);
router.use(requireAdmin); // remove this line if you handle role checks in authenticateToken

// ⚠️ IMPORTANT: specific routes BEFORE parameterized routes

// GET /api/admin/carts/stats  — MUST be before /:userId
router.get("/stats", adminCartController.getStats);

// GET /api/admin/carts        — paginated list
router.get("/", adminCartController.getAllCarts);

// DELETE /api/admin/carts/items/:itemId  — MUST be before /:userId
router.delete("/items/:itemId", adminCartController.removeCartItem);

// GET    /api/admin/carts/:userId/items
router.get("/:userId/items", adminCartController.getUserCartItems);

// DELETE /api/admin/carts/:userId  — clear entire user cart
router.delete("/:userId", adminCartController.clearUserCart);

module.exports = router;
