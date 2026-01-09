// src/routes/search.js
const express = require("express");
const router = express.Router();
// const { authenticateToken, requireRole } = require("../middleware/auth");

const searchController = require("../controllers/searchController");
const { authenticateToken, requireRole } = require("../middleware/auth");

/**
 * @route   GET /api/search
 * @desc    Advanced search with filters and facets
 * @access  Public
 * @query   q, category, minPrice, maxPrice, rating, inStock, sort, page, limit
 */
router.get("/", searchController.advancedSearch);

/**
 * @route   GET /api/search/autocomplete
 * @desc    Get autocomplete suggestions
 * @access  Public
 * @query   q (min 2 characters)
 */
router.get("/autocomplete", searchController.autocomplete);

/**
 * @route   GET /api/search/suggestions
 * @desc    Get "did you mean?" suggestions for typos
 * @access  Public
 * @query   q
 */
router.get("/suggestions", searchController.searchSuggestions);

/**
 * @route   GET /api/search/similar/:productId
 * @desc    Find similar products using More Like This
 * @access  Public
 * @param   productId - UUID of the product
 */
router.get("/similar/:productId", searchController.findSimilarProducts);

/**
 * @route   POST /api/search/reindex
 * @desc    Reindex all products in Elasticsearch
 * @access  Admin only
 */
router.post(
  "/reindex",
  authenticateToken,
  requireRole("admin"),
  searchController.reindexAllProducts
);

module.exports = router;
