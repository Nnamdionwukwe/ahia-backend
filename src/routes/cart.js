// src/routes/cart.js
const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { authenticateUser } = require("../middleware/auth");

router.post("/add", authenticateUser, cartController.addToCart);
router.get("/", authenticateUser, cartController.getCart);
router.put("/:item_id", authenticateUser, cartController.updateCart);
router.delete("/:item_id", authenticateUser, cartController.removeFromCart);

module.exports = router;
