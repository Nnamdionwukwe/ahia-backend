// src/controllers/adminController.js
// Drop-in replacement — all methods referenced in adminRoutes.js are present.
const db = require("../config/database");
const bcrypt = require("bcryptjs");

const adminController = {
  // ======================================================
  // USERS
  // ======================================================

  getAllUsers: async (req, res) => {
    try {
      const { page = 1, limit = 100, search = "", role, verified } = req.query;
      const offset = (page - 1) * limit;
      let query = `SELECT id, phone_number, full_name, email, profile_image,
                          role, is_verified, signup_method, created_at, updated_at
                   FROM users WHERE 1=1`;
      const params = [];
      let p = 1;
      if (search) {
        query += ` AND (full_name ILIKE $${p} OR email ILIKE $${p} OR phone_number ILIKE $${p})`;
        params.push(`%${search}%`);
        p++;
      }
      if (role) {
        query += ` AND role = $${p++}`;
        params.push(role);
      }
      if (verified !== undefined) {
        query += ` AND is_verified = $${p++}`;
        params.push(verified === "true");
      }
      query += ` ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
      params.push(limit, offset);
      const result = await db.query(query, params);

      let cq = "SELECT COUNT(*) FROM users WHERE 1=1";
      const cp = [];
      let cpp = 1;
      if (search) {
        cq += ` AND (full_name ILIKE $${cpp} OR email ILIKE $${cpp} OR phone_number ILIKE $${cpp})`;
        cp.push(`%${search}%`);
        cpp++;
      }
      if (role) {
        cq += ` AND role = $${cpp++}`;
        cp.push(role);
      }
      if (verified !== undefined) {
        cq += ` AND is_verified = $${cpp++}`;
        cp.push(verified === "true");
      }
      const countResult = await db.query(cq, cp);

      const statsResult = await db.query(`
        SELECT COUNT(*) as total_users,
               COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
               COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
               COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
        FROM users`);

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
      console.error("getAllUsers error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch users" });
    }
  },

  getUserById: async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await db.query(
        `SELECT id, phone_number, full_name, email, profile_image,
                role, is_verified, signup_method, created_at, updated_at
         FROM users WHERE id = $1`,
        [userId],
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      const orderStats = await db.query(
        `SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount),0) as total_spent FROM orders WHERE user_id = $1`,
        [userId],
      );
      res.json({
        success: true,
        user: { ...result.rows[0], order_stats: orderStats.rows[0] },
      });
    } catch (error) {
      console.error("getUserById error:", error);
      res.status(500).json({ success: false, message: "Failed to fetch user" });
    }
  },

  updateUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const { full_name, email, phone_number, role, is_verified } = req.body;
      const check = await db.query("SELECT id FROM users WHERE id = $1", [
        userId,
      ]);
      if (!check.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });

      const updates = [];
      const values = [];
      let p = 1;
      if (full_name !== undefined) {
        updates.push(`full_name = $${p++}`);
        values.push(full_name);
      }
      if (email !== undefined) {
        updates.push(`email = $${p++}`);
        values.push(email);
      }
      if (phone_number !== undefined) {
        updates.push(`phone_number = $${p++}`);
        values.push(phone_number);
      }
      if (role !== undefined) {
        if (!["customer", "admin"].includes(role))
          return res
            .status(400)
            .json({ success: false, message: "Invalid role" });
        updates.push(`role = $${p++}`);
        values.push(role);
      }
      if (is_verified !== undefined) {
        updates.push(`is_verified = $${p++}`);
        values.push(is_verified);
      }
      if (!updates.length)
        return res
          .status(400)
          .json({ success: false, message: "No fields to update" });

      updates.push(`updated_at = NOW()`);
      values.push(userId);
      const result = await db.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${p}
         RETURNING id, phone_number, full_name, email, role, is_verified, signup_method, created_at, updated_at`,
        values,
      );
      res.json({
        success: true,
        message: "User updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("updateUser error:", error);
      if (error.code === "23505") {
        if (error.constraint === "users_phone_number_key")
          return res
            .status(400)
            .json({ success: false, message: "Phone number already in use" });
        if (error.constraint === "users_email_key")
          return res
            .status(400)
            .json({ success: false, message: "Email already in use" });
      }
      res
        .status(500)
        .json({ success: false, message: "Failed to update user" });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;
      if (userId === adminId)
        return res
          .status(400)
          .json({ success: false, message: "Cannot delete your own account" });
      const check = await db.query("SELECT id FROM users WHERE id = $1", [
        userId,
      ]);
      if (!check.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      await db.query("DELETE FROM users WHERE id = $1", [userId]);
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("deleteUser error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to delete user" });
    }
  },

  verifyUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const { is_verified } = req.body;
      const result = await db.query(
        `UPDATE users SET is_verified = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, full_name, email, is_verified`,
        [is_verified, userId],
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      res.json({
        success: true,
        message: `User ${is_verified ? "verified" : "unverified"} successfully`,
        user: result.rows[0],
      });
    } catch (error) {
      console.error("verifyUser error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update verification status",
      });
    }
  },

  updateUserRole: async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const adminId = req.user.id;
      if (!["customer", "admin"].includes(role))
        return res
          .status(400)
          .json({ success: false, message: "Invalid role" });
      if (userId === adminId)
        return res
          .status(400)
          .json({ success: false, message: "Cannot change your own role" });
      const result = await db.query(
        `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, full_name, email, role`,
        [role, userId],
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      res.json({
        success: true,
        message: "User role updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("updateUserRole error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to update user role" });
    }
  },

  getUserOrders: async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;
      const result = await db.query(
        `SELECT o.id, o.total_amount, o.discount_amount, o.status, o.payment_method,
                o.created_at, o.estimated_delivery, COUNT(oi.id) as item_count
         FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );
      res.json({ success: true, orders: result.rows });
    } catch (error) {
      console.error("getUserOrders error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch user orders" });
    }
  },

  getUserAddresses: async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await db.query(
        `SELECT id, address_line1, address_line2, city, state, country,
                postal_code, is_default, created_at
         FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
        [userId],
      );
      res.json({ success: true, addresses: result.rows });
    } catch (error) {
      console.error("getUserAddresses error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch user addresses" });
    }
  },

  getUserStats: async (req, res) => {
    try {
      const { userId } = req.params;
      const orderStats = await db.query(
        `SELECT COUNT(*) as total_orders,
                COUNT(CASE WHEN status='completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN status='pending'   THEN 1 END) as pending_orders,
                COALESCE(SUM(total_amount),0) as total_spent
         FROM orders WHERE user_id = $1`,
        [userId],
      );
      const stats = {
        orders: orderStats.rows[0],
        wishlist_items: 0,
        cart_items: 0,
      };
      try {
        const r = await db.query(
          "SELECT COUNT(*) FROM wishlists WHERE user_id=$1",
          [userId],
        );
        stats.wishlist_items = parseInt(r.rows[0].count);
      } catch {}
      try {
        const r = await db.query(
          "SELECT COUNT(*) FROM carts    WHERE user_id=$1",
          [userId],
        );
        stats.cart_items = parseInt(r.rows[0].count);
      } catch {}
      res.json({ success: true, stats });
    } catch (error) {
      console.error("getUserStats error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch user statistics" });
    }
  },

  // ======================================================
  // ORDERS
  // ======================================================

  getAllOrders: async (req, res) => {
    try {
      const { status = "all", limit = 100, search = "" } = req.query;
      let query = `
        SELECT o.id, o.status, o.total_amount, o.discount_amount,
               o.payment_method, o.payment_status, o.created_at,
               u.full_name as user_name, u.email as user_email,
               COUNT(oi.id) as item_count
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1`;
      const params = [];
      let p = 1;
      if (status && status !== "all") {
        query += ` AND o.status = $${p++}`;
        params.push(status);
      }
      if (search) {
        query += ` AND (o.id ILIKE $${p} OR u.full_name ILIKE $${p} OR u.email ILIKE $${p})`;
        params.push(`%${search}%`);
        p++;
      }
      query += ` GROUP BY o.id, o.status, o.total_amount, o.discount_amount,
                           o.payment_method, o.payment_status, o.created_at,
                           u.full_name, u.email
                 ORDER BY o.created_at DESC LIMIT $${p}`;
      params.push(limit);
      const result = await db.query(query, params);
      res.json({ success: true, orders: result.rows });
    } catch (error) {
      console.error("getAllOrders error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch orders" });
    }
  },

  updateOrderStatus: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      const valid = [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ];
      if (!valid.includes(status))
        return res
          .status(400)
          .json({ success: false, message: "Invalid order status" });
      const result = await db.query(
        `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, orderId],
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      res.json({
        success: true,
        message: `Order status updated to ${status}`,
        order: result.rows[0],
      });
    } catch (error) {
      console.error("updateOrderStatus error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to update order status" });
    }
  },

  clearAllOrders: async (req, res) => {
    const client = await db.pool.connect();
    try {
      const {
        status,
        olderThanDays,
        dryRun = false,
        confirmPaid = false,
      } = req.body;
      if (!status)
        return res.status(400).json({
          success: false,
          message:
            'status is required. Pass a specific status or "all" to clear everything.',
          allowedValues: [
            "pending",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "failed",
            "all",
          ],
        });
      const conditions = [];
      const params = [];
      let p = 1;
      if (status !== "all") {
        const valid = [
          "pending",
          "processing",
          "shipped",
          "delivered",
          "cancelled",
          "failed",
        ];
        if (!valid.includes(status))
          return res
            .status(400)
            .json({ success: false, message: `Invalid status "${status}"` });
        conditions.push(`status = $${p++}`);
        params.push(status);
      }
      if (olderThanDays) {
        const days = parseInt(olderThanDays);
        if (isNaN(days) || days < 1)
          return res.status(400).json({
            success: false,
            message: "olderThanDays must be a positive integer",
          });
        conditions.push(`created_at < NOW() - INTERVAL '${days} days'`);
      }
      if (!confirmPaid) conditions.push(`payment_status != 'paid'`);
      const w = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM orders ${w}`,
        params,
      );
      const n = parseInt(countResult.rows[0].count);
      if (dryRun)
        return res.json({
          success: true,
          dryRun: true,
          wouldDelete: n,
          filters: { status, olderThanDays, confirmPaid },
          message: `Dry run: ${n} order(s) would be deleted.`,
        });
      if (n === 0)
        return res.json({
          success: true,
          deletedCount: 0,
          message: "No orders matched. Nothing deleted.",
        });
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders ${w})`,
        params,
      );
      const del = await client.query(
        `DELETE FROM orders ${w} RETURNING id`,
        params,
      );
      await client.query("COMMIT");
      return res.json({
        success: true,
        deletedCount: del.rows.length,
        filters: { status, olderThanDays, confirmPaid },
        message: `Successfully deleted ${del.rows.length} order(s).`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("clearAllOrders error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to clear orders",
        error: error.message,
      });
    } finally {
      client.release();
    }
  },

  // ======================================================
  // ANALYTICS
  // ======================================================

  getPlatformAnalytics: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const m = await db.query(
        `SELECT COUNT(DISTINCT id) as active_users, 0 as total_sessions,
                0 as products_viewed, 0 as total_purchases
         FROM users WHERE created_at > NOW() - INTERVAL '${days} days'`,
      );
      res.json({
        success: true,
        metrics: m.rows[0],
        popularProducts: [],
        popularSearches: [],
        dauOverTime: [],
      });
    } catch (error) {
      console.error("getPlatformAnalytics error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch analytics" });
    }
  },

  // ======================================================
  // RETURNS
  // ======================================================

  getAllReturns: async (req, res) => {
    try {
      const { status, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;
      const params = [];
      let query = `
      SELECT r.id, r.order_id, r.user_id, r.reason, r.details, r.status,
             r.refund_method, r.refund_amount, r.admin_note, r.media,   -- ← media added
             r.created_at, r.resolved_at,
             u.full_name    AS user_name,
             u.email        AS user_email,
             u.phone_number AS user_phone,
             o.total_amount AS order_total,
             o.payment_method
      FROM order_returns r
      JOIN users  u ON r.user_id  = u.id
      JOIN orders o ON r.order_id = o.id
      WHERE 1=1`;
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

      // Parse media if stored as string (some PG drivers return JSONB as string)
      const returns = result.rows.map((r) => ({
        ...r,
        media:
          typeof r.media === "string" ? JSON.parse(r.media) : r.media || [],
      }));

      const counts = await db.query(
        `SELECT status, COUNT(*) as count FROM order_returns GROUP BY status`,
      );
      const statusCounts = counts.rows.reduce((acc, r) => {
        acc[r.status] = parseInt(r.count);
        return acc;
      }, {});

      return res.json({
        success: true,
        returns,
        counts: statusCounts,
        total: returns.length,
      });
    } catch (error) {
      console.error("getAllReturns error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch return requests" });
    }
  },

  processReturn: async (req, res) => {
    const client = await db.pool.connect();
    try {
      const { returnId } = req.params;
      const { action, admin_note, refund_amount } = req.body;
      const adminId = req.user.id;

      if (!action)
        return res.status(400).json({
          success: false,
          message: 'action required: "approve" | "reject" | "complete"',
        });
      if (!["approve", "reject", "complete"].includes(action))
        return res
          .status(400)
          .json({ success: false, message: "Invalid action" });

      await client.query("BEGIN");

      const rr = await client.query(
        `SELECT r.*, o.user_id AS customer_id FROM order_returns r
         JOIN orders o ON r.order_id = o.id WHERE r.id = $1`,
        [returnId],
      );
      if (!rr.rows.length) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Return not found" });
      }
      const ret = rr.rows[0];

      if (ret.status !== "pending" && action !== "complete") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Return is already "${ret.status}" — cannot ${action} it`,
        });
      }
      if (action === "complete" && ret.status !== "approved") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: 'Only "approved" returns can be completed',
        });
      }

      const newStatus = {
        approve: "approved",
        reject: "rejected",
        complete: "completed",
      }[action];
      const finalAmount = refund_amount ?? ret.refund_amount;

      await client.query(
        `UPDATE order_returns SET status=$1, admin_note=$2, refund_amount=$3,
         resolved_by=$4, resolved_at=NOW(), updated_at=NOW() WHERE id=$5`,
        [
          newStatus,
          admin_note || ret.admin_note,
          finalAmount,
          adminId,
          returnId,
        ],
      );

      const orderStatus = {
        approve: "return_approved",
        reject: "return_rejected",
        complete: "returned",
      }[action];
      await client.query(
        `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`,
        [orderStatus, ret.order_id],
      );

      try {
        const nc = require("./notificationsController");
        const msgs = {
          approve: `Your return for order #${ret.order_id} was approved. Refund of ₦${Number(finalAmount).toLocaleString()} is being processed.`,
          reject: `Your return for order #${ret.order_id} was not approved.${admin_note ? ` Reason: ${admin_note}` : ""}`,
          complete: `Your refund for order #${ret.order_id} has been completed.`,
        };
        await nc.notifyOrderUpdate(
          ret.customer_id,
          ret.order_id,
          `return_${action}d`,
          msgs[action],
        );
      } catch (e) {
        console.warn("Return notification failed (non-fatal):", e.message);
      }

      await client.query("COMMIT");
      return res.json({
        success: true,
        message: `Return ${newStatus} successfully`,
        return_id: returnId,
        new_status: newStatus,
        refund_amount: finalAmount,
        order_id: ret.order_id,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("processReturn error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to process return",
        error: error.message,
      });
    } finally {
      client.release();
    }
  },
};

module.exports = adminController;
