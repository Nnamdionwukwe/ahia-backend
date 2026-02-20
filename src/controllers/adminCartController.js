// controllers/adminCartController.js
const pool = require("../config/database");

const adminCartController = {
  // GET /api/admin/carts/stats
  getStats: async (req, res) => {
    try {
      const statsQuery = `
        SELECT
          COUNT(DISTINCT user_id) AS "totalCarts",
          COUNT(DISTINCT CASE
            WHEN GREATEST(
              COALESCE(MAX(updated_at), created_at),
              created_at
            ) >= NOW() - INTERVAL '24 hours'
            THEN user_id END
          ) AS "activeCarts",
          COUNT(DISTINCT CASE
            WHEN GREATEST(
              COALESCE(MAX(updated_at), created_at),
              created_at
            ) < NOW() - INTERVAL '24 hours'
            THEN user_id END
          ) AS "abandonedCarts"
        FROM carts
        GROUP BY user_id
      `;

      // Simpler, reliable version
      const simpleStats = await pool.query(`
        SELECT
          COUNT(DISTINCT user_id)                          AS "totalCarts",
          COUNT(DISTINCT CASE
            WHEN COALESCE(updated_at, created_at) >= NOW() - INTERVAL '24 hours'
            THEN user_id END)                              AS "activeCarts",
          COUNT(DISTINCT CASE
            WHEN COALESCE(updated_at, created_at) < NOW() - INTERVAL '24 hours'
            THEN user_id END)                              AS "abandonedCarts"
        FROM carts
      `);

      const valueQuery = await pool.query(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN pv.id IS NOT NULL THEN
                COALESCE(
                  CASE WHEN pv.discount_percentage > 0
                    THEN pv.base_price * (1 - pv.discount_percentage / 100.0)
                    ELSE pv.base_price END,
                  p.price
                )
              ELSE
                CASE WHEN p.discount_percentage > 0
                  THEN p.price * (1 - p.discount_percentage / 100.0)
                  ELSE p.price END
            END * c.quantity
          ), 0) AS "totalValue"
        FROM carts c
        JOIN products p ON c.product_id = p.id
        LEFT JOIN product_variants pv ON c.product_variant_id = pv.id
      `);

      const avgQuery = await pool.query(`
        SELECT COALESCE(AVG(user_total), 0) AS "avgCartValue"
        FROM (
          SELECT
            c.user_id,
            SUM(
              CASE
                WHEN pv.id IS NOT NULL THEN
                  COALESCE(
                    CASE WHEN pv.discount_percentage > 0
                      THEN pv.base_price * (1 - pv.discount_percentage / 100.0)
                      ELSE pv.base_price END,
                    p.price
                  )
                ELSE
                  CASE WHEN p.discount_percentage > 0
                    THEN p.price * (1 - p.discount_percentage / 100.0)
                    ELSE p.price END
              END * c.quantity
            ) AS user_total
          FROM carts c
          JOIN products p ON c.product_id = p.id
          LEFT JOIN product_variants pv ON c.product_variant_id = pv.id
          GROUP BY c.user_id
        ) totals
      `);

      res.json({
        totalCarts: parseInt(simpleStats.rows[0].totalCarts) || 0,
        activeCarts: parseInt(simpleStats.rows[0].activeCarts) || 0,
        abandonedCarts: parseInt(simpleStats.rows[0].abandonedCarts) || 0,
        totalValue: parseFloat(valueQuery.rows[0].totalValue) || 0,
        avgCartValue: parseFloat(avgQuery.rows[0].avgCartValue) || 0,
      });
    } catch (error) {
      console.error("Admin cart stats error:", error);
      res.status(500).json({ error: "Failed to fetch cart stats" });
    }
  },

  // GET /api/admin/carts  — paginated list of all users with carts
  getAllCarts: async (req, res) => {
    try {
      const { page = 1, limit = 20, search, status } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const params = [];
      const conditions = [];

      if (search) {
        params.push(`%${search}%`);
        conditions.push(
          `(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
        );
      }

      // Status filter using HAVING on max(updated_at)
      let havingClause = "";
      if (status === "active") {
        havingClause = `HAVING MAX(COALESCE(c.updated_at, c.created_at)) >= NOW() - INTERVAL '24 hours'`;
      } else if (status === "abandoned") {
        havingClause = `HAVING MAX(COALESCE(c.updated_at, c.created_at)) < NOW() - INTERVAL '24 hours'`;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Count query
      params.push(parseInt(limit), offset);
      const limitParam = params.length - 1;
      const offsetParam = params.length;

      const cartsQuery = `
        SELECT
          c.user_id,
          u.full_name,
          u.email,
          COUNT(c.id)                                        AS item_count,
          SUM(c.quantity)                                    AS total_quantity,
          MAX(COALESCE(c.updated_at, c.created_at))         AS last_activity,
          COALESCE(SUM(
            CASE
              WHEN pv.id IS NOT NULL THEN
                CASE WHEN pv.discount_percentage > 0
                  THEN pv.base_price * (1 - pv.discount_percentage / 100.0)
                  ELSE pv.base_price END
              ELSE
                CASE WHEN p.discount_percentage > 0
                  THEN p.price * (1 - p.discount_percentage / 100.0)
                  ELSE p.price END
            END * c.quantity
          ), 0) AS cart_value
        FROM carts c
        JOIN users u ON c.user_id = u.id
        JOIN products p ON c.product_id = p.id
        LEFT JOIN product_variants pv ON c.product_variant_id = pv.id
        ${whereClause}
        GROUP BY c.user_id, u.full_name, u.email
        ${havingClause}
        ORDER BY last_activity DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      // Total count (without limit/offset)
      const countParams = params.slice(0, params.length - 2);
      const countQuery = `
        SELECT COUNT(*) FROM (
          SELECT c.user_id
          FROM carts c
          JOIN users u ON c.user_id = u.id
          ${whereClause}
          GROUP BY c.user_id
          ${havingClause}
        ) sub
      `;

      const [cartsResult, countResult] = await Promise.all([
        pool.query(cartsQuery, params),
        pool.query(countQuery, countParams),
      ]);

      const total = parseInt(countResult.rows[0].count) || 0;

      res.json({
        carts: cartsResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Admin get all carts error:", error);
      res.status(500).json({ error: "Failed to fetch carts" });
    }
  },

  // GET /api/admin/carts/:userId/items  — full cart for a specific user
  getUserCartItems: async (req, res) => {
    try {
      const { userId } = req.params;

      const query = `
        SELECT
          c.id,
          c.user_id,
          c.product_id,
          c.product_variant_id,
          c.quantity,
          c.is_selected,
          c.selected_image_url,
          c.created_at,
          c.updated_at,
          p.name,
          p.price,
          p.original_price,
          p.discount_percentage,
          p.stock_quantity,
          p.images,
          p.category,
          p.brand,
          pv.color,
          pv.size,
          pv.sku,
          pv.base_price AS variant_price,
          pv.discount_percentage AS variant_discount,
          CASE
            WHEN pv.id IS NOT NULL THEN
              CASE WHEN pv.discount_percentage > 0
                THEN pv.base_price * (1 - pv.discount_percentage / 100.0)
                ELSE pv.base_price END
            ELSE
              CASE WHEN p.discount_percentage > 0
                THEN p.price * (1 - p.discount_percentage / 100.0)
                ELSE p.price END
          END AS final_price,
          CASE
            WHEN pv.id IS NOT NULL THEN pv.base_price
            ELSE p.original_price
          END AS item_original_price
        FROM carts c
        JOIN products p ON c.product_id = p.id
        LEFT JOIN product_variants pv ON c.product_variant_id = pv.id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC
      `;

      const { rows } = await pool.query(query, [userId]);

      // Resolve display image using same priority logic as cartController
      const items = rows.map((item) => {
        let imageUrl = null;

        if (item.selected_image_url) {
          imageUrl = item.selected_image_url;
        } else if (
          item.color &&
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
          imageUrl =
            colorIndex !== -1
              ? item.images[colorIndex % item.images.length]
              : item.images[0];
        } else if (Array.isArray(item.images) && item.images.length > 0) {
          imageUrl = item.images[0];
        }

        return { ...item, image_url: imageUrl };
      });

      res.json({ items });
    } catch (error) {
      console.error("Admin get user cart items error:", error);
      res.status(500).json({ error: "Failed to fetch cart items" });
    }
  },

  // DELETE /api/admin/carts/:userId  — clear entire cart for a user
  clearUserCart: async (req, res) => {
    try {
      const { userId } = req.params;
      await pool.query("DELETE FROM carts WHERE user_id = $1", [userId]);
      res.json({ message: "Cart cleared successfully" });
    } catch (error) {
      console.error("Admin clear user cart error:", error);
      res.status(500).json({ error: "Failed to clear cart" });
    }
  },

  // DELETE /api/admin/carts/items/:itemId  — remove a single cart item
  removeCartItem: async (req, res) => {
    try {
      const { itemId } = req.params;
      const result = await pool.query(
        "DELETE FROM carts WHERE id = $1 RETURNING id",
        [itemId],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      res.json({ message: "Item removed" });
    } catch (error) {
      console.error("Admin remove cart item error:", error);
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  },
};

module.exports = adminCartController;
