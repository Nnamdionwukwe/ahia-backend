// src/routes/phase5Routes.js
const express = require("express");
const router = express.Router();
const { authenticateToken, requireRole } = require("../middleware/auth");

// Controllers
const searchController = require("../controllers/searchController");
const chatController = require("../controllers/chatController");
const loyaltyController = require("../controllers/loyaltyController");
const fraudDetectionController = require("../controllers/fraudDetectionController");

// =============================================
// ADVANCED SEARCH (Elasticsearch)
// =============================================
router.get("/search", searchController.advancedSearch);
router.get("/search/autocomplete", searchController.autocomplete);
router.get("/search/suggestions", searchController.searchSuggestions);
router.get("/search/similar/:productId", searchController.findSimilarProducts);

// Admin only - reindex products
router.post(
  "/search/reindex",
  authenticateToken,
  requireRole("admin"),
  searchController.reindexAllProducts
);

// =============================================
// CHAT SUPPORT
// =============================================
router.post(
  "/chat/conversations",
  authenticateToken,
  chatController.startConversation
);

router.get(
  "/chat/conversations",
  authenticateToken,
  chatController.getConversations
);

router.get(
  "/chat/conversations/:conversationId/messages",
  authenticateToken,
  chatController.getMessages
);

router.post(
  "/chat/conversations/:conversationId/messages",
  authenticateToken,
  chatController.sendMessage
);

router.put(
  "/chat/conversations/:conversationId/close",
  authenticateToken,
  chatController.closeConversation
);

router.post(
  "/chat/conversations/:conversationId/typing",
  authenticateToken,
  chatController.setTyping
);

router.get("/chat/stream", authenticateToken, chatController.chatStream);

router.get(
  "/chat/analytics",
  authenticateToken,
  chatController.getChatAnalytics
);

router.post(
  "/chat/suggest-response",
  authenticateToken,
  chatController.suggestResponse
);

// =============================================
// LOYALTY & REWARDS
// =============================================
router.get(
  "/loyalty/account",
  authenticateToken,
  loyaltyController.getLoyaltyAccount
);

router.get(
  "/loyalty/transactions",
  authenticateToken,
  loyaltyController.getTransactionHistory
);

router.get(
  "/loyalty/rewards",
  authenticateToken,
  loyaltyController.getAvailableRewards
);

router.post(
  "/loyalty/rewards/:rewardId/redeem",
  authenticateToken,
  loyaltyController.redeemReward
);

router.get(
  "/loyalty/user-rewards",
  authenticateToken,
  loyaltyController.getUserRewards
);

router.post(
  "/loyalty/apply-reward",
  authenticateToken,
  loyaltyController.applyRewardToOrder
);

router.get(
  "/loyalty/referral-code",
  authenticateToken,
  loyaltyController.generateReferralCode
);

// =============================================
// FRAUD DETECTION (Admin/Review Team)
// =============================================
router.get(
  "/fraud/cases",
  authenticateToken,
  requireRole("admin"),
  fraudDetectionController.getFraudCases
);

router.put(
  "/fraud/cases/:fraudCheckId/review",
  authenticateToken,
  requireRole("admin"),
  fraudDetectionController.reviewFraudCase
);

router.get(
  "/fraud/analytics",
  authenticateToken,
  requireRole("admin"),
  fraudDetectionController.getFraudAnalytics
);

module.exports = router;
