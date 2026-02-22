// scripts/addReviewHelpfulTable.js
// Run: DATABASE_URL="postgresql://..." node scripts/addReviewHelpfulTable.js
require("dotenv").config();
const { Pool } = require("pg");

const isRailway = process.env.DATABASE_URL?.includes("railway");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRailway ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    const dbInfo = await client.query(
      "SELECT current_database(), inet_server_addr()",
    );
    console.log("🔌 Connected to:", dbInfo.rows[0]);

    // Check if table already exists
    const exists = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'review_helpful'
    `);

    if (exists.rows.length > 0) {
      console.log("✅ Table 'review_helpful' already exists.");
    } else {
      await client.query(`
        CREATE TABLE review_helpful (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
          user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (review_id, user_id)
        )
      `);
      console.log("✅ Table 'review_helpful' created.");

      // Index for fast lookups
      await client.query(`
        CREATE INDEX idx_review_helpful_review_id ON review_helpful(review_id);
        CREATE INDEX idx_review_helpful_user_id   ON review_helpful(user_id);
      `);
      console.log("✅ Indexes created.");
    }

    // Verify
    const verify = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'review_helpful'
      ORDER BY ordinal_position
    `);
    console.log("📋 Table columns:");
    verify.rows.forEach((r) =>
      console.log(`  ${r.column_name} (${r.data_type})`),
    );
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
