// scripts/addHideProfileColumn.js
// Run: node scripts/addHideProfileColumn.js
require("dotenv").config();
const { Pool } = require("pg");

const isRailway = process.env.DATABASE_URL?.includes("railway");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction || isRailway ? { rejectUnauthorized: false } : false,
  max: 5,
  connectionTimeoutMillis: 10000,
});

async function migrate() {
  const client = await pool.connect();
  try {
    const dbInfo = await client.query(
      "SELECT current_database(), inet_server_addr()",
    );
    console.log("🔌 Connected to:", dbInfo.rows[0]);

    await client.query(`
      ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS hide_profile BOOLEAN NOT NULL DEFAULT false
    `);
    console.log("✅ Column 'hide_profile' added (or already existed).");

    const verify = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'reviews' AND column_name = 'hide_profile'
    `);
    console.log("📋 Column details:", verify.rows[0]);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log("🔌 Done.");
  }
}

migrate();
