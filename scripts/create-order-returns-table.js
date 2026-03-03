#!/usr/bin/env node
// scripts/create-order-returns-table.js
// Run: node scripts/create-order-returns-table.js

require("dotenv").config();
const { Pool } = require("pg");

const isRailway = process.env.DATABASE_URL?.includes("railway.app");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction || isRailway ? { rejectUnauthorized: false } : false,
  max: 5,
  connectionTimeoutMillis: 10000,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔌 Connected to database");
    console.log("📦 Creating order_returns table and indexes...\n");

    await client.query("BEGIN");

    // ── 1. Create table ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_returns (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason          TEXT NOT NULL,
        details         TEXT,
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        refund_method   VARCHAR(30),
        refund_amount   NUMERIC(12,2),
        admin_note      TEXT,
        resolved_by     UUID REFERENCES users(id),
        resolved_at     TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  ✅ Table  order_returns");

    // ── 2. Indexes ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_returns_order_id
        ON order_returns(order_id);
    `);
    console.log("  ✅ Index  idx_order_returns_order_id");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_returns_user_id
        ON order_returns(user_id);
    `);
    console.log("  ✅ Index  idx_order_returns_user_id");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_returns_status
        ON order_returns(status);
    `);
    console.log("  ✅ Index  idx_order_returns_status");

    // ── 3. updated_at trigger (keeps updated_at fresh on every UPDATE) ────────
    await client.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'trg_order_returns_updated_at'
        ) THEN
          CREATE TRIGGER trg_order_returns_updated_at
          BEFORE UPDATE ON order_returns
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        END IF;
      END;
      $$;
    `);
    console.log("  ✅ Trigger trg_order_returns_updated_at");

    await client.query("COMMIT");

    // ── 4. Verify ─────────────────────────────────────────────────────────────
    const { rows } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'order_returns'
      ORDER BY ordinal_position;
    `);

    console.log("\n📋 order_returns columns:");
    rows.forEach((col) => {
      const nullable = col.is_nullable === "YES" ? "nullable" : "NOT NULL";
      const def = col.column_default ? ` default: ${col.column_default}` : "";
      console.log(
        `   ${col.column_name.padEnd(16)} ${col.data_type.padEnd(20)} ${nullable}${def}`,
      );
    });

    const { rows: indexes } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'order_returns'
      ORDER BY indexname;
    `);

    console.log("\n🗂  Indexes:");
    indexes.forEach((i) => console.log(`   ${i.indexname}`));

    console.log("\n✅ Migration complete — order_returns is ready.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
