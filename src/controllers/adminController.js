// src/controllers/adminController.js
const db = require("../config/database");

/**
 * Admin Controller
 * Handles admin-specific operations
 */

const adminController = {
  /**
   * Get all users with pagination and search
   */
  getUsers: async (req, res) => {
    try {
      const { page = 1, limit = 100, search = "", role, status } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          id, phone_number, full_name, profile_image, email, role, 
          is_verified, signup_method, created_at, updated_at
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

      // Verification status filter
      if (status === "verified") {
        query += ` AND is_verified = true`;
      } else if (status === "unverified") {
        query += ` AND is_verified = false`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM users WHERE 1=1";
      const countParams = [];
      let countParamIndex = 1;

      if (search) {
        countQuery += ` AND (
          full_name ILIKE $${countParamIndex} OR 
          email ILIKE $${countParamIndex} OR 
          phone_number ILIKE $${countParamIndex}
        )`;
        countParams.push(`%${search}%`);
        countParamIndex++;
      }

      if (role) {
        countQuery += ` AND role = $${countParamIndex}`;
        countParams.push(role);
        countParamIndex++;
      }

      if (status === "verified") {
        countQuery += ` AND is_verified = true`;
      } else if (status === "unverified") {
        countQuery += ` AND is_verified = false`;
      }

      const countResult = await db.query(countQuery, countParams);

      // Get stats
      const statsResult = await db.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
          COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
          COUNT(CASE WHEN role = 'seller' THEN 1 END) as seller_users,
          COUNT(CASE WHEN signup_method = 'google' THEN 1 END) as google_users,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week
        FROM users
      `);

      res.json({
        success: true,
        users: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
        stats: statsResult.rows[0],
      });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
      });
    }
  },

  /**
   * Get single user details
   */
  getUserDetails: async (req, res) => {
    try {
      const { userId } = req.params;

      const userResult = await db.query(
        `SELECT 
          id, phone_number, full_name, profile_image, email, role, 
          is_verified, signup_method, created_at, updated_at
        FROM users 
        WHERE id = $1`,
        [userId],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get user's order stats
      const orderStats = await db.query(
        `SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_spent,
          AVG(total_amount) as average_order_value
        FROM orders
        WHERE user_id = $1`,
        [userId],
      );

      // Get user's recent activity
      const recentOrders = await db.query(
        `SELECT id, total_amount, status, created_at
        FROM orders
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
        [userId],
      );

      res.json({
        success: true,
        user: userResult.rows[0],
        orderStats: orderStats.rows[0],
        recentOrders: recentOrders.rows,
      });
    } catch (error) {
      console.error("Get user details error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user details",
      });
    }
  },

  /**
   * Update user (admin action)
   */
  updateUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const { role, is_verified, full_name, email } = req.body;

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (role !== undefined) {
        updates.push(`role = $${paramCount}`);
        values.push(role);
        paramCount++;
      }

      if (is_verified !== undefined) {
        updates.push(`is_verified = $${paramCount}`);
        values.push(is_verified);
        paramCount++;
      }

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

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(userId);

      const result = await db.query(
        `UPDATE users 
         SET ${updates.join(", ")}
         WHERE id = $${paramCount}
         RETURNING id, phone_number, full_name, email, role, is_verified`,
        values,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update user",
      });
    }
  },

  /**
   * Delete user (admin action)
   */
  deleteUser: async (req, res) => {
    try {
      const { userId } = req.params;

      // Prevent admin from deleting themselves
      if (userId === req.user.id) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete your own account",
        });
      }

      const result = await db.query(
        "DELETE FROM users WHERE id = $1 RETURNING id, full_name",
        [userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User deleted successfully",
        deleted: result.rows[0],
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
   * Get all orders
   */
  getOrders: async (req, res) => {
    try {
      const { page = 1, limit = 50, status } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          o.id, o.user_id, o.total_amount, o.discount_amount,
          o.status, o.payment_status, o.payment_method,
          o.created_at, o.updated_at,
          u.full_name as user_name, u.email as user_email,
          COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 1;

      if (status) {
        query += ` AND o.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      query += ` GROUP BY o.id, u.full_name, u.email
                 ORDER BY o.created_at DESC
                 LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM orders WHERE 1=1";
      const countParams = [];

      if (status) {
        countQuery += " AND status = $1";
        countParams.push(status);
      }

      const countResult = await db.query(countQuery, countParams);

      res.json({
        success: true,
        orders: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
        },
      });
    } catch (error) {
      console.error("Get orders error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch orders",
      });
    }
  },

  /**
   * Get all products
   */
  getProducts: async (req, res) => {
    try {
      const { page = 1, limit = 50, category } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          p.id, p.name, p.description, p.price, p.images,
          p.category, p.stock_quantity, p.rating, p.created_at,
          s.store_name
        FROM products p
        LEFT JOIN sellers s ON p.seller_id = s.id
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 1;

      if (category) {
        query += ` AND p.category = $${paramCount}`;
        params.push(category);
        paramCount++;
      }

      query += ` ORDER BY p.created_at DESC
                 LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      res.json({
        success: true,
        products: result.rows,
      });
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch products",
      });
    }
  },

  /**
   * Get dashboard overview stats
   */
  getDashboardStats: async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM products) as total_products,
          (SELECT COUNT(*) FROM orders) as total_orders,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status != 'cancelled') as total_revenue,
          (SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL '7 days') as orders_this_week,
          (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_this_week
      `);

      res.json({
        success: true,
        stats: stats.rows[0],
      });
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard stats",
      });
    }
  },
};

module.exports = adminController;
