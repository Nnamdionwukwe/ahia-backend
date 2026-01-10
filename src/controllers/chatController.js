// src/controllers/chatController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Create or get chat conversation
exports.startConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sellerId, productId, subject } = req.body;

    // Check for existing active conversation
    const existing = await db.query(
      `SELECT * FROM chat_conversations
       WHERE user_id = $1 
       AND (seller_id = $2 OR seller_id IS NULL)
       AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, sellerId || null]
    );

    if (existing.rows.length > 0) {
      return res.json({
        conversation: existing.rows[0],
        isNew: false,
      });
    }

    // Create new conversation
    const conversation = await db.query(
      `INSERT INTO chat_conversations 
       (id, user_id, seller_id, product_id, subject, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
       RETURNING *`,
      [uuidv4(), userId, sellerId, productId, subject]
    );

    // Notify seller if applicable
    if (sellerId) {
      await redis.publish(
        `chat:seller:${sellerId}`,
        JSON.stringify({
          type: "new_conversation",
          conversation: conversation.rows[0],
        })
      );
    }

    res.status(201).json({
      conversation: conversation.rows[0],
      isNew: true,
    });
  } catch (error) {
    console.error("Start conversation error:", error);
    res.status(500).json({ error: "Failed to start conversation" });
  }
};

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { message, attachments } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    // Verify user is part of conversation
    const conversation = await db.query(
      `SELECT * FROM chat_conversations 
       WHERE id = $1 
       AND (user_id = $2 OR seller_id IN (
         SELECT id FROM sellers WHERE user_id = $2
       ))`,
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conv = conversation.rows[0];
    const senderType = conv.user_id === userId ? "customer" : "seller";

    // Insert message
    const msg = await db.query(
      `INSERT INTO chat_messages
       (id, conversation_id, sender_id, sender_type, message, 
        attachments, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        uuidv4(),
        conversationId,
        userId,
        senderType,
        message,
        JSON.stringify(attachments || []),
      ]
    );

    // Update conversation
    await db.query(
      `UPDATE chat_conversations 
       SET updated_at = NOW(), last_message_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );

    // Get sender info
    const sender = await db.query(
      "SELECT full_name, profile_image FROM users WHERE id = $1",
      [userId]
    );

    const messageData = {
      ...msg.rows[0],
      full_name: sender.rows[0]?.full_name,
      profile_image: sender.rows[0]?.profile_image,
    };

    // Publish to real-time channel
    const recipientId =
      senderType === "customer" ? conv.seller_id : conv.user_id;

    if (recipientId) {
      await redis.publish(
        `chat:${recipientId}`,
        JSON.stringify({
          type: "new_message",
          conversationId,
          message: messageData,
        })
      );

      // Update unread count
      const unreadKey = `chat:unread:${conversationId}:${recipientId}`;
      await redis.incr(unreadKey);
    }

    res.status(201).json({ message: messageData });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// Get conversation messages
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify access
    const conversation = await db.query(
      `SELECT * FROM chat_conversations 
       WHERE id = $1 
       AND (user_id = $2 OR seller_id IN (
         SELECT id FROM sellers WHERE user_id = $2
       ))`,
      [conversationId, userId]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get messages
    const messages = await db.query(
      `SELECT m.*, u.full_name, u.profile_image
       FROM chat_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );

    // Mark as read
    await db.query(
      `UPDATE chat_messages 
       SET is_read = true, read_at = NOW()
       WHERE conversation_id = $1 
       AND sender_id != $2
       AND is_read = false`,
      [conversationId, userId]
    );

    // Clear unread count
    await redis.del(`chat:unread:${conversationId}:${userId}`);

    const total = await db.query(
      "SELECT COUNT(*) FROM chat_messages WHERE conversation_id = $1",
      [conversationId]
    );

    res.json({
      messages: messages.rows.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total.rows[0].count),
        pages: Math.ceil(total.rows[0].count / limit),
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// Get user's conversations
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status = "active" } = req.query;

    const conversations = await db.query(
      `SELECT 
         c.*,
         u.full_name as customer_name,
         u.profile_image as customer_image,
         s.store_name,
         p.name as product_name,
         p.images as product_images,
         (
           SELECT COUNT(*) FROM chat_messages cm
           WHERE cm.conversation_id = c.id 
           AND cm.sender_id != $1 
           AND cm.is_read = false
         ) as unread_count,
         (
           SELECT message FROM chat_messages cm
           WHERE cm.conversation_id = c.id
           ORDER BY cm.created_at DESC
           LIMIT 1
         ) as last_message,
         (
           SELECT created_at FROM chat_messages cm
           WHERE cm.conversation_id = c.id
           ORDER BY cm.created_at DESC
           LIMIT 1
         ) as last_message_time
       FROM chat_conversations c
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN sellers s ON c.seller_id = s.id
       LEFT JOIN products p ON c.product_id = p.id
       WHERE (c.user_id = $1 OR s.user_id = $1)
       AND c.status = $2
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [userId, status]
    );

    res.json({ conversations: conversations.rows });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

// Close conversation
exports.closeConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { rating, feedback } = req.body;

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const updated = await db.query(
      `UPDATE chat_conversations
       SET status = 'closed',
           closed_at = NOW(),
           rating = $3,
           feedback = $4
       WHERE id = $1 
       AND (user_id = $2 OR seller_id IN (
         SELECT id FROM sellers WHERE user_id = $2
       ))
       RETURNING *`,
      [conversationId, userId, rating, feedback]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ success: true, conversation: updated.rows[0] });
  } catch (error) {
    console.error("Close conversation error:", error);
    res.status(500).json({ error: "Failed to close conversation" });
  }
};

// Typing indicator
exports.setTyping = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { isTyping } = req.body;

    // Verify access
    const conversation = await db.query(
      `SELECT user_id, seller_id FROM chat_conversations 
       WHERE id = $1`,
      [conversationId]
    );

    if (conversation.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conv = conversation.rows[0];
    const recipientId = conv.user_id === userId ? conv.seller_id : conv.user_id;

    // Publish typing status
    if (recipientId) {
      await redis.publish(
        `chat:${recipientId}`,
        JSON.stringify({
          type: "typing",
          conversationId,
          userId,
          isTyping,
        })
      );

      // Set expiring key for typing status
      if (isTyping) {
        await redis.setex(
          `chat:typing:${conversationId}:${userId}`,
          3, // 3 seconds
          "1"
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Set typing error:", error);
    res.status(500).json({ error: "Failed to set typing status" });
  }
};

// SSE endpoint for real-time chat
exports.chatStream = async (req, res) => {
  const userId = req.user.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Subscribe to user's chat channel
  const subscriber = redis.duplicate();

  try {
    await subscriber.connect();

    await subscriber.subscribe(`chat:${userId}`, (message) => {
      res.write(`data: ${message}\n\n`);
    });

    // Also subscribe to seller channel if user is a seller
    const seller = await db.query("SELECT id FROM sellers WHERE user_id = $1", [
      userId,
    ]);

    if (seller.rows.length > 0) {
      await subscriber.subscribe(
        `chat:seller:${seller.rows[0].id}`,
        (message) => {
          res.write(`data: ${message}\n\n`);
        }
      );
    }

    // Heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      subscriber.unsubscribe();
      subscriber.quit();
    });
  } catch (error) {
    console.error("Chat stream error:", error);
    res.status(500).json({ error: "Failed to establish chat stream" });
  }
};

// Get chat analytics (for sellers/support)
exports.getChatAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = "30d" } = req.query;
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

    // Get seller ID
    const seller = await db.query("SELECT id FROM sellers WHERE user_id = $1", [
      userId,
    ]);

    if (
      seller.rows.length === 0 &&
      req.user.role !== "admin" &&
      req.user.role !== "support"
    ) {
      return res.status(403).json({ error: "Not a seller or support staff" });
    }

    const sellerId = seller.rows.length > 0 ? seller.rows[0].id : null;

    // Analytics query
    let query = `
      SELECT 
        COUNT(DISTINCT id) as total_conversations,
        COUNT(DISTINCT CASE WHEN status = 'active' THEN id END) as active_conversations,
        COUNT(DISTINCT CASE WHEN status = 'closed' THEN id END) as closed_conversations,
        AVG(CASE WHEN rating IS NOT NULL THEN rating END) as avg_rating,
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/60) as avg_resolution_time_minutes
      FROM chat_conversations
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `;

    const params = [];
    if (sellerId && req.user.role !== "admin") {
      query += ` AND seller_id = $1`;
      params.push(sellerId);
    }

    const stats = await db.query(query, params);

    // Response time analytics
    let responseQuery = `
      SELECT 
        AVG(
          EXTRACT(EPOCH FROM (
            (SELECT MIN(created_at) 
             FROM chat_messages 
             WHERE conversation_id = c.id 
             AND sender_type = 'seller') - c.created_at
          ))/60
        ) as avg_first_response_minutes
      FROM chat_conversations c
      WHERE c.created_at > NOW() - INTERVAL '${days} days'
    `;

    if (sellerId && req.user.role !== "admin") {
      responseQuery += ` AND c.seller_id = $1`;
    }

    const responseTimes = await db.query(
      responseQuery,
      sellerId && req.user.role !== "admin" ? [sellerId] : []
    );

    res.json({
      stats: {
        ...stats.rows[0],
        avg_rating: parseFloat(stats.rows[0].avg_rating || 0).toFixed(2),
        avg_resolution_time_minutes: parseFloat(
          stats.rows[0].avg_resolution_time_minutes || 0
        ).toFixed(2),
      },
      avgFirstResponse: parseFloat(
        responseTimes.rows[0].avg_first_response_minutes || 0
      ).toFixed(2),
      period: period,
    });
  } catch (error) {
    console.error("Get chat analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

// AI-powered auto-responses (basic implementation)
exports.suggestResponse = async (req, res) => {
  try {
    const { conversationId, lastMessage } = req.body;

    if (!lastMessage) {
      return res.status(400).json({ error: "Last message required" });
    }

    // Simple keyword-based suggestions
    // In production, integrate with GPT/Claude API
    const suggestions = [];
    const lowerMessage = lastMessage.toLowerCase();

    // Product inquiries
    if (
      lowerMessage.includes("price") ||
      lowerMessage.includes("cost") ||
      lowerMessage.includes("how much")
    ) {
      suggestions.push(
        "Our pricing is competitive and we offer discounts for bulk orders.",
        "Let me check the current price for you.",
        "The price is listed on the product page. Would you like me to send you a direct link?"
      );
    }

    // Shipping questions
    if (
      lowerMessage.includes("shipping") ||
      lowerMessage.includes("delivery") ||
      lowerMessage.includes("ship")
    ) {
      suggestions.push(
        "We offer free shipping on orders over $50.",
        "Standard delivery takes 3-5 business days.",
        "Express shipping is available for $15 and arrives in 1-2 business days."
      );
    }

    // Returns and refunds
    if (
      lowerMessage.includes("return") ||
      lowerMessage.includes("refund") ||
      lowerMessage.includes("exchange")
    ) {
      suggestions.push(
        "We have a 30-day return policy for unused items.",
        "I can help you process a return. Do you have your order number?",
        "Refunds are processed within 5-7 business days after we receive the item."
      );
    }

    // Availability
    if (
      lowerMessage.includes("stock") ||
      lowerMessage.includes("available") ||
      lowerMessage.includes("in stock")
    ) {
      suggestions.push(
        "This item is currently in stock and ready to ship.",
        "Let me check the availability for you.",
        "We can notify you when this item is back in stock."
      );
    }

    // Warranty
    if (
      lowerMessage.includes("warranty") ||
      lowerMessage.includes("guarantee")
    ) {
      suggestions.push(
        "This product comes with a 1-year manufacturer warranty.",
        "We offer an extended warranty option at checkout.",
        "The warranty covers manufacturing defects and normal use."
      );
    }

    // General greeting
    if (
      lowerMessage.includes("hello") ||
      lowerMessage.includes("hi") ||
      lowerMessage.includes("hey")
    ) {
      suggestions.push(
        "Hello! How can I help you today?",
        "Hi there! Thanks for reaching out. What can I assist you with?",
        "Welcome! I'm here to help with any questions you have."
      );
    }

    // Default suggestions if none matched
    if (suggestions.length === 0) {
      suggestions.push(
        "Thank you for your message. How can I help you today?",
        "I'd be happy to assist you with that.",
        "Let me look into that for you right away."
      );
    }

    // Limit to 3 suggestions
    res.json({ suggestions: suggestions.slice(0, 3) });
  } catch (error) {
    console.error("Suggest response error:", error);
    res.status(500).json({ error: "Failed to suggest responses" });
  }
};

module.exports = exports;
