// src/routes/chat.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const chatController = require("../controllers/chatController");

/**
 * @route   POST /api/chat/conversations
 * @desc    Start a new chat conversation
 * @access  Private
 * @body    { sellerId?, productId?, subject }
 * @example
 * POST /api/chat/conversations
 * {
 *   "sellerId": "uuid-here",
 *   "productId": "uuid-here",
 *   "subject": "Question about product"
 * }
 */
router.post(
  "/conversations",
  authenticateToken,
  chatController.startConversation
);

/**
 * @route   GET /api/chat/conversations
 * @desc    Get user's chat conversations
 * @access  Private
 * @query   status (active, closed, archived)
 * @example GET /api/chat/conversations?status=active
 */
router.get(
  "/conversations",
  authenticateToken,
  chatController.getConversations
);

/**
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @desc    Get messages in a conversation
 * @access  Private
 * @param   conversationId - UUID of the conversation
 * @query   page, limit
 * @example GET /api/chat/conversations/uuid-here/messages?page=1&limit=50
 */
router.get(
  "/conversations/:conversationId/messages",
  authenticateToken,
  chatController.getMessages
);

/**
 * @route   POST /api/chat/conversations/:conversationId/messages
 * @desc    Send a message in conversation
 * @access  Private
 * @param   conversationId - UUID of the conversation
 * @body    { message, attachments? }
 * @example
 * POST /api/chat/conversations/uuid-here/messages
 * {
 *   "message": "Hello, I have a question",
 *   "attachments": ["url1", "url2"]
 * }
 */
router.post(
  "/conversations/:conversationId/messages",
  authenticateToken,
  chatController.sendMessage
);

/**
 * @route   PUT /api/chat/conversations/:conversationId/close
 * @desc    Close a conversation
 * @access  Private
 * @param   conversationId - UUID of the conversation
 * @body    { rating?, feedback? }
 * @example
 * PUT /api/chat/conversations/uuid-here/close
 * {
 *   "rating": 5,
 *   "feedback": "Great support!"
 * }
 */
router.put(
  "/conversations/:conversationId/close",
  authenticateToken,
  chatController.closeConversation
);

/**
 * @route   POST /api/chat/conversations/:conversationId/typing
 * @desc    Send typing indicator
 * @access  Private
 * @param   conversationId - UUID of the conversation
 * @body    { isTyping: boolean }
 * @example
 * POST /api/chat/conversations/uuid-here/typing
 * { "isTyping": true }
 */
router.post(
  "/conversations/:conversationId/typing",
  authenticateToken,
  chatController.setTyping
);

/**
 * @route   GET /api/chat/stream
 * @desc    Server-Sent Events stream for real-time chat
 * @access  Private
 * @returns SSE stream with events: new_message, typing, new_conversation
 * @example
 * const eventSource = new EventSource('/api/chat/stream', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log(data.type); // 'new_message', 'typing', etc.
 * };
 */
router.get("/stream", authenticateToken, chatController.chatStream);

/**
 * @route   GET /api/chat/analytics
 * @desc    Get chat analytics (for sellers)
 * @access  Private (Seller/Support)
 * @query   period (7d, 30d, 90d)
 * @example GET /api/chat/analytics?period=30d
 * @returns
 * {
 *   "stats": {
 *     "total_conversations": 150,
 *     "active_conversations": 12,
 *     "closed_conversations": 138,
 *     "avg_rating": 4.5,
 *     "avg_resolution_time_minutes": 45
 *   },
 *   "avgFirstResponse": 8.5
 * }
 */
router.get("/analytics", authenticateToken, chatController.getChatAnalytics);

/**
 * @route   POST /api/chat/suggest-response
 * @desc    Get AI-powered response suggestions
 * @access  Private
 * @body    { conversationId, lastMessage }
 * @example
 * POST /api/chat/suggest-response
 * {
 *   "conversationId": "uuid-here",
 *   "lastMessage": "What is the shipping cost?"
 * }
 * @returns
 * {
 *   "suggestions": [
 *     "We offer free shipping on orders over $50.",
 *     "Standard delivery takes 3-5 business days."
 *   ]
 * }
 */
router.post(
  "/suggest-response",
  authenticateToken,
  chatController.suggestResponse
);

module.exports = router;
