// src/controllers/orderController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");
const fraudDetectionController = require("./fraudDetectionController");
const notificationsController = require("./notificationsController");
const loyaltyController = require("./loyaltyController");
const fs = require("fs");
const path = require("path");

// Helper function to calculate total
const calculateTotal = (items) => {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
};

// Checkout and create order with Phase 5 features
exports.checkout = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      delivery_address,
      payment_method,
      promo_code,
      total_amount,
      discount_amount,
    } = req.body;

    if (!delivery_address || !payment_method) {
      return res.status(400).json({
        error: "Delivery address and payment method required",
      });
    }

    // Get cart items
    const cartItems = await db.query(
      `SELECT c.*, pv.base_price, pv.discount_percentage, p.id as product_id, p.name, p.images, pv.color, pv.size
       FROM carts c
       JOIN product_variants pv ON c.product_variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE c.user_id = $1 AND c.is_selected = true`,
      [userId],
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // USE FRONTEND TOTALS if provided, otherwise calculate
    let totalAmount = total_amount || 0;
    let discountAmount = discount_amount || 0;

    // Only calculate if not provided from frontend
    if (!total_amount) {
      cartItems.rows.forEach((item) => {
        const price =
          item.base_price - (item.base_price * item.discount_percentage) / 100;
        totalAmount += price * item.quantity;
      });

      if (promo_code) {
        const promo = await db.query(
          `SELECT discount_percentage FROM promotions 
         WHERE code = $1 AND expiry_date > NOW()`,
          [promo_code],
        );

        if (promo.rows.length > 0) {
          discountAmount =
            totalAmount * (promo.rows[0].discount_percentage / 100);
          totalAmount -= discountAmount;
        }
      }
    }

    // Phase 5: Run fraud detection
    const fraudCheck = await fraudDetectionController.analyzeOrder(
      {
        items: cartItems.rows,
        totalAmount: totalAmount,
        deliveryAddress: delivery_address,
        paymentMethod: payment_method,
        promoCode: promo_code,
      },
      userId,
      req.ip,
      req.headers["user-agent"],
    );

    // Phase 5: Handle fraud result
    if (fraudCheck.action === "block") {
      return res.status(403).json({
        error: "Transaction blocked due to security concerns",
      });
    }

    // Create order
    const orderId = uuidv4();
    const orderStatus =
      fraudCheck.action === "review" ? "pending_review" : "pending";

    const order = await db.query(
      `INSERT INTO orders 
       (id, user_id, total_amount, discount_amount, delivery_address, status, payment_method, payment_status, created_at, updated_at, estimated_delivery)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW() + INTERVAL '5 days')
       RETURNING *`,
      [
        orderId,
        userId,
        totalAmount,
        discountAmount,
        delivery_address,
        orderStatus,
        payment_method,
        "pending",
      ],
    );

    // Add order items
    for (const item of cartItems.rows) {
      const price =
        item.base_price - (item.base_price * item.discount_percentage) / 100;
      await db.query(
        `INSERT INTO order_items (id, order_id, product_variant_id, quantity, unit_price, subtotal, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          uuidv4(),
          orderId,
          item.product_variant_id,
          item.quantity,
          price,
          price * item.quantity,
        ],
      );
    }

    // Clear selected cart items
    await db.query(
      "DELETE FROM carts WHERE user_id = $1 AND is_selected = true",
      [userId],
    );
    await redis.del(`cart:${userId}`);

    // Phase 5: Send order confirmation notification
    await notificationsController.notifyOrderUpdate(
      userId,
      orderId,
      "confirmed",
      `Your order #${order.rows[0].id} has been confirmed!`,
    );

    // Phase 5: Award loyalty points
    await loyaltyController.awardPoints(
      userId,
      Math.floor(totalAmount * 10),
      `Purchase - Order #${order.rows[0].id}`,
      orderId,
    );

    // Phase 5: Check for referral bonus
    const referral = await db.query(
      `UPDATE referrals 
       SET status = 'completed', completed_at = NOW(), points_awarded = 500
       WHERE referred_user_id = $1 AND status = 'pending'
       RETURNING referrer_id`,
      [userId],
    );

    if (referral.rows.length > 0) {
      await loyaltyController.awardPoints(
        referral.rows[0].referrer_id,
        500,
        "Referral bonus",
      );
      await loyaltyController.awardPoints(userId, 100, "Welcome bonus");
    }

    res.status(201).json({
      success: true,
      order: order.rows[0],
      itemCount: cartItems.rows.length,
      fraudCheck: fraudCheck,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ error: "Checkout failed" });
  }
};

// Get user's orders WITH ITEMS
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, status } = req.query;
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM orders WHERE user_id = $1";
    const params = [userId];

    if (status && status !== "all") {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const ordersResult = await db.query(query, params);

    // Fetch items for each order
    const ordersWithItems = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await db.query(
          `SELECT oi.*, p.name, p.images, pv.color, pv.size
           FROM order_items oi
           JOIN product_variants pv ON oi.product_variant_id = pv.id
           JOIN products p ON pv.product_id = p.id
           WHERE oi.order_id = $1`,
          [order.id],
        );
        return {
          ...order,
          items: itemsResult.rows,
          item_count: itemsResult.rows.length,
        };
      }),
    );

    const countQuery = `SELECT COUNT(*) FROM orders WHERE user_id = $1${status && status !== "all" ? ` AND status = $2` : ""}`;
    const countParams =
      status && status !== "all" ? [userId, status] : [userId];
    const countResult = await db.query(countQuery, countParams);

    res.json({
      orders: ordersWithItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: orderId } = req.params;

    if (!orderId || orderId === "undefined" || orderId === "null") {
      return res
        .status(400)
        .json({ error: "Invalid order ID", received: orderId });
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      return res
        .status(400)
        .json({ error: "Invalid order ID format", received: orderId });
    }

    const order = await db.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = await db.query(
      `SELECT oi.*, p.name, p.images, pv.color, pv.size
       FROM order_items oi
       JOIN product_variants pv ON oi.product_variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId],
    );

    res.json({ order: order.rows[0], items: items.rows });
  } catch (error) {
    console.error("Get order details error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch order details", message: error.message });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: orderId } = req.params;

    const order = await db.query(
      `SELECT status, payment_status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (
      order.rows[0].status !== "pending" &&
      order.rows[0].payment_status !== "pending"
    ) {
      return res.status(400).json({ error: "Can only cancel pending orders" });
    }

    const updated = await db.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId],
    );

    await notificationsController.notifyOrderUpdate(
      userId,
      orderId,
      "cancelled",
      `Your order #${orderId} has been cancelled`,
    );

    res.json({ success: true, order: updated.rows[0] });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ error: "Failed to cancel order" });
  }
};

// ── Return order (customer) ───────────────────────────────────────────────────
exports.returnOrder = async (req, res) => {
  // Track uploaded file paths so we can clean up on error
  const uploadedFiles = (req.files || []).map((f) => f.path);

  const cleanupFiles = () => {
    uploadedFiles.forEach((filePath) => {
      fs.unlink(filePath, (err) => {
        if (err)
          console.warn("Failed to clean up file:", filePath, err.message);
      });
    });
  };

  try {
    const userId = req.user.id;
    const orderId = req.params.id;
    const { reason, details, refund_method = "original_payment" } = req.body;

    // ── Validate input ────────────────────────────────────────────────────────
    if (!reason) {
      cleanupFiles();
      return res.status(400).json({ error: "reason is required" });
    }

    const validReasons = [
      "wrong_item",
      "damaged",
      "not_as_described",
      "changed_mind",
      "missing_item",
      "other",
    ];
    if (!validReasons.includes(reason)) {
      cleanupFiles();
      return res.status(400).json({
        error: `Invalid reason. Allowed: ${validReasons.join(", ")}`,
      });
    }

    const validRefundMethods = [
      "original_payment",
      "store_credit",
      "bank_transfer",
    ];
    if (!validRefundMethods.includes(refund_method)) {
      cleanupFiles();
      return res.status(400).json({
        error: `Invalid refund_method. Allowed: ${validRefundMethods.join(", ")}`,
      });
    }

    // ── Verify order ownership and eligibility ────────────────────────────────
    const orderResult = await db.query(
      `SELECT id, status, payment_status, total_amount, created_at
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );

    if (orderResult.rows.length === 0) {
      cleanupFiles();
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];

    // Only delivered orders can be returned
    if (order.status !== "delivered") {
      cleanupFiles();
      return res.status(400).json({
        error: "Only delivered orders can be returned",
        current_status: order.status,
      });
    }

    // Enforce 30-day return window
    const deliveredAgo = Date.now() - new Date(order.created_at).getTime();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (deliveredAgo > THIRTY_DAYS) {
      cleanupFiles();
      return res.status(400).json({
        error: "Return window has expired (30 days from order date)",
      });
    }

    // ── Check for existing return request ─────────────────────────────────────
    const existing = await db.query(
      `SELECT id, status FROM order_returns
       WHERE order_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [orderId, userId],
    );

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      if (["pending", "approved"].includes(prev.status)) {
        cleanupFiles();
        return res.status(409).json({
          error: "A return request already exists for this order",
          existing_return_id: prev.id,
          existing_status: prev.status,
        });
      }
    }

    // ── Build media metadata from uploaded files ───────────────────────────────
    // Store relative paths + mime type so we can serve them later
    const mediaFiles = (req.files || []).map((file) => ({
      filename: file.filename,
      path: file.path, // e.g. uploads/returns/return-xxx.jpg
      url: `/uploads/returns/${file.filename}`, // public URL served by Express static
      mimetype: file.mimetype,
      size: file.size,
      type: file.mimetype.startsWith("video/") ? "video" : "image",
    }));

    // ── Create return request ─────────────────────────────────────────────────
    const returnResult = await db.query(
      `INSERT INTO order_returns
         (order_id, user_id, reason, details, refund_method, refund_amount, media, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
       RETURNING *`,
      [
        orderId,
        userId,
        reason,
        details || null,
        refund_method,
        order.total_amount,
        JSON.stringify(mediaFiles), // stored as JSONB column
      ],
    );

    // Update order status so it's visible in admin panel
    await db.query(
      `UPDATE orders SET status = 'return_requested', updated_at = NOW() WHERE id = $1`,
      [orderId],
    );

    // Notify user
    try {
      await notificationsController.notifyOrderUpdate(
        userId,
        orderId,
        "return_requested",
        `Your return request for order #${orderId} has been received and is under review.`,
      );
    } catch (notifErr) {
      console.warn("Return notification failed (non-fatal):", notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message:
        "Return request submitted. We will review it within 1–3 business days.",
      return: {
        ...returnResult.rows[0],
        media: mediaFiles,
      },
    });
  } catch (error) {
    cleanupFiles();
    console.error("returnOrder error:", error);
    return res.status(500).json({ error: "Failed to submit return request" });
  }
};

// ── Get customer's own return requests ───────────────────────────────────────
exports.getMyReturns = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [userId];

    let query = `
      SELECT
        r.id,
        r.order_id,
        r.reason,
        r.details,
        r.status,
        r.refund_method,
        r.refund_amount,
        r.admin_note,
        r.media,
        r.created_at,
        r.resolved_at,
        o.total_amount   AS order_total,
        o.payment_method AS order_payment_method,
        o.created_at     AS order_date
      FROM order_returns r
      JOIN orders o ON r.order_id = o.id
      WHERE r.user_id = $1`;

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }

    query += ` ORDER BY r.created_at DESC`;
    params.push(Number(limit));
    query += ` LIMIT $${params.length}`;
    params.push(Number(offset));
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    const countResult = await db.query(
      `SELECT COUNT(*) FROM order_returns WHERE user_id = $1${status ? " AND status = $2" : ""}`,
      status ? [userId, status] : [userId],
    );

    return res.json({
      success: true,
      returns: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error) {
    console.error("getMyReturns error:", error);
    return res.status(500).json({ error: "Failed to fetch return requests" });
  }
};

// GET /api/orders/returns/:returnId
exports.getReturnDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const returnId = req.params.returnId;

    const result = await db.query(
      `SELECT r.*,
              o.total_amount   AS order_total,
              o.payment_method AS order_payment_method,
              o.created_at     AS order_date,
              o.status         AS order_status
       FROM order_returns r
       JOIN orders o ON r.order_id = o.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [returnId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Return request not found" });
    }

    const items = await db.query(
      `SELECT oi.*, p.name, p.images, pv.color, pv.size
       FROM order_items oi
       JOIN product_variants pv ON oi.product_variant_id = pv.id
       JOIN products p          ON pv.product_id = p.id
       WHERE oi.order_id = $1`,
      [result.rows[0].order_id],
    );

    return res.json({
      success: true,
      return: result.rows[0],
      items: items.rows,
    });
  } catch (error) {
    console.error("getReturnDetails error:", error);
    return res.status(500).json({ error: "Failed to fetch return details" });
  }
};

// ── returnOrder (drop-in replacement) ────────────────────────────────────────
// Reads req.uploadedMedia set by handleReturnUpload middleware.
// No local file cleanup needed — files go straight to Cloudinary.
//
exports.returnOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;
    const { reason, details, refund_method = "original_payment" } = req.body;

    // ── Validate input ────────────────────────────────────────────────────────
    if (!reason) {
      return res.status(400).json({ error: "reason is required" });
    }

    const validReasons = [
      "wrong_item",
      "damaged",
      "not_as_described",
      "changed_mind",
      "missing_item",
      "other",
    ];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        error: `Invalid reason. Allowed: ${validReasons.join(", ")}`,
      });
    }

    const validRefundMethods = [
      "original_payment",
      "store_credit",
      "bank_transfer",
    ];
    if (!validRefundMethods.includes(refund_method)) {
      return res.status(400).json({
        error: `Invalid refund_method. Allowed: ${validRefundMethods.join(", ")}`,
      });
    }

    // ── Verify order ownership and eligibility ────────────────────────────────
    const orderResult = await db.query(
      `SELECT id, status, payment_status, total_amount, created_at
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];

    if (order.status !== "delivered") {
      return res.status(400).json({
        error: "Only delivered orders can be returned",
        current_status: order.status,
      });
    }

    const deliveredAgo = Date.now() - new Date(order.created_at).getTime();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (deliveredAgo > THIRTY_DAYS) {
      return res.status(400).json({
        error: "Return window has expired (30 days from order date)",
      });
    }

    // ── Check for existing return request ─────────────────────────────────────
    const existing = await db.query(
      `SELECT id, status FROM order_returns
       WHERE order_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [orderId, userId],
    );

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      if (["pending", "approved"].includes(prev.status)) {
        return res.status(409).json({
          error: "A return request already exists for this order",
          existing_return_id: prev.id,
          existing_status: prev.status,
        });
      }
    }

    // ── Media: Cloudinary URLs set by handleReturnUpload middleware ───────────
    // Each item: { public_id, url, mimetype, size, type, filename }
    const mediaFiles = req.uploadedMedia || [];

    // ── Create return request ─────────────────────────────────────────────────
    const returnResult = await db.query(
      `INSERT INTO order_returns
         (order_id, user_id, reason, details, refund_method, refund_amount,
          media, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
       RETURNING *`,
      [
        orderId,
        userId,
        reason,
        details || null,
        refund_method,
        order.total_amount,
        JSON.stringify(mediaFiles),
      ],
    );

    await db.query(
      `UPDATE orders SET status = 'return_requested', updated_at = NOW()
       WHERE id = $1`,
      [orderId],
    );

    try {
      await notificationsController.notifyOrderUpdate(
        userId,
        orderId,
        "return_requested",
        `Your return request for order #${orderId} has been received and is under review.`,
      );
    } catch (notifErr) {
      console.warn("Return notification failed (non-fatal):", notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message:
        "Return request submitted. We will review it within 1–3 business days.",
      return: {
        ...returnResult.rows[0],
        media: mediaFiles,
      },
    });
  } catch (error) {
    console.error("returnOrder error:", error);
    return res.status(500).json({ error: "Failed to submit return request" });
  }
};

module.exports = exports;
