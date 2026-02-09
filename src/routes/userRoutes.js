// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * User Routes
 * All routes require authentication
 */

// Profile routes
router.get("/profile", authMiddleware, userController.getProfile);
router.put("/profile", authMiddleware, userController.updateProfile);
router.delete("/account", authMiddleware, userController.deleteAccount);

// Password management
router.post("/change-password", authMiddleware, userController.changePassword);

// Order history
router.get("/orders", authMiddleware, userController.getOrderHistory);

// Address management
router.get("/addresses", authMiddleware, userController.getAddresses);
router.post("/addresses", authMiddleware, userController.addAddress);
router.put("/addresses/:id", authMiddleware, userController.updateAddress);
router.delete("/addresses/:id", authMiddleware, userController.deleteAddress);

// User statistics
router.get("/stats", authMiddleware, userController.getUserStats);

module.exports = router;
