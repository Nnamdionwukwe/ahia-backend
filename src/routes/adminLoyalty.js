// src/routes/adminLoyalty.js
const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

// Apply to every route in this file
router.use(authenticateToken);
router.use(requireAdmin);

// ── Tier helper ───────────────────────────────────────────────────────────
const TIERS = {
  bronze: { minPoints: 0, multiplier: 1, name: "Bronze" },
  silver: { minPoints: 1000, multiplier: 1.25, name: "Silver" },
  gold: { minPoints: 5000, multiplier: 1.5, name: "Gold" },
  platinum: { minPoints: 15000, multiplier: 2, name: "Platinum" },
};

function calculateTier(lp) {
  if (lp >= TIERS.platinum.minPoints) return TIERS.platinum;
  if (lp >= TIERS.gold.minPoints) return TIERS.gold;
  if (lp >= TIERS.silver.minPoints) return TIERS.silver;
  return TIERS.bronze;
}

// ── GET /api/admin/loyalty/stats ──────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [
      totalMembers,
      activeMembers,
      tierCounts,
      totalPointsIssued,
      totalPointsRedeemed,
      totalRewards,
      activeRewards,
      recentTransactions,
      topEarners,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) as count FROM loyalty_accounts"),
      db.query(
        `SELECT COUNT(*) as count FROM loyalty_accounts WHERE updated_at > NOW() - INTERVAL '30 days'`,
      ),
      db.query(
        `SELECT tier, COUNT(*) as count FROM loyalty_accounts GROUP BY tier ORDER BY tier`,
      ),
      db.query(
        `SELECT COALESCE(SUM(points_amount),0) as total FROM loyalty_transactions WHERE transaction_type='earn'`,
      ),
      db.query(
        `SELECT COALESCE(SUM(ABS(points_amount)),0) as total FROM loyalty_transactions WHERE transaction_type='redeem'`,
      ),
      db.query("SELECT COUNT(*) as count FROM loyalty_rewards"),
      db.query(
        "SELECT COUNT(*) as count FROM loyalty_rewards WHERE is_active=true",
      ),
      db.query(
        `SELECT lt.*, u.full_name, u.phone_number FROM loyalty_transactions lt JOIN users u ON lt.user_id=u.id ORDER BY lt.created_at DESC LIMIT 5`,
      ),
      db.query(
        `SELECT la.*, u.full_name, u.phone_number FROM loyalty_accounts la JOIN users u ON la.user_id=u.id ORDER BY la.lifetime_points DESC LIMIT 5`,
      ),
    ]);

    res.json({
      success: true,
      stats: {
        members: {
          total: parseInt(totalMembers.rows[0].count),
          active: parseInt(activeMembers.rows[0].count),
          byTier: tierCounts.rows,
        },
        points: {
          totalIssued: parseInt(totalPointsIssued.rows[0].total),
          totalRedeemed: parseInt(totalPointsRedeemed.rows[0].total),
          outstanding:
            parseInt(totalPointsIssued.rows[0].total) -
            parseInt(totalPointsRedeemed.rows[0].total),
        },
        rewards: {
          total: parseInt(totalRewards.rows[0].count),
          active: parseInt(activeRewards.rows[0].count),
        },
        recentTransactions: recentTransactions.rows,
        topEarners: topEarners.rows,
      },
    });
  } catch (error) {
    console.error("Loyalty stats error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch loyalty stats" });
  }
});

// ── GET /api/admin/loyalty/members ────────────────────────────────────────
router.get("/members", async (req, res) => {
  try {
    const { tier, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (tier) {
      params.push(tier.toLowerCase());
      conditions.push(`la.tier = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(u.full_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(parseInt(limit), parseInt(offset));

    const members = await db.query(
      `SELECT la.*, u.full_name, u.phone_number, u.created_at as user_since,
         (SELECT COUNT(*) FROM loyalty_transactions WHERE user_id=la.user_id AND transaction_type='earn')   as earn_count,
         (SELECT COUNT(*) FROM loyalty_transactions WHERE user_id=la.user_id AND transaction_type='redeem') as redeem_count
       FROM loyalty_accounts la
       JOIN users u ON la.user_id=u.id
       ${where}
       ORDER BY la.lifetime_points DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, params.length - 2);
    const total = await db.query(
      `SELECT COUNT(*) as total FROM loyalty_accounts la JOIN users u ON la.user_id=u.id ${where}`,
      countParams,
    );

    res.json({
      success: true,
      data: {
        members: members.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.rows[0].total),
          pages: Math.ceil(total.rows[0].total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Loyalty members error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch loyalty members" });
  }
});

// ── POST /api/admin/loyalty/members/:userId/adjust ────────────────────────
router.post("/members/:userId/adjust", async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { userId } = req.params;
    const { points, reason, type = "adjustment" } = req.body;

    if (!points || !reason) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ success: false, error: "points and reason are required" });
    }

    const pointsInt = parseInt(points);
    if (isNaN(pointsInt) || pointsInt === 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ success: false, error: "points must be a non-zero integer" });
    }

    const account = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id=$1 FOR UPDATE",
      [userId],
    );
    if (account.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ success: false, error: "Loyalty account not found" });
    }

    if (pointsInt < 0 && account.rows[0].points_balance + pointsInt < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Cannot deduct ${Math.abs(pointsInt)} points — balance is only ${account.rows[0].points_balance}`,
      });
    }

    const transaction = await client.query(
      `INSERT INTO loyalty_transactions (id,user_id,transaction_type,points_amount,description,created_at)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [
        uuidv4(),
        userId,
        pointsInt > 0 ? "earn" : "redeem",
        pointsInt,
        `[Admin ${type}] ${reason}`,
      ],
    );

    if (pointsInt > 0) {
      await client.query(
        `UPDATE loyalty_accounts SET points_balance=points_balance+$1, lifetime_points=lifetime_points+$1, updated_at=NOW() WHERE user_id=$2`,
        [pointsInt, userId],
      );
    } else {
      await client.query(
        `UPDATE loyalty_accounts SET points_balance=points_balance+$1, updated_at=NOW() WHERE user_id=$2`,
        [pointsInt, userId],
      );
    }

    const updated = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id=$1",
      [userId],
    );
    const newTier = calculateTier(updated.rows[0].lifetime_points);
    await client.query("UPDATE loyalty_accounts SET tier=$1 WHERE user_id=$2", [
      newTier.name.toLowerCase(),
      userId,
    ]);

    await client.query("COMMIT");
    res.json({
      success: true,
      message: `${pointsInt > 0 ? "Added" : "Deducted"} ${Math.abs(pointsInt)} points`,
      transaction: transaction.rows[0],
      newBalance: updated.rows[0].points_balance,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Adjust points error:", error);
    res.status(500).json({ success: false, error: "Failed to adjust points" });
  } finally {
    client.release();
  }
});

// ── GET /api/admin/loyalty/rewards ────────────────────────────────────────
router.get("/rewards", async (req, res) => {
  try {
    const { is_active, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (is_active !== undefined && is_active !== "") {
      params.push(is_active === "true");
      conditions.push(`is_active=$${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(parseInt(limit), parseInt(offset));

    const rewards = await db.query(
      `SELECT * FROM loyalty_rewards ${where} ORDER BY points_cost ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const countParams = params.slice(0, params.length - 2);
    const total = await db.query(
      `SELECT COUNT(*) as total FROM loyalty_rewards ${where}`,
      countParams,
    );

    res.json({
      success: true,
      data: {
        rewards: rewards.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.rows[0].total),
          pages: Math.ceil(total.rows[0].total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get rewards error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch rewards" });
  }
});

// ── POST /api/admin/loyalty/rewards ───────────────────────────────────────
router.post("/rewards", async (req, res) => {
  try {
    const {
      title,
      description,
      reward_type,
      value,
      points_cost,
      stock_quantity,
      image_url,
      is_active,
    } = req.body;

    if (!title || !reward_type || !points_cost) {
      return res
        .status(400)
        .json({
          success: false,
          error: "title, reward_type, and points_cost are required",
        });
    }
    const VALID_TYPES = [
      "discount_percentage",
      "discount_fixed",
      "free_shipping",
      "product",
      "voucher",
    ];
    if (!VALID_TYPES.includes(reward_type)) {
      return res
        .status(400)
        .json({
          success: false,
          error: `reward_type must be one of: ${VALID_TYPES.join(", ")}`,
        });
    }

    const reward = await db.query(
      `INSERT INTO loyalty_rewards
         (id,title,description,reward_type,value,points_cost,stock_quantity,image_url,is_active,times_redeemed,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW(),NOW()) RETURNING *`,
      [
        uuidv4(),
        title,
        description || null,
        reward_type,
        value || null,
        parseInt(points_cost),
        stock_quantity ? parseInt(stock_quantity) : null,
        image_url || null,
        is_active !== undefined ? is_active : true,
      ],
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Reward created",
        reward: reward.rows[0],
      });
  } catch (error) {
    console.error("Create reward error:", error);
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to create reward",
        details: error.message,
      });
  }
});

// ── PUT /api/admin/loyalty/rewards/:id ────────────────────────────────────
router.put("/rewards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = Object.keys(updates);
    if (!fields.length)
      return res
        .status(400)
        .json({ success: false, error: "No fields to update" });

    const values = [];
    const setClause = fields
      .map((f, i) => {
        values.push(updates[f]);
        return `${f}=$${i + 1}`;
      })
      .join(", ");
    values.push(id);

    const reward = await db.query(
      `UPDATE loyalty_rewards SET ${setClause}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`,
      values,
    );
    if (!reward.rows.length)
      return res
        .status(404)
        .json({ success: false, error: "Reward not found" });
    res.json({
      success: true,
      message: "Reward updated",
      reward: reward.rows[0],
    });
  } catch (error) {
    console.error("Update reward error:", error);
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to update reward",
        details: error.message,
      });
  }
});

// ── DELETE /api/admin/loyalty/rewards/:id ─────────────────────────────────
router.delete("/rewards/:id", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE loyalty_rewards SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id],
    );
    if (!result.rows.length)
      return res
        .status(404)
        .json({ success: false, error: "Reward not found" });
    res.json({ success: true, message: "Reward deactivated" });
  } catch (error) {
    console.error("Delete reward error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to deactivate reward" });
  }
});

// ── GET /api/admin/loyalty/transactions ───────────────────────────────────
router.get("/transactions", async (req, res) => {
  try {
    const { type, userId, search, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`lt.transaction_type=$${params.length}`);
    }
    if (userId) {
      params.push(userId);
      conditions.push(`lt.user_id=$${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(u.full_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length} OR lt.description ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(parseInt(limit), parseInt(offset));

    const transactions = await db.query(
      `SELECT lt.*, u.full_name, u.phone_number
       FROM loyalty_transactions lt
       JOIN users u ON lt.user_id=u.id
       ${where}
       ORDER BY lt.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const countParams = params.slice(0, params.length - 2);
    const total = await db.query(
      `SELECT COUNT(*) as total FROM loyalty_transactions lt JOIN users u ON lt.user_id=u.id ${where}`,
      countParams,
    );

    res.json({
      success: true,
      data: {
        transactions: transactions.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.rows[0].total),
          pages: Math.ceil(total.rows[0].total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch transactions" });
  }
});

module.exports = router;
