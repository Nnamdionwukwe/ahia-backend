// controllers/adminController.js
const db = require("../config/database");
const bcrypt = require("bcryptjs");

const adminController = {
  /**
   * Get all users (with pagination and search)
   */
  getAllUsers: async (req, res) => {
    try {
      const { page = 1, limit = 100, search = "", role, verified } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          id,
          phone_number,
          full_name,
          email,
          profile_image,
          role,
          is_verified,
          signup_method,
          created_at,
          updated_at
        FROM users
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      // Search filter
      if (search) {
        query += ` AND (
          full_name ILIKE $${paramCount} OR 
          email ILIKE $${paramCount} OR 
          phone_number ILIKE $${paramCount}
        )`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Role filter
      if (role) {
        query += ` AND role = $${paramCount}`;
        params.push(role);
        paramCount++;
      }

      // Verified filter
      if (verified !== undefined) {
        query += ` AND is_verified = $${paramCount}`;
        params.push(verified === "true");
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM users WHERE 1=1";
      const countParams = [];
      let countParamCount = 1;

      if (search) {
        countQuery += ` AND (
          full_name ILIKE $${countParamCount} OR 
          email ILIKE $${countParamCount} OR 
          phone_number ILIKE $${countParamCount}
        )`;
        countParams.push(`%${search}%`);
        countParamCount++;
      }

      if (role) {
        countQuery += ` AND role = $${countParamCount}`;
        countParams.push(role);
        countParamCount++;
      }

      if (verified !== undefined) {
        countQuery += ` AND is_verified = $${countParamCount}`;
        countParams.push(verified === "true");
      }

      const countResult = await db.query(countQuery, countParams);

      // Get user stats
      const statsResult = await db.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
          COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
        FROM users
      `);

      res.json({
        success: true,
        users: result.rows,
        stats: statsResult.rows[0],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
      });
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
      });
    }
  },

  /**
   * Get user by ID
   */
  getUserById: async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await db.query(
        `SELECT 
          id,
          phone_number,
          full_name,
          email,
          profile_image,
          role,
          is_verified,
          signup_method,
          created_at,
          updated_at
        FROM users
        WHERE id = $1`,
        [userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get user stats
      const orderStats = await db.query(
        `SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_spent
        FROM orders
        WHERE user_id = $1`,
        [userId],
      );

      res.json({
        success: true,
        user: {
          ...result.rows[0],
          order_stats: orderStats.rows[0],
        },
      });
    } catch (error) {
      console.error("Get user by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user",
      });
    }
  },

  /**
   * Update user (admin)
   */
  updateUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const { full_name, email, phone_number, role, is_verified } = req.body;

      // Check if user exists
      const userCheck = await db.query("SELECT id FROM users WHERE id = $1", [
        userId,
      ]);

      if (userCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (full_name !== undefined) {
        updates.push(`full_name = $${paramCount}`);
        values.push(full_name);
        paramCount++;
      }

      if (email !== undefined) {
        updates.push(`email = $${paramCount}`);
        values.push(email);
        paramCount++;
      }

      if (phone_number !== undefined) {
        updates.push(`phone_number = $${paramCount}`);
        values.push(phone_number);
        paramCount++;
      }

      if (role !== undefined) {
        // Validate role
        if (!["customer", "admin"].includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role. Must be 'customer' or 'admin'",
          });
        }
        updates.push(`role = $${paramCount}`);
        values.push(role);
        paramCount++;
      }

      if (is_verified !== undefined) {
        updates.push(`is_verified = $${paramCount}`);
        values.push(is_verified);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING 
          id,
          phone_number,
          full_name,
          email,
          role,
          is_verified,
          signup_method,
          created_at,
          updated_at
      `;

      const result = await db.query(query, values);

      res.json({
        success: true,
        message: "User updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Update user error:", error);

      // Handle unique constraint violations
      if (error.code === "23505") {
        if (error.constraint === "users_phone_number_key") {
          return res.status(400).json({
            success: false,
            message: "Phone number already in use",
          });
        }
        if (error.constraint === "users_email_key") {
          return res.status(400).json({
            success: false,
            message: "Email already in use",
          });
        }
      }

      res.status(500).json({
        success: false,
        message: "Failed to update user",
      });
    }
  },

  /**
   * Delete user (admin)
   */
  deleteUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;

      // Prevent admin from deleting themselves
      if (userId === adminId) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete your own account",
        });
      }

      // Check if user exists
      const userCheck = await db.query(
        "SELECT id, role FROM users WHERE id = $1",
        [userId],
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Delete user (cascade will handle related records)
      await db.query("DELETE FROM users WHERE id = $1", [userId]);

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete user",
      });
    }
  },

  /**
   * Verify user
   */
  verifyUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const { is_verified } = req.body;

      const result = await db.query(
        `UPDATE users
         SET is_verified = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, full_name, email, is_verified`,
        [is_verified, userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: `User ${is_verified ? "verified" : "unverified"} successfully`,
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Verify user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update verification status",
      });
    }
  },

  /**
   * Update user role
   */
  updateUserRole: async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const adminId = req.user.id;

      // Validate role
      if (!["customer", "admin"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role. Must be 'customer' or 'admin'",
        });
      }

      // Prevent admin from changing their own role
      if (userId === adminId) {
        return res.status(400).json({
          success: false,
          message: "Cannot change your own role",
        });
      }

      const result = await db.query(
        `UPDATE users
         SET role = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, full_name, email, role`,
        [role, userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User role updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Update user role error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update user role",
      });
    }
  },

  /**
   * Get platform analytics (placeholder - you already have this)
   */
  getPlatformAnalytics: async (req, res) => {
    try {
      const { period = "30d" } = req.query;

      // Parse period
      let days = 30;
      if (period === "7d") days = 7;
      else if (period === "90d") days = 90;

      // Get metrics
      const metricsQuery = await db.query(
        `SELECT 
          COUNT(DISTINCT user_id) as active_users,
          COUNT(*) as total_sessions,
          SUM(CASE WHEN event_type = 'product_view' THEN 1 ELSE 0 END) as products_viewed,
          COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END) as total_purchases
        FROM analytics_events
        WHERE created_at > NOW() - INTERVAL '${days} days'`,
      );

      res.json({
        success: true,
        metrics: metricsQuery.rows[0],
        popularProducts: [],
        popularSearches: [],
        dauOverTime: [],
      });
    } catch (error) {
      console.error("Get platform analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch analytics",
      });
    }
  },

  /**
   * Get user orders (admin)
   */
  getUserOrders: async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          o.id,
          o.total_amount,
          o.discount_amount,
          o.status,
          o.payment_method,
          o.created_at,
          o.estimated_delivery,
          COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await db.query(query, [userId, limit, offset]);

      res.json({
        success: true,
        orders: result.rows,
      });
    } catch (error) {
      console.error("Get user orders error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user orders",
      });
    }
  },

  /**
   * Get user addresses (admin)
   */
  getUserAddresses: async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await db.query(
        `SELECT 
          id,
          address_line1,
          address_line2,
          city,
          state,
          country,
          postal_code,
          is_default,
          created_at
        FROM addresses
        WHERE user_id = $1
        ORDER BY is_default DESC, created_at DESC`,
        [userId],
      );

      res.json({
        success: true,
        addresses: result.rows,
      });
    } catch (error) {
      console.error("Get user addresses error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user addresses",
      });
    }
  },

  /**
   * Get user stats (admin)
   */
  getUserStats: async (req, res) => {
    try {
      const { userId } = req.params;

      // Get order stats
      const orderStats = await db.query(
        `SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COALESCE(SUM(total_amount), 0) as total_spent
        FROM orders
        WHERE user_id = $1`,
        [userId],
      );

      // Get wishlist count
      const wishlistCount = await db.query(
        "SELECT COUNT(*) FROM wishlists WHERE user_id = $1",
        [userId],
      );

      // Get cart count
      const cartCount = await db.query(
        "SELECT COUNT(*) FROM carts WHERE user_id = $1",
        [userId],
      );

      res.json({
        success: true,
        stats: {
          orders: orderStats.rows[0],
          wishlist_items: parseInt(wishlistCount.rows[0].count),
          cart_items: parseInt(cartCount.rows[0].count),
        },
      });
    } catch (error) {
      console.error("Get user stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user statistics",
      });
    }
  },

  // ========================================================
  // NEW METHODS FOR ORDERS MANAGEMENT
  // ========================================================

  /**
   * Get All Orders (Admin)
   */
  getAllOrders: async (req, res) => {
    try {
      const { status = "all", limit = 100, search = "" } = req.query;

      let query = `
        SELECT 
          o.id,
          o.status,
          o.total_amount,
          o.discount_amount,
          o.payment_method,
          o.payment_status,
          o.created_at,
          u.full_name as user_name, 
          u.email as user_email,
          COUNT(oi.id) as item_count
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      // Filter by status
      if (status && status !== "all") {
        query += ` AND o.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      // Search by Order ID, Customer Name, or Email
      if (search) {
        query += ` AND (
          o.id ILIKE $${paramCount} OR 
          u.full_name ILIKE $${paramCount} OR 
          u.email ILIKE $${paramCount}
        )`;
        params.push(`%${search}%`);
        paramCount++;
      }

      query += `
        GROUP BY o.id, o.status, o.total_amount, o.discount_amount, o.payment_method, o.payment_status, o.created_at, u.full_name, u.email
        ORDER BY o.created_at DESC
        LIMIT $${paramCount}
      `;

      params.push(limit);

      const result = await db.query(query, params);

      res.json({
        success: true,
        orders: result.rows,
      });
    } catch (error) {
      console.error("Get all orders error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }
  },

  /**
   * Update Order Status
   */
  updateOrderStatus: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      // Validate status
      const validStatuses = [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      const result = await db.query(
        `UPDATE orders 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [status, orderId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      res.json({
        success: true,
        message: `Order status updated to ${status}`,
        order: result.rows[0],
      });
    } catch (error) {
      console.error("Update order status error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update order status",
      });
    }
  },
};

module.exports = adminController;
