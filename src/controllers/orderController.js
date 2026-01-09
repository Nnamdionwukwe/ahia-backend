// src/controllers/orderController.js
const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

// Checkout and create order
exports.checkout = async (req, res) => {
  try {
    const userId = req.user.id;
    const { delivery_address, payment_method, promo_code } = req.body;

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
      [userId]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // Calculate total
    let totalAmount = 0;
    cartItems.rows.forEach((item) => {
      const price =
        item.base_price - (item.base_price * item.discount_percentage) / 100;
      totalAmount += price * item.quantity;
    });

    let discountAmount = 0;
    if (promo_code) {
      const promo = await db.query(
        `SELECT discount_percentage FROM promotions 
                 WHERE code = $1 AND expiry_date > NOW()`,
        [promo_code]
      );

      if (promo.rows.length > 0) {
        discountAmount =
          totalAmount * (promo.rows[0].discount_percentage / 100);
        totalAmount -= discountAmount;
      }
    }

    // Create order
    const orderId = uuidv4();
    const order = await db.query(
      `INSERT INTO orders 
             (id, user_id, total_amount, discount_amount, delivery_address, status, payment_method, created_at, updated_at, estimated_delivery)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), NOW(), NOW() + INTERVAL '5 days')
             RETURNING *`,
      [
        orderId,
        userId,
        totalAmount,
        discountAmount,
        delivery_address,
        payment_method,
      ]
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
        ]
      );
    }

    // Clear cart
    await db.query("DELETE FROM carts WHERE user_id = $1", [userId]);
    await redis.del(`cart:${userId}`);

    res.status(201).json({
      success: true,
      order: order.rows[0],
      itemCount: cartItems.rows.length,
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
      [orderId, userId]
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
      [orderId]
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
      [orderId, userId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.rows[0].status !== "pending") {
      return res.status(400).json({ error: "Can only cancel pending orders" });
    }

    const updated = await db.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId]
    );

    res.json({ success: true, order: updated.rows[0] });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ error: "Failed to cancel order" });
  }
};
