// scripts/migrate.js
// Run: node scripts/migrate.js
// Safely adds any missing columns to your existing Railway DB.
// All operations use IF NOT EXISTS / IF EXISTS — safe to run multiple times.

require("dotenv").config();
const { Pool } = require("pg");

const isRailway = process.env.DATABASE_URL?.includes("railway.app");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction || isRailway ? { rejectUnauthorized: false } : false,
  max: 3,
  connectionTimeoutMillis: 10000,
});

function log(msg) {
  console.log("  \u2713 " + msg);
}
function err(msg) {
  console.error("  \u274c " + msg);
}
function section(t) {
  console.log("\n" + "─".repeat(50) + "\n  " + t + "\n" + "─".repeat(50));
}

// ── List every migration here ─────────────────────────────────────────────────
// Each entry: { table, column, definition }
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS is idempotent — safe to re-run.
const COLUMN_MIGRATIONS = [
  {
    table: "order_returns",
    column: "media",
    def: "JSONB DEFAULT '[]'::jsonb",
    note: "Cloudinary media URLs for return evidence",
  },
  // Add future column migrations below this line:
  // { table: "orders", column: "tracking_number", def: "TEXT", note: "..." },
];

// ── Index migrations ──────────────────────────────────────────────────────────
const INDEX_MIGRATIONS = [
  {
    name: "idx_order_returns_media",
    table: "order_returns",
    sql: "CREATE INDEX IF NOT EXISTS idx_order_returns_media ON order_returns USING gin (media)",
    note: "GIN index for JSONB media queries",
  },
];

async function runMigrations() {
  console.log("\n🔧  Ahia DB Migrations");
  console.log(
    "   DB: " + (process.env.DATABASE_URL || "").replace(/:[^:@]+@/, ":***@"),
  );

  // ── Column migrations ───────────────────────────────────────────────────────
  section("Column migrations");
  for (const m of COLUMN_MIGRATIONS) {
    try {
      await pool.query(
        `ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS ${m.column} ${m.def}`,
      );
      log(`${m.table}.${m.column} — ${m.note}`);
    } catch (e) {
      err(`${m.table}.${m.column} failed: ${e.message}`);
    }
  }

  // ── Index migrations ────────────────────────────────────────────────────────
  section("Index migrations");
  for (const m of INDEX_MIGRATIONS) {
    try {
      await pool.query(m.sql);
      log(`${m.name} — ${m.note}`);
    } catch (e) {
      err(`${m.name} failed: ${e.message}`);
    }
  }

  // ── Verify ──────────────────────────────────────────────────────────────────
  section("Verifying order_returns columns");
  const res = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_returns'
    ORDER BY ordinal_position
  `);
  res.rows.forEach((r) => {
    log(`${r.column_name.padEnd(20)} ${r.data_type}`);
  });

  console.log("\n✅  Migrations complete!\n");
}

runMigrations()
  .catch((e) => {
    console.error("\n❌  Migration failed:", e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
