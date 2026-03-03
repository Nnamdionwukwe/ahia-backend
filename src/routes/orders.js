// src/routes/orders.js
const express         = require("express");
const router          = express.Router();
const orderController = require("../controllers/orderController");
const { authenticateUser } = require("../middleware/auth");
const { handleReturnUpload } = require("../middleware/upload");

router.post("/checkout",         authenticateUser, orderController.checkout);
router.get("/",                  authenticateUser, orderController.getOrders);
router.get("/returns",           authenticateUser, orderController.getMyReturns);
router.get("/returns/:returnId", authenticateUser, orderController.getReturnDetails);
router.get("/:id",               authenticateUser, orderController.getOrderDetails);
router.put("/:id/cancel",        authenticateUser, orderController.cancelOrder);

router.post(
  "/:id/return",
  authenticateUser,
  handleReturnUpload,
  orderController.returnOrder,
);

module.exports = router;
