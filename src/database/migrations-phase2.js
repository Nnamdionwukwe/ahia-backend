// src/database/migrations-phase2.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createPhase2Tables = async () => {
  try {
    console.log("Starting Phase 2 migrations...");

    // Orders table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                total_amount DECIMAL(10, 2) NOT NULL,
                discount_amount DECIMAL(10, 2) DEFAULT 0,
                delivery_address TEXT,
                status VARCHAR DEFAULT 'pending',
                payment_method VARCHAR,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                estimated_delivery DATE
            )
        `);
    console.log("✓ Orders table created");

    // Order items table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_variant_id UUID NOT NULL REFERENCES product_variants(id),
                quantity INT NOT NULL,
                unit_price DECIMAL(10, 2) NOT NULL,
                subtotal DECIMAL(10, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Order items table created");

    // Reviews table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
                title VARCHAR,
                comment TEXT,
                images JSONB,
                helpful_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Reviews table created");

    // User browsing history
    await pool.query(`
            CREATE TABLE IF NOT EXISTS user_browsing_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                category VARCHAR,
                last_viewed TIMESTAMP DEFAULT NOW(),
                view_count INT DEFAULT 1,
                UNIQUE(user_id, product_id)
            )
        `);
    console.log("✓ User browsing history table created");

    // Create indexes
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)"
    );
    console.log("✓ Indexes created");

    console.log("✅ Phase 2 migrations completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
};

createPhase2Tables();
