// scripts/checkOrderItems.js
// Run: DATABASE_URL="postgresql://..." node scripts/checkOrderItems.js
require("dotenv").config();
const { Pool } = require("pg");

const isRailway = process.env.DATABASE_URL?.includes("railway");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction || isRailway ? { rejectUnauthorized: false } : false,
});

async function check() {
  const client = await pool.connect();
  try {
    const dbInfo = await client.query(
      "SELECT current_database(), inet_server_addr()",
    );
    console.log("🔌 Connected to:", dbInfo.rows[0]);

    // Show all columns in order_items
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'order_items'
      ORDER BY ordinal_position
    `);
    console.log("\n📋 order_items columns:");
    cols.rows.forEach((r) =>
      console.log(
        `  ${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`,
      ),
    );

    // Also check orders table for reference
    const orderCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `);
    console.log("\n📋 orders columns:");
    orderCols.rows.forEach((r) =>
      console.log(`  ${r.column_name} (${r.data_type})`),
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

check();
