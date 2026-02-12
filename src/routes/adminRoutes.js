// src/routes/admin.js - CLEAN VERSION (with controller)
const express = require("express");
const router = express.Router();
const { authenticateToken, requireRole } = require("../middleware/auth");
const analyticsController = require("../controllers/analyticsController");
const adminController = require("../controllers/adminController");

/**
 * Admin Routes
 * All routes require admin authentication
 */

// Apply admin authentication to all routes
router.use(authenticateToken);
router.use(requireRole("admin"));

/**
 * ========================================
 * ANALYTICS ENDPOINTS
 * ========================================
 */

// Get platform-wide analytics
router.get("/analytics/platform", analyticsController.getPlatformAnalytics);

// Get trending products
router.get("/analytics/trending", analyticsController.getTrendingProducts);

/**
 * ========================================
 * USER MANAGEMENT ENDPOINTS
 * ========================================
 */

// Get all users with pagination and search
router.get("/users", adminController.getUsers);

// Get single user details
router.get("/users/:userId", adminController.getUserDetails);

// Update user (admin action)
router.put("/users/:userId", adminController.updateUser);

// Delete user (admin action)
router.delete("/users/:userId", adminController.deleteUser);

/**
 * ========================================
 * ORDERS MANAGEMENT
 * ========================================
 */

// Get all orders
router.get("/orders", adminController.getOrders);

/**
 * ========================================
 * PRODUCTS MANAGEMENT
 * ========================================
 */

// Get all products (admin view)
router.get("/products", adminController.getProducts);

/**
 * ========================================
 * DASHBOARD STATS
 * ========================================
 */

// Get dashboard overview stats
router.get("/dashboard", adminController.getDashboardStats);

module.exports = router;
