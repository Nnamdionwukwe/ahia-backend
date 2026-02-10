// src/controllers/orderController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");
const fraudDetectionController = require("./fraudDetectionController");
const notificationsController = require("./notificationsController");
const loyaltyController = require("./loyaltyController");

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
      `SELECT c.*, pv.base_price, pv.discount_percentage, p.id as product_id
       FROM carts c
       JOIN product_variants pv ON c.product_variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE c.user_id = $1`,
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
   (id, user_id, total_amount, discount_amount, delivery_address, status, payment_method, created_at, updated_at, estimated_delivery)
   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW() + INTERVAL '5 days')
   RETURNING *`,
      [
        orderId,
        userId,
        totalAmount,
        discountAmount,
        delivery_address,
        orderStatus,
        payment_method,
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

    // Clear cart
    await db.query("DELETE FROM carts WHERE user_id = $1", [userId]);
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
      // Award both users
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

// Get user's orders
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM orders WHERE user_id = $1";
    const params = [userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;
    params.push(limit, offset);

    const orders = await db.query(query, params);

    res.json({
      orders: orders.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: orders.rows.length,
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

    res.json({
      order: order.rows[0],
      items: items.rows,
    });
  } catch (error) {
    console.error("Get order details error:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: orderId } = req.params;

    const order = await db.query(
      `SELECT status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.rows[0].status !== "pending") {
      return res.status(400).json({ error: "Can only cancel pending orders" });
    }

    const updated = await db.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId],
    );

    // Phase 5: Send cancellation notification
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
