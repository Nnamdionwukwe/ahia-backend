// src/routes/wishlist.js
const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishlistController");
const { authenticateUser } = require("../middleware/auth");

router.post(
  "/add/:productId",
  authenticateUser,
  wishlistController.addToWishlist
);
router.delete(
  "/remove/:productId",
  authenticateUser,
  wishlistController.removeFromWishlist
);
router.get("/", authenticateUser, wishlistController.getWishlist);
router.get(
  "/check/:productId",
  authenticateUser,
  wishlistController.checkWishlist
);

module.exports = router;
