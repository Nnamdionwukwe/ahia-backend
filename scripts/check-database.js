require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const checkDatabase = async () => {
  try {
    console.log("🔍 Checking database schema...\n");

    // Check if users table exists
    const usersCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `);

    console.log("Core tables:");
    console.log(`  ${usersCheck.rows[0].exists ? "✅" : "❌"} users`);

    // Get all existing tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    if (tables.rows.length > 0) {
      console.log("\nExisting tables:");
      tables.rows.forEach((row) => {
        console.log(`  • ${row.table_name}`);
      });
    } else {
      console.log("\n❌ No tables found in the database!");
    }

    console.log("\n✅ Database check complete!");
  } catch (error) {
    console.error("❌ Check failed:", error);
  } finally {
    await pool.end();
  }
};

checkDatabase();
