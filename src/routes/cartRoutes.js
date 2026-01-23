// // src/routes/cart.js
// const express = require("express");
// const router = express.Router();
// const cartController = require("../controllers/cartController");
// const { authenticateUser } = require("../middleware/auth");

// router.post("/add", authenticateUser, cartController.addToCart);
// router.get("/", authenticateUser, cartController.getCart);
// router.put("/:item_id", authenticateUser, cartController.updateCart);
// router.delete("/:item_id", authenticateUser, cartController.removeFromCart);

// module.exports = router;

// routes/cartRoutes.js
const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { authenticateToken } = require("../middleware/auth");

// All cart routes require authentication
router.use(authenticateToken);

// Get user's cart
router.get("/", cartController.getCart);

// Add item to cart
router.post("/add", cartController.addToCart);

// Update item quantity
router.put("/:id/quantity", cartController.updateQuantity);

// Toggle item selection
router.put("/:id/select", cartController.toggleSelection);

// Select/deselect all items
router.put("/select-all", cartController.toggleSelectAll);

// Remove item from cart
router.delete("/:id", cartController.removeItem);

// Remove selected items
router.delete("/selected", cartController.removeSelected);

// Get cart summary
router.get("/summary", cartController.getCartSummary);

module.exports = router;

// Add to your main server.js or app.js:
// const cartRoutes = require('./routes/cartRoutes');
// app.use('/api/cart', cartRoutes);
