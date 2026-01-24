// routes/cartRoutes.js
const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { authenticateToken } = require("../middleware/auth");

// All cart routes require authentication
router.use(authenticateToken);

// Get user's cart
router.get("/", cartController.getCart);

// Get cart summary
router.get("/summary", cartController.getCartSummary);

// Add item to cart
router.post("/add", cartController.addToCart);

// ⚠️ IMPORTANT: Specific routes MUST come BEFORE parameterized routes!

// Select/deselect all items - MUST be before /:id
router.put("/select-all", cartController.toggleSelectAll);

// Remove selected items - MUST be before /:id
router.delete("/selected", cartController.removeSelected);

// Update item quantity - can be after /selected since it has /quantity
router.put("/:id/quantity", cartController.updateQuantity);

// Toggle item selection - can be after /selected since it has /select
router.put("/:id/select", cartController.toggleSelection);

// Remove single item - MUST be LAST among DELETE routes
router.delete("/:id", cartController.removeItem);

module.exports = router;
