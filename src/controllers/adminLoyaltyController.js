// src/controllers/adminLoyaltyController.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

// ── Tier helper (mirrors loyaltyController) ───────────────────────────────
const TIERS = {
  bronze: { minPoints: 0, multiplier: 1, name: "Bronze" },
  silver: { minPoints: 1000, multiplier: 1.25, name: "Silver" },
  gold: { minPoints: 5000, multiplier: 1.5, name: "Gold" },
  platinum: { minPoints: 15000, multiplier: 2, name: "Platinum" },
};

function calculateTier(lifetimePoints) {
  if (lifetimePoints >= TIERS.platinum.minPoints) return TIERS.platinum;
  if (lifetimePoints >= TIERS.gold.minPoints) return TIERS.gold;
  if (lifetimePoints >= TIERS.silver.minPoints) return TIERS.silver;
  return TIERS.bronze;
}

// ── GET /api/admin/loyalty/stats ──────────────────────────────────────────
exports.getLoyaltyStats = async (req, res) => {
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
        `SELECT COUNT(*) as count FROM loyalty_accounts
         WHERE updated_at > NOW() - INTERVAL '30 days'`,
      ),
      db.query(
        `SELECT tier, COUNT(*) as count
         FROM loyalty_accounts GROUP BY tier ORDER BY tier`,
      ),
      db.query(
        `SELECT COALESCE(SUM(points_amount), 0) as total
         FROM loyalty_transactions WHERE transaction_type = 'earn'`,
      ),
      db.query(
        `SELECT COALESCE(SUM(ABS(points_amount)), 0) as total
         FROM loyalty_transactions WHERE transaction_type = 'redeem'`,
      ),
      db.query("SELECT COUNT(*) as count FROM loyalty_rewards"),
      db.query(
        "SELECT COUNT(*) as count FROM loyalty_rewards WHERE is_active = true",
      ),
      db.query(
        `SELECT lt.*, u.full_name, u.email
         FROM loyalty_transactions lt
         JOIN users u ON lt.user_id = u.id
         ORDER BY lt.created_at DESC LIMIT 5`,
      ),
      db.query(
        `SELECT la.*, u.full_name, u.email
         FROM loyalty_accounts la
         JOIN users u ON la.user_id = u.id
         ORDER BY la.lifetime_points DESC LIMIT 5`,
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
    console.error("Get loyalty stats error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch loyalty stats" });
  }
};

// ── GET /api/admin/loyalty/members ────────────────────────────────────────
exports.getLoyaltyMembers = async (req, res) => {
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
        `(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(parseInt(limit), parseInt(offset));
    const members = await db.query(
      `SELECT
         la.*,
         u.full_name, u.email, u.created_at as user_since,
         (SELECT COUNT(*) FROM loyalty_transactions lt
          WHERE lt.user_id = la.user_id AND lt.transaction_type = 'earn') as earn_count,
         (SELECT COUNT(*) FROM loyalty_transactions lt
          WHERE lt.user_id = la.user_id AND lt.transaction_type = 'redeem') as redeem_count
       FROM loyalty_accounts la
       JOIN users u ON la.user_id = u.id
       ${where}
       ORDER BY la.lifetime_points DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, params.length - 2);
    const total = await db.query(
      `SELECT COUNT(*) as total
       FROM loyalty_accounts la
       JOIN users u ON la.user_id = u.id
       ${where}`,
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
    console.error("Get loyalty members error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch loyalty members" });
  }
};

// ── POST /api/admin/loyalty/members/:userId/adjust ────────────────────────
exports.adjustMemberPoints = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const { userId } = req.params;
    const { points, reason, type = "adjustment" } = req.body;
    // type: 'adjustment' | 'bonus' | 'deduction'

    if (!points || !reason) {
      return res.status(400).json({
        success: false,
        error: "points and reason are required",
      });
    }

    const pointsInt = parseInt(points);
    if (isNaN(pointsInt) || pointsInt === 0) {
      return res.status(400).json({
        success: false,
        error: "points must be a non-zero integer",
      });
    }

    // Get or verify account exists
    const account = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id = $1 FOR UPDATE",
      [userId],
    );

    if (account.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ success: false, error: "Loyalty account not found" });
    }

    const acct = account.rows[0];

    // Prevent balance going negative
    if (pointsInt < 0 && acct.points_balance + pointsInt < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: `Cannot deduct ${Math.abs(pointsInt)} points — balance is only ${acct.points_balance}`,
      });
    }

    // Record transaction
    const transaction = await client.query(
      `INSERT INTO loyalty_transactions
       (id, user_id, transaction_type, points_amount, description, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        uuidv4(),
        userId,
        pointsInt > 0 ? "earn" : "redeem",
        pointsInt,
        `[Admin ${type}] ${reason}`,
      ],
    );

    // Update account balance (and lifetime if adding)
    if (pointsInt > 0) {
      await client.query(
        `UPDATE loyalty_accounts
         SET points_balance  = points_balance + $1,
             lifetime_points = lifetime_points + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [pointsInt, userId],
      );
    } else {
      await client.query(
        `UPDATE loyalty_accounts
         SET points_balance = points_balance + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [pointsInt, userId],
      );
    }

    // Recalculate tier
    const updated = await client.query(
      "SELECT * FROM loyalty_accounts WHERE user_id = $1",
      [userId],
    );
    const newTier = calculateTier(updated.rows[0].lifetime_points);
    await client.query(
      "UPDATE loyalty_accounts SET tier = $1 WHERE user_id = $2",
      [newTier.name.toLowerCase(), userId],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `${pointsInt > 0 ? "Added" : "Deducted"} ${Math.abs(pointsInt)} points`,
      transaction: transaction.rows[0],
      newBalance: updated.rows[0].points_balance + pointsInt,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Adjust member points error:", error);
    res.status(500).json({ success: false, error: "Failed to adjust points" });
  } finally {
    client.release();
  }
};

// ── GET /api/admin/loyalty/rewards ────────────────────────────────────────
exports.getAllRewards = async (req, res) => {
  try {
    const { is_active, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const params = [];
    const conditions = [];

    if (is_active !== undefined && is_active !== "") {
      params.push(is_active === "true");
      conditions.push(`is_active = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(parseInt(limit), parseInt(offset));
    const rewards = await db.query(
      `SELECT * FROM loyalty_rewards
       ${where}
       ORDER BY points_cost ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
    console.error("Get all rewards error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch rewards" });
  }
};

// ── POST /api/admin/loyalty/rewards ───────────────────────────────────────
exports.createReward = async (req, res) => {
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
      return res.status(400).json({
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
      return res.status(400).json({
        success: false,
        error: `reward_type must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }

    const reward = await db.query(
      `INSERT INTO loyalty_rewards
       (id, title, description, reward_type, value, points_cost,
        stock_quantity, image_url, is_active, times_redeemed, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, 0, NOW(), NOW())
       RETURNING *`,
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

    res.status(201).json({
      success: true,
      message: "Reward created successfully",
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
};

// ── PUT /api/admin/loyalty/rewards/:id ────────────────────────────────────
exports.updateReward = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No fields to update" });
    }

    const values = [];
    const setClause = fields
      .map((field, index) => {
        values.push(updates[field]);
        return `${field} = $${index + 1}`;
      })
      .join(", ");

    values.push(id);

    const reward = await db.query(
      `UPDATE loyalty_rewards
       SET ${setClause}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    if (reward.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Reward not found" });
    }

    res.json({
      success: true,
      message: "Reward updated successfully",
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
};

// ── DELETE /api/admin/loyalty/rewards/:id ─────────────────────────────────
exports.deleteReward = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete — just deactivate so existing redemptions aren't orphaned
    const result = await db.query(
      `UPDATE loyalty_rewards
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Reward not found" });
    }

    res.json({ success: true, message: "Reward deactivated successfully" });
  } catch (error) {
    console.error("Delete reward error:", error);
    res.status(500).json({ success: false, error: "Failed to delete reward" });
  }
};

// ── GET /api/admin/loyalty/transactions ───────────────────────────────────
exports.getAllTransactions = async (req, res) => {
  try {
    const { type, userId, search, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;

    const params = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`lt.transaction_type = $${params.length}`);
    }

    if (userId) {
      params.push(userId);
      conditions.push(`lt.user_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR lt.description ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(parseInt(limit), parseInt(offset));
    const transactions = await db.query(
      `SELECT lt.*, u.full_name, u.email
       FROM loyalty_transactions lt
       JOIN users u ON lt.user_id = u.id
       ${where}
       ORDER BY lt.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, params.length - 2);
    const total = await db.query(
      `SELECT COUNT(*) as total
       FROM loyalty_transactions lt
       JOIN users u ON lt.user_id = u.id
       ${where}`,
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
    console.error("Get all transactions error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch transactions" });
  }
};

module.exports = exports;
