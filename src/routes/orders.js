// src/routes/orders.js
const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { authenticateUser } = require("../middleware/auth");

router.post("/checkout", authenticateUser, orderController.checkout);
router.get("/", authenticateUser, orderController.getOrders);
router.get("/:id", authenticateUser, orderController.getOrderDetails);
router.put("/:id/cancel", authenticateUser, orderController.cancelOrder);

module.exports = router;
