// routes/wishlist.js - FIXED VERSION
const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishlistController");
const { authenticateToken } = require("../middleware/auth");

// All wishlist routes require authentication
router.use(authenticateToken);

// Get wishlist
router.get("/", wishlistController.getWishlist);

// Get wishlist count
router.get("/count", wishlistController.getWishlistCount);

// Check if product is in wishlist
router.get("/check/:productId", wishlistController.checkWishlist);

// Add to wishlist
router.post("/add/:productId", wishlistController.addToWishlist);

// Remove from wishlist
router.delete("/remove/:productId", wishlistController.removeFromWishlist);

// Clear entire wishlist
router.delete("/clear", wishlistController.clearWishlist);

module.exports = router;
