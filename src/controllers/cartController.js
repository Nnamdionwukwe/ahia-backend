// src/controllers/cartController.js
const db = require("../config/database");
const redis = require("../config/redis");

// Add to cart
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_variant_id, quantity } = req.body;

    if (!product_variant_id || !quantity) {
      return res.status(400).json({
        error: "Product variant ID and quantity required",
      });
    }

    // Check stock
    const stock = await db.query(
      "SELECT stock_quantity FROM product_variants WHERE id = $1",
      [product_variant_id]
    );

    if (stock.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (stock.rows[0].stock_quantity < quantity) {
      return res.status(400).json({
        error: `Only ${stock.rows[0].stock_quantity} items in stock`,
      });
    }

    // Add to cart
    const cart = await db.query(
      `INSERT INTO carts (user_id, product_variant_id, quantity, added_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (user_id, product_variant_id)
             DO UPDATE SET quantity = quantity + $3, updated_at = NOW()
             RETURNING *`,
      [userId, product_variant_id, quantity]
    );

    // Clear cache
    await redis.del(`cart:${userId}`);

    res.json({
      success: true,
      item: cart.rows[0],
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ error: "Failed to add to cart" });
  }
};

// Get cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check cache
    const cached = await redis.get(`cart:${userId}`);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const cartItems = await db.query(
      `SELECT c.*, pv.color, pv.size, pv.base_price, pv.discount_percentage,
                    p.name, p.images
             FROM carts c
             JOIN product_variants pv ON c.product_variant_id = pv.id
             JOIN products p ON pv.product_id = p.id
             WHERE c.user_id = $1`,
      [userId]
    );

    let subtotal = 0;
    cartItems.rows.forEach((item) => {
      const price =
        item.base_price - (item.base_price * item.discount_percentage) / 100;
      subtotal += price * item.quantity;
    });

    const cart = {
      items: cartItems.rows,
      subtotal: subtotal.toFixed(2),
      tax: 0,
      shipping: 0,
      total: subtotal.toFixed(2),
      itemCount: cartItems.rows.length,
    };

    // Cache for 1 hour
    await redis.setex(`cart:${userId}`, 3600, JSON.stringify(cart));

    res.json(cart);
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
};

// Update cart item
exports.updateCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: "Invalid quantity" });
    }

    const updated = await db.query(
      `UPDATE carts
             SET quantity = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
      [quantity, item_id, userId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // Clear cache
    await redis.del(`cart:${userId}`);

    res.json({ success: true, item: updated.rows[0] });
  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).json({ error: "Failed to update cart" });
  }
};

// Remove from cart
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id } = req.params;

    const deleted = await db.query(
      "DELETE FROM carts WHERE id = $1 AND user_id = $2 RETURNING *",
      [item_id, userId]
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // Clear cache
    await redis.del(`cart:${userId}`);

    res.json({ success: true });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({ error: "Failed to remove from cart" });
  }
};

// Get product variants
exports.getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await db.query(
      `SELECT id, product_id, color, size, base_price, 
              discount_percentage, stock_quantity, sku
       FROM product_variants
       WHERE product_id = $1 AND stock_quantity >= 0
       ORDER BY color, size`,
      [productId]
    );

    res.json({
      variants: variants.rows,
      count: variants.rows.length,
    });
  } catch (error) {
    console.error("Get variants error:", error);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
};
