// src/database/migrations-phase3.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createPhase3Tables = async () => {
  try {
    console.log("Starting Phase 3 migrations...");

    // Wishlist table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS wishlist (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, product_id)
            )
        `);
    console.log("✓ Wishlist table created");

    // Create indexes
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON wishlist(product_id)"
    );

    console.log("✓ Indexes created");
    console.log("✅ Phase 3 migrations completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
};

createPhase3Tables();
