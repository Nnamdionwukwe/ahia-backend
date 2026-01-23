// // src/controllers/cartController.js
// const db = require("../config/database");
// const redis = require("../config/redis");

// // Add to cart
// exports.addToCart = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { product_variant_id, quantity } = req.body;

//     if (!product_variant_id || quantity === undefined) {
//       return res.status(400).json({
//         error: "Product variant ID and quantity are required",
//       });
//     }

//     // Check stock
//     const stock = await db.query(
//       "SELECT stock_quantity FROM product_variants WHERE id = $1",
//       [product_variant_id]
//     );

//     if (stock.rows.length === 0) {
//       return res.status(404).json({ error: "Product not found" });
//     }

//     if (stock.rows[0].stock_quantity < quantity) {
//       return res.status(400).json({
//         error: `Only ${stock.rows[0].stock_quantity} items in stock`,
//       });
//     }

//     // Add to cart
//     const cart = await db.query(
//       `INSERT INTO carts (user_id, product_variant_id, quantity, created_at, updated_at)
//        VALUES ($1, $2, $3, NOW(), NOW())
//        ON CONFLICT (user_id, product_variant_id)
//        DO UPDATE SET quantity = carts.quantity + $3, updated_at = NOW()
//        RETURNING *`,
//       [userId, product_variant_id, quantity]
//     );

//     // Clear cache
//     await redis.del(`cart:${userId}`);

//     res.json({
//       success: true,
//       item: cart.rows[0],
//     });
//   } catch (error) {
//     console.error("Add to cart error:", error);
//     res.status(500).json({ error: "Failed to add to cart" });
//   }
// };
// // Get cart
// exports.getCart = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     // Check cache
//     const cached = await redis.get(`cart:${userId}`);
//     if (cached) {
//       return res.json(JSON.parse(cached));
//     }

//     const cartItems = await db.query(
//       `SELECT c.*, pv.color, pv.size, pv.base_price, pv.discount_percentage,
//                     p.name, p.images
//              FROM carts c
//              JOIN product_variants pv ON c.product_variant_id = pv.id
//              JOIN products p ON pv.product_id = p.id
//              WHERE c.user_id = $1`,
//       [userId]
//     );

//     let subtotal = 0;
//     cartItems.rows.forEach((item) => {
//       const price =
//         item.base_price - (item.base_price * item.discount_percentage) / 100;
//       subtotal += price * item.quantity;
//     });

//     const cart = {
//       items: cartItems.rows,
//       subtotal: subtotal.toFixed(2),
//       tax: 0,
//       shipping: 0,
//       total: subtotal.toFixed(2),
//       itemCount: cartItems.rows.length,
//     };

//     // Cache for 1 hour
//     await redis.setex(`cart:${userId}`, 3600, JSON.stringify(cart));

//     res.json(cart);
//   } catch (error) {
//     console.error("Get cart error:", error);
//     res.status(500).json({ error: "Failed to fetch cart" });
//   }
// };

// // Update cart item
// exports.updateCart = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { item_id } = req.params;
//     const { quantity } = req.body;

//     if (!quantity || quantity < 1) {
//       return res.status(400).json({ error: "Invalid quantity" });
//     }

//     const updated = await db.query(
//       `UPDATE carts
//              SET quantity = $1, updated_at = NOW()
//              WHERE id = $2 AND user_id = $3
//              RETURNING *`,
//       [quantity, item_id, userId]
//     );

//     if (updated.rows.length === 0) {
//       return res.status(404).json({ error: "Cart item not found" });
//     }

//     // Clear cache
//     await redis.del(`cart:${userId}`);

//     res.json({ success: true, item: updated.rows[0] });
//   } catch (error) {
//     console.error("Update cart error:", error);
//     res.status(500).json({ error: "Failed to update cart" });
//   }
// };

// // Remove from cart
// exports.removeFromCart = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { item_id } = req.params;

//     const deleted = await db.query(
//       "DELETE FROM carts WHERE id = $1 AND user_id = $2 RETURNING *",
//       [item_id, userId]
//     );

//     if (deleted.rows.length === 0) {
//       return res.status(404).json({ error: "Cart item not found" });
//     }

//     // Clear cache
//     await redis.del(`cart:${userId}`);

//     res.json({ success: true });
//   } catch (error) {
//     console.error("Remove from cart error:", error);
//     res.status(500).json({ error: "Failed to remove from cart" });
//   }
// };

// // Get product variants
// exports.getProductVariants = async (req, res) => {
//   try {
//     const { productId } = req.params;

//     const variants = await db.query(
//       `SELECT id, product_id, color, size, base_price,
//               discount_percentage, stock_quantity, sku
//        FROM product_variants
//        WHERE product_id = $1 AND stock_quantity >= 0
//        ORDER BY color, size`,
//       [productId]
//     );

//     res.json({
//       variants: variants.rows,
//       count: variants.rows.length,
//     });
//   } catch (error) {
//     console.error("Get variants error:", error);
//     res.status(500).json({ error: "Failed to fetch variants" });
//   }
// };

// controllers/cartController.js
const pool = require("../config/database");

const cartController = {
  // Get user's cart
  getCart: async (req, res) => {
    try {
      const userId = req.user.id;

      const cartQuery = `
        SELECT 
          ci.id,
          ci.product_id,
          ci.product_variant_id,
          ci.quantity,
          ci.is_selected,
          p.name,
          p.price,
          p.original_price,
          p.discount_percentage,
          p.stock_quantity,
          p.sold_count,
          pv.color,
          pv.size,
          pv.base_price as variant_price,
          pv.discount_percentage as variant_discount,
          pv.stock_quantity as variant_stock,
          (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY display_order LIMIT 1) as image_url,
          CASE 
            WHEN pv.id IS NOT NULL THEN pv.stock_quantity
            ELSE p.stock_quantity
          END as available_stock,
          CASE
            WHEN pv.id IS NOT NULL THEN 
              CASE 
                WHEN pv.discount_percentage > 0 THEN pv.base_price * (1 - pv.discount_percentage / 100)
                ELSE pv.base_price
              END
            ELSE
              CASE
                WHEN p.discount_percentage > 0 THEN p.price * (1 - p.discount_percentage / 100)
                ELSE p.price
              END
          END as final_price,
          CASE
            WHEN pv.id IS NOT NULL THEN pv.base_price
            ELSE p.original_price
          END as item_original_price
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        LEFT JOIN product_variants pv ON ci.product_variant_id = pv.id
        WHERE ci.user_id = $1
        ORDER BY ci.created_at DESC
      `;

      const { rows } = await pool.query(cartQuery, [userId]);

      // Check for active sales on cart items
      const itemsWithSales = await Promise.all(
        rows.map(async (item) => {
          // Check for flash sale
          const flashSaleQuery = `
            SELECT fs.*, fsp.sale_price
            FROM flash_sales fs
            JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
            WHERE fsp.product_id = $1
            AND fs.start_time <= NOW()
            AND fs.end_time > NOW()
            ORDER BY fsp.sale_price ASC
            LIMIT 1
          `;
          const flashSaleResult = await pool.query(flashSaleQuery, [
            item.product_id,
          ]);

          // Check for seasonal sale
          const seasonalSaleQuery = `
            SELECT ss.*, ssp.sale_price
            FROM seasonal_sales ss
            JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
            WHERE ssp.product_id = $1
            AND ss.start_time <= NOW()
            AND ss.end_time > NOW()
            ORDER BY ssp.sale_price ASC
            LIMIT 1
          `;
          const seasonalSaleResult = await pool.query(seasonalSaleQuery, [
            item.product_id,
          ]);

          const activeSale =
            flashSaleResult.rows[0] || seasonalSaleResult.rows[0];

          if (activeSale) {
            const salePrice = activeSale.sale_price;
            const saleDiscount = Math.round(
              ((item.item_original_price - salePrice) /
                item.item_original_price) *
                100
            );

            return {
              ...item,
              sale: activeSale,
              sale_price: salePrice,
              sale_discount: saleDiscount,
              final_price: salePrice,
              sale_end_time: activeSale.end_time,
            };
          }

          return item;
        })
      );

      res.json({ items: itemsWithSales });
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ error: "Failed to fetch cart" });
    }
  },

  // Add item to cart
  addToCart: async (req, res) => {
    try {
      const userId = req.user.id;
      const { product_id, product_variant_id, quantity = 1 } = req.body;

      // Check if item already exists in cart
      const existingQuery = `
        SELECT * FROM cart_items 
        WHERE user_id = $1 
        AND product_id = $2 
        AND ($3::int IS NULL AND product_variant_id IS NULL OR product_variant_id = $3)
      `;
      const existing = await pool.query(existingQuery, [
        userId,
        product_id,
        product_variant_id,
      ]);

      if (existing.rows.length > 0) {
        // Update quantity
        const updateQuery = `
          UPDATE cart_items 
          SET quantity = quantity + $1, updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `;
        const result = await pool.query(updateQuery, [
          quantity,
          existing.rows[0].id,
        ]);
        res.json({ message: "Cart updated", item: result.rows[0] });
      } else {
        // Insert new item
        const insertQuery = `
          INSERT INTO cart_items (user_id, product_id, product_variant_id, quantity, is_selected)
          VALUES ($1, $2, $3, $4, true)
          RETURNING *
        `;
        const result = await pool.query(insertQuery, [
          userId,
          product_id,
          product_variant_id,
          quantity,
        ]);
        res.json({ message: "Item added to cart", item: result.rows[0] });
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ error: "Failed to add to cart" });
    }
  },

  // Update cart item quantity
  updateQuantity: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { quantity } = req.body;

      if (quantity <= 0) {
        // Delete item if quantity is 0
        const deleteQuery = `DELETE FROM cart_items WHERE id = $1 AND user_id = $2`;
        await pool.query(deleteQuery, [id, userId]);
        res.json({ message: "Item removed from cart" });
      } else {
        const updateQuery = `
          UPDATE cart_items 
          SET quantity = $1, updated_at = NOW()
          WHERE id = $2 AND user_id = $3
          RETURNING *
        `;
        const result = await pool.query(updateQuery, [quantity, id, userId]);
        res.json({ message: "Quantity updated", item: result.rows[0] });
      }
    } catch (error) {
      console.error("Error updating quantity:", error);
      res.status(500).json({ error: "Failed to update quantity" });
    }
  },

  // Toggle item selection
  toggleSelection: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { is_selected } = req.body;

      const updateQuery = `
        UPDATE cart_items 
        SET is_selected = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING *
      `;
      const result = await pool.query(updateQuery, [is_selected, id, userId]);
      res.json({ item: result.rows[0] });
    } catch (error) {
      console.error("Error toggling selection:", error);
      res.status(500).json({ error: "Failed to toggle selection" });
    }
  },

  // Select/deselect all items
  toggleSelectAll: async (req, res) => {
    try {
      const userId = req.user.id;
      const { is_selected } = req.body;

      const updateQuery = `
        UPDATE cart_items 
        SET is_selected = $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING *
      `;
      const result = await pool.query(updateQuery, [is_selected, userId]);
      res.json({ message: "All items updated", items: result.rows });
    } catch (error) {
      console.error("Error toggling select all:", error);
      res.status(500).json({ error: "Failed to toggle select all" });
    }
  },

  // Remove item from cart
  removeItem: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const deleteQuery = `DELETE FROM cart_items WHERE id = $1 AND user_id = $2`;
      await pool.query(deleteQuery, [id, userId]);
      res.json({ message: "Item removed from cart" });
    } catch (error) {
      console.error("Error removing item:", error);
      res.status(500).json({ error: "Failed to remove item" });
    }
  },

  // Remove selected items
  removeSelected: async (req, res) => {
    try {
      const userId = req.user.id;

      const deleteQuery = `DELETE FROM cart_items WHERE user_id = $1 AND is_selected = true`;
      await pool.query(deleteQuery, [userId]);
      res.json({ message: "Selected items removed" });
    } catch (error) {
      console.error("Error removing selected items:", error);
      res.status(500).json({ error: "Failed to remove selected items" });
    }
  },

  // Get cart summary
  getCartSummary: async (req, res) => {
    try {
      const userId = req.user.id;

      const summaryQuery = `
        SELECT 
          COUNT(*) as total_items,
          COUNT(CASE WHEN is_selected = true THEN 1 END) as selected_items,
          SUM(CASE WHEN is_selected = true THEN quantity ELSE 0 END) as selected_quantity
        FROM cart_items
        WHERE user_id = $1
      `;

      const { rows } = await pool.query(summaryQuery, [userId]);
      res.json(rows[0]);
    } catch (error) {
      console.error("Error fetching cart summary:", error);
      res.status(500).json({ error: "Failed to fetch cart summary" });
    }
  },
};

module.exports = cartController;
