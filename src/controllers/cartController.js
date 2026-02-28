// controllers/cartController.js - FIXED VERSION
const pool = require("../config/database");

const CART_TABLE = "carts";

const cartController = {
  // Get user's cart
  getCart: async (req, res) => {
    try {
      const userId = req.user.id;

      const cartQuery = `
        SELECT 
          c.id,
          c.user_id,
          c.product_id,
          c.product_variant_id,
          c.quantity,
          c.is_selected,
          c.created_at,
          c.selected_image_url,
          p.name,
          p.price,
          p.original_price,
          p.discount_percentage,
          p.stock_quantity,
          p.sold_count,
          p.images,
          p.category,
          p.brand,
          p.rating,
          p.total_reviews,
          pv.color,
          pv.size,
          pv.sku,
          pv.base_price as variant_price,
          pv.discount_percentage as variant_discount,
          pv.stock_quantity as variant_stock,
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
        FROM ${CART_TABLE} c
        JOIN products p ON c.product_id = p.id
        LEFT JOIN product_variants pv ON c.product_variant_id = pv.id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC
      `;

      const { rows } = await pool.query(cartQuery, [userId]);

      const processedRows = rows.map((item) => {
        let imageUrl = null;
        let variantImageUrl = null;

        if (item.selected_image_url) {
          imageUrl = item.selected_image_url;
          variantImageUrl = item.selected_image_url;
        } else if (
          item.color &&
          item.images &&
          Array.isArray(item.images) &&
          item.images.length > 0
        ) {
          const productItems = rows.filter(
            (r) => r.product_id === item.product_id,
          );
          const uniqueColors = [
            ...new Set(productItems.map((r) => r.color).filter(Boolean)),
          ];
          const colorIndex = uniqueColors.indexOf(item.color);
          variantImageUrl =
            colorIndex !== -1
              ? item.images[colorIndex % item.images.length]
              : item.images[0];
          imageUrl = variantImageUrl;
        } else if (
          item.images &&
          Array.isArray(item.images) &&
          item.images.length > 0
        ) {
          imageUrl = item.images[0];
        }

        return {
          ...item,
          image_url: imageUrl,
          variant_image_url: variantImageUrl,
        };
      });

      const itemsWithSales = await Promise.all(
        processedRows.map(async (item) => {
          const flashSaleQuery = `
            SELECT fs.*, fsp.sale_price
            FROM flash_sales fs
            JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
            WHERE fsp.product_id = $1
            AND fs.start_time <= NOW() AND fs.end_time > NOW() AND fs.status = 'active'
            ORDER BY fsp.sale_price ASC LIMIT 1
          `;
          const seasonalSaleQuery = `
            SELECT ss.*, ssp.sale_price
            FROM seasonal_sales ss
            JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
            WHERE ssp.product_id = $1
            AND ss.start_time <= NOW() AND ss.end_time > NOW() AND ss.is_active = true
            ORDER BY ssp.sale_price ASC LIMIT 1
          `;
          const [flashResult, seasonalResult] = await Promise.all([
            pool.query(flashSaleQuery, [item.product_id]),
            pool.query(seasonalSaleQuery, [item.product_id]),
          ]);
          const activeSale = flashResult.rows[0] || seasonalResult.rows[0];
          if (activeSale) {
            const salePrice = activeSale.sale_price;
            const saleDiscount = Math.round(
              ((item.item_original_price - salePrice) /
                item.item_original_price) *
                100,
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
        }),
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
      const {
        product_id,
        product_variant_id,
        quantity = 1,
        selected_image_url,
      } = req.body;

      console.log("📥 Add to cart request:", {
        product_id,
        product_variant_id,
        quantity,
        selected_image_url,
      });

      // ── product_variant_id is NOT NULL in DB — always required ──────────
      if (!product_variant_id) {
        return res
          .status(400)
          .json({ error: "product_variant_id is required" });
      }

      // ── If product_id not provided, look it up from the variant ─────────
      let resolvedProductId = product_id || null;
      if (!resolvedProductId) {
        const variantLookup = await pool.query(
          `SELECT product_id FROM product_variants WHERE id = $1`,
          [product_variant_id],
        );
        if (!variantLookup.rows.length) {
          return res.status(404).json({ error: "Variant not found" });
        }
        resolvedProductId = variantLookup.rows[0].product_id;
        console.log(
          `🔍 Resolved product_id ${resolvedProductId} from variant ${product_variant_id}`,
        );
      }

      // ── Check if item already in cart ────────────────────────────────────
      const existingQuery = `
        SELECT * FROM ${CART_TABLE}
        WHERE user_id = $1 AND product_id = $2 AND product_variant_id = $3
      `;
      const existing = await pool.query(existingQuery, [
        userId,
        resolvedProductId,
        product_variant_id,
      ]);

      if (existing.rows.length > 0) {
        const updateQuery = selected_image_url
          ? `UPDATE ${CART_TABLE} SET quantity = quantity + $1, selected_image_url = $4, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`
          : `UPDATE ${CART_TABLE} SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`;
        const params = selected_image_url
          ? [quantity, existing.rows[0].id, userId, selected_image_url]
          : [quantity, existing.rows[0].id, userId];
        const result = await pool.query(updateQuery, params);
        console.log("✅ Cart updated:", result.rows[0].id);
        return res.json({ message: "Cart updated", item: result.rows[0] });
      }

      // ── Insert new cart item ─────────────────────────────────────────────
      const insertQuery = selected_image_url
        ? `INSERT INTO ${CART_TABLE} (user_id, product_id, product_variant_id, quantity, is_selected, selected_image_url) VALUES ($1, $2, $3, $4, true, $5) RETURNING *`
        : `INSERT INTO ${CART_TABLE} (user_id, product_id, product_variant_id, quantity, is_selected) VALUES ($1, $2, $3, $4, true) RETURNING *`;
      const params = selected_image_url
        ? [
            userId,
            resolvedProductId,
            product_variant_id,
            quantity,
            selected_image_url,
          ]
        : [userId, resolvedProductId, product_variant_id, quantity];
      const result = await pool.query(insertQuery, params);
      console.log("✅ New cart item created:", result.rows[0].id);
      return res.json({ message: "Item added to cart", item: result.rows[0] });
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
        await pool.query(
          `DELETE FROM ${CART_TABLE} WHERE id = $1 AND user_id = $2`,
          [id, userId],
        );
        return res.json({ message: "Item removed from cart" });
      }
      const result = await pool.query(
        `UPDATE ${CART_TABLE} SET quantity = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
        [quantity, id, userId],
      );
      res.json({ message: "Quantity updated", item: result.rows[0] });
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
      const result = await pool.query(
        `UPDATE ${CART_TABLE} SET is_selected = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
        [is_selected, id, userId],
      );
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
      const result = await pool.query(
        `UPDATE ${CART_TABLE} SET is_selected = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *`,
        [is_selected, userId],
      );
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
      await pool.query(
        `DELETE FROM ${CART_TABLE} WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
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
      await pool.query(
        `DELETE FROM ${CART_TABLE} WHERE user_id = $1 AND is_selected = true`,
        [userId],
      );
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
      const { rows } = await pool.query(
        `SELECT COUNT(*) as total_items, COUNT(CASE WHEN is_selected = true THEN 1 END) as selected_items, SUM(CASE WHEN is_selected = true THEN quantity ELSE 0 END) as selected_quantity FROM ${CART_TABLE} WHERE user_id = $1`,
        [userId],
      );
      res.json(rows[0]);
    } catch (error) {
      console.error("Error fetching cart summary:", error);
      res.status(500).json({ error: "Failed to fetch cart summary" });
    }
  },
};

module.exports = cartController;
