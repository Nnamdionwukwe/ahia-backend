// controllers/userController.js - FIXED VERSION
const db = require("../config/database");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

/**
 * User Controller
 * Based on users table schema with UUID primary keys
 */

const userController = {
  /**
   * Get user profile
   */
  getProfile: async (req, res) => {
    try {
      const userId = req.user.id; // From auth middleware

      const result = await db.query(
        `SELECT 
          id, 
          phone_number, 
          full_name, 
          profile_image, 
          email, 
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

      res.json({
        success: true,
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch profile",
      });
    }
  },

  /**
   * Update user profile
   */
  updateProfile: async (req, res) => {
    try {
      const userId = req.user.id;
      const { full_name, phone_number, profile_image } = req.body;

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (full_name !== undefined) {
        updates.push(`full_name = $${paramCount}`);
        values.push(full_name);
        paramCount++;
      }

      if (phone_number !== undefined) {
        updates.push(`phone_number = $${paramCount}`);
        values.push(phone_number);
        paramCount++;
      }

      if (profile_image !== undefined) {
        updates.push(`profile_image = $${paramCount}`);
        values.push(profile_image);
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
          profile_image, 
          email, 
          role, 
          is_verified,
          created_at,
          updated_at
      `;

      const result = await db.query(query, values);

      res.json({
        success: true,
        message: "Profile updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Update profile error:", error);

      // Handle unique constraint violations
      if (error.code === "23505") {
        if (error.constraint === "users_phone_number_key") {
          return res.status(400).json({
            success: false,
            message: "Phone number already in use",
          });
        }
      }

      res.status(500).json({
        success: false,
        message: "Failed to update profile",
      });
    }
  },

  /**
   * Change password
   */
  changePassword: async (req, res) => {
    try {
      const userId = req.user.id;
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      if (new_password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters",
        });
      }

      // Get current password hash
      const userResult = await db.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = userResult.rows[0];

      // Check if password_hash exists (Google users won't have it)
      if (!user.password_hash) {
        return res.status(400).json({
          success: false,
          message: "Cannot change password for Google authenticated accounts",
        });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        current_password,
        user.password_hash,
      );

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(new_password, 10);

      // Update password
      await db.query(
        `UPDATE users 
         SET password_hash = $1, updated_at = NOW() 
         WHERE id = $2`,
        [hashedPassword, userId],
      );

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to change password",
      });
    }
  },

  /**
   * Delete user account
   */
  deleteAccount: async (req, res) => {
    try {
      const userId = req.user.id;
      const { password } = req.body;

      // Get user
      const userResult = await db.query(
        "SELECT password_hash, signup_method FROM users WHERE id = $1",
        [userId],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = userResult.rows[0];

      // Verify password for phone signup users
      if (user.signup_method === "phone" && user.password_hash) {
        if (!password) {
          return res.status(400).json({
            success: false,
            message: "Password required to delete account",
          });
        }

        const isValidPassword = await bcrypt.compare(
          password,
          user.password_hash,
        );
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            message: "Invalid password",
          });
        }
      }

      // Delete user (cascade will handle related records)
      await db.query("DELETE FROM users WHERE id = $1", [userId]);

      res.json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete account",
      });
    }
  },

  /**
   * Get user's order history
   */
  getOrderHistory: async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status } = req.query;
      const offset = (page - 1) * limit;

      let query = `
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
      `;

      const params = [userId];

      if (status) {
        query += ` AND o.status = $${params.length + 1}`;
        params.push(status);
      }

      query += `
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);

      const result = await db.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM orders WHERE user_id = $1";
      const countParams = [userId];

      if (status) {
        countQuery += " AND status = $2";
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
          pages: Math.ceil(countResult.rows[0].count / limit),
        },
      });
    } catch (error) {
      console.error("Get order history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch order history",
      });
    }
  },

  /**
   * Get user's addresses
   */
  getAddresses: async (req, res) => {
    try {
      const userId = req.user.id;

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
      console.error("Get addresses error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch addresses",
      });
    }
  },

  /**
   * Add new address
   */
  addAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        address_line1,
        address_line2,
        city,
        state,
        country,
        postal_code,
        is_default,
      } = req.body;

      if (!address_line1 || !city || !state || !country) {
        return res.status(400).json({
          success: false,
          message: "Address line 1, city, state, and country are required",
        });
      }

      // If setting as default, unset other default addresses
      if (is_default) {
        await db.query(
          "UPDATE addresses SET is_default = false WHERE user_id = $1",
          [userId],
        );
      }

      const result = await db.query(
        `INSERT INTO addresses 
         (id, user_id, address_line1, address_line2, city, state, country, postal_code, is_default, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING *`,
        [
          uuidv4(),
          userId,
          address_line1,
          address_line2 || null,
          city,
          state,
          country,
          postal_code || null,
          is_default || false,
        ],
      );

      res.status(201).json({
        success: true,
        message: "Address added successfully",
        address: result.rows[0],
      });
    } catch (error) {
      console.error("Add address error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add address",
      });
    }
  },

  /**
   * Update address
   */
  updateAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id: addressId } = req.params;
      const {
        address_line1,
        address_line2,
        city,
        state,
        country,
        postal_code,
        is_default,
      } = req.body;

      // Verify address belongs to user
      const checkResult = await db.query(
        "SELECT id FROM addresses WHERE id = $1 AND user_id = $2",
        [addressId, userId],
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }

      // If setting as default, unset other defaults
      if (is_default) {
        await db.query(
          "UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2",
          [userId, addressId],
        );
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      const fields = {
        address_line1,
        address_line2,
        city,
        state,
        country,
        postal_code,
        is_default,
      };

      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update",
        });
      }

      values.push(addressId, userId);

      const result = await db.query(
        `UPDATE addresses 
         SET ${updates.join(", ")}
         WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
         RETURNING *`,
        values,
      );

      res.json({
        success: true,
        message: "Address updated successfully",
        address: result.rows[0],
      });
    } catch (error) {
      console.error("Update address error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update address",
      });
    }
  },

  /**
   * Delete address
   */
  deleteAddress: async (req, res) => {
    try {
      const userId = req.user.id;
      const { id: addressId } = req.params;

      const result = await db.query(
        "DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *",
        [addressId, userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }

      res.json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      console.error("Delete address error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete address",
      });
    }
  },

  /**
   * Get user statistics - FIXED VERSION
   */
  getUserStats: async (req, res) => {
    try {
      const userId = req.user.id;

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

      // Initialize stats object with defaults
      const stats = {
        orders: orderStats.rows[0],
        wishlist_items: 0,
        cart_items: 0,
      };

      // Try to get wishlist count (gracefully handle if table doesn't exist)
      try {
        const wishlistCount = await db.query(
          "SELECT COUNT(*) FROM wishlists WHERE user_id = $1",
          [userId],
        );
        stats.wishlist_items = parseInt(wishlistCount.rows[0].count);
      } catch (wishlistError) {
        console.log("Wishlist table not found, skipping wishlist count");
        // Keep default value of 0
      }

      // Try to get cart count (gracefully handle if table doesn't exist)
      try {
        const cartCount = await db.query(
          "SELECT COUNT(*) FROM carts WHERE user_id = $1",
          [userId],
        );
        stats.cart_items = parseInt(cartCount.rows[0].count);
      } catch (cartError) {
        console.log("Cart query failed, using default count");
        // Keep default value of 0
      }

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error("Get user stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user statistics",
      });
    }
  },
};

module.exports = userController;
