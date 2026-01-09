const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { authenticateUser } = require("../middleware/auth"); // ADD THIS LINE

router.get("/", productController.getProducts);
router.get("/:id/details", productController.getProductDetails);
router.get("/search", productController.searchProducts);
router.post("/:id/view", authenticateUser, productController.trackView);

module.exports = router;
