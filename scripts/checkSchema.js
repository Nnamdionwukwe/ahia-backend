// scripts/checkSchema.js — check product_variants table so we can write correct JOIN
require("dotenv").config();
const { Pool } = require("pg");

const isRailway = process.env.DATABASE_URL?.includes("railway");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRailway ? { rejectUnauthorized: false } : false,
});

async function check() {
  const client = await pool.connect();
  try {
    const tables = ["product_variants", "products", "reviews"];
    for (const table of tables) {
      const cols = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      console.log(`\n📋 ${table}:`);
      cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
    }
  } finally {
    client.release();
    await pool.end();
  }
}
check();