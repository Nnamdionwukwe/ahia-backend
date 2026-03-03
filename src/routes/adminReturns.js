// src/routes/adminReturns.js
// Mount in server.js: app.use("/api/admin/returns", adminReturnsRouter)

const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

const guard = [authenticateUser, requireAdmin];

// ── GET /api/admin/returns ────────────────────────────────────────────────────
// Query params: page, limit, status, search
router.get("/", ...guard, async (req, res) => {
  try {
    const { page = 1, limit = 15, status, search } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = "WHERE 1=1";

    if (status) {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (r.order_id::text ILIKE $${params.length} OR r.reason ILIKE $${params.length})`;
    }

    const countRes = await db.query(
      `SELECT COUNT(*) FROM order_returns r ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const dataRes = await db.query(
      `SELECT
         r.*,
         u.full_name   AS customer_name,
         u.email       AS customer_email,
         u.phone_number AS customer_phone
       FROM order_returns r
       LEFT JOIN users u ON r.user_id = u.id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Stats across all returns (not just current page)
    const statsRes = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')  AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')  AS rejected,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed
      FROM order_returns
    `);

    res.json({
      returns: dataRes.rows,
      stats: statsRes.rows[0],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("admin getReturns error:", e);
    res.status(500).json({ error: "Failed to fetch returns" });
  }
});

// ── GET /api/admin/returns/:id ────────────────────────────────────────────────
router.get("/:id", ...guard, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*,
              u.full_name AS customer_name, u.email AS customer_email
       FROM order_returns r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [req.params.id],
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Return not found" });
    res.json({ return: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/admin/returns/:id/status ───────────────────────────────────────
router.patch("/:id/status", ...guard, async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    const allowed = ["pending", "approved", "rejected", "completed"];
    if (!allowed.includes(status))
      return res
        .status(400)
        .json({ error: `status must be one of: ${allowed.join(", ")}` });

    const resolvedAt = ["rejected", "completed"].includes(status)
      ? "NOW()"
      : "NULL";

    const result = await db.query(
      `UPDATE order_returns
       SET status      = $1,
           admin_note  = $2,
           updated_at  = NOW(),
           resolved_at = ${resolvedAt}
       WHERE id = $3
       RETURNING *`,
      [status, admin_note || null, req.params.id],
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Return not found" });

    // Mirror status back to order if needed
    const ret = result.rows[0];
    if (status === "completed" || status === "rejected") {
      await db.query(
        `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status === "completed" ? "delivered" : "delivered", ret.order_id],
      );
    }

    res.json({ success: true, return: ret });
  } catch (e) {
    console.error("admin updateReturnStatus error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
