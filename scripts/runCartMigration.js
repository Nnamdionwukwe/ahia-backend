// migrations/runCartMigration.js
const { Pool } = require("pg");
require("dotenv").config();

// Database configuration - supports both DATABASE_URL and individual params
const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.POSTGRES_DB || process.env.DB_NAME || "ahia_db",
    user: process.env.POSTGRES_USER || process.env.DB_USER || "postgres",
    password:
      process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || "password",
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  };
};

const pool = new Pool(getDatabaseConfig());

const cartMigration = `
-- Cart Items Table
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_selected BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id, product_variant_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON cart_items(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_selected ON cart_items(user_id, is_selected);

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS cart_items_updated_at ON cart_items;
DROP FUNCTION IF EXISTS update_cart_items_updated_at();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cart_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cart_items_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION update_cart_items_updated_at();
`;

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting cart database migration...");
    console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(
      `🗄️  Database: ${
        process.env.DATABASE_URL ? "Railway PostgreSQL" : "Local PostgreSQL"
      }\n`
    );

    // Test connection
    const connectionTest = await client.query("SELECT NOW()");
    console.log(
      `✅ Database connected successfully at ${connectionTest.rows[0].now}\n`
    );

    // Start transaction
    await client.query("BEGIN");

    // Check if required tables exist
    const requiredTables = ["users", "products"];
    for (const table of requiredTables) {
      const tableExists = await client.query(
        `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `,
        [table]
      );

      if (!tableExists.rows[0].exists) {
        throw new Error(
          `❌ Required table '${table}' does not exist. Please run base migrations first.`
        );
      }
    }
    console.log("✅ All required tables exist (users, products)\n");

    // Check if cart_items table already exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cart_items'
      );
    `);

    if (tableExists.rows[0].exists) {
      console.log("⚠️  cart_items table already exists.");
      console.log("   Updating table structure if needed...\n");
    } else {
      console.log("✨ Creating cart_items table...\n");
    }

    // Run migration
    await client.query(cartMigration);

    // Verify table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'cart_items'
      ORDER BY ordinal_position;
    `);

    console.log("✅ Cart items table structure:");
    console.log(
      "┌─────────────────────┬──────────────┬──────────┬─────────────────────┐"
    );
    console.log(
      "│ Column              │ Type         │ Nullable │ Default             │"
    );
    console.log(
      "├─────────────────────┼──────────────┼──────────┼─────────────────────┤"
    );

    columns.rows.forEach((col) => {
      const colName = col.column_name.padEnd(19);
      const dataType = col.data_type.padEnd(12);
      const nullable = col.is_nullable.padEnd(8);
      const def = (col.column_default || "").substring(0, 19).padEnd(19);
      console.log(`│ ${colName} │ ${dataType} │ ${nullable} │ ${def} │`);
    });
    console.log(
      "└─────────────────────┴──────────────┴──────────┴─────────────────────┘\n"
    );

    // Verify constraints
    const constraints = await client.query(`
      SELECT 
        con.conname as constraint_name,
        con.contype as constraint_type,
        CASE con.contype
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'p' THEN 'PRIMARY KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'c' THEN 'CHECK'
          ELSE con.contype::text
        END as type_description
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'cart_items'
      ORDER BY con.contype, con.conname;
    `);

    console.log("✅ Constraints:");
    constraints.rows.forEach((con) => {
      console.log(`   - ${con.constraint_name} (${con.type_description})`);
    });
    console.log("");

    // Verify indexes
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'cart_items'
      ORDER BY indexname;
    `);

    console.log("✅ Indexes created:");
    indexes.rows.forEach((idx) => {
      console.log(`   - ${idx.indexname}`);
    });
    console.log("");

    // Verify triggers
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'cart_items';
    `);

    console.log("✅ Triggers created:");
    triggers.rows.forEach((trig) => {
      console.log(`   - ${trig.trigger_name} (${trig.event_manipulation})`);
    });
    console.log("");

    // Get row count
    const countResult = await client.query("SELECT COUNT(*) FROM cart_items");
    console.log(`📊 Current cart items count: ${countResult.rows[0].count}\n`);

    // Commit transaction
    await client.query("COMMIT");

    console.log("🎉 Cart migration completed successfully!\n");

    // Show example queries
    console.log("📝 Example queries you can run:");
    console.log("   - SELECT * FROM cart_items WHERE user_id = 1;");
    console.log(
      "   - SELECT COUNT(*) as items, SUM(quantity) as total_qty FROM cart_items;"
    );
    console.log("   - SELECT * FROM cart_items WHERE is_selected = true;");
    console.log(
      "   - SELECT ci.*, p.name, p.price FROM cart_items ci JOIN products p ON ci.product_id = p.id;\n"
    );

    // Show API endpoints
    console.log("🔌 Available API endpoints after this migration:");
    console.log("   GET    /api/cart              - Get user cart");
    console.log("   POST   /api/cart/add          - Add item to cart");
    console.log("   PUT    /api/cart/:id/quantity - Update quantity");
    console.log("   PUT    /api/cart/:id/select   - Toggle selection");
    console.log("   PUT    /api/cart/select-all   - Select/deselect all");
    console.log("   DELETE /api/cart/:id          - Remove item");
    console.log("   DELETE /api/cart/selected     - Remove selected items\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error.message);

    if (error.code === "ECONNREFUSED") {
      console.error("\n💡 Connection refused. Please check:");
      console.error("   - Database is running");
      console.error("   - DATABASE_URL is correct");
      console.error("   - Network connectivity");
    } else if (error.code === "42P01") {
      console.error("\n💡 Table not found. Please ensure:");
      console.error("   - Base migrations have been run");
      console.error("   - users and products tables exist");
    } else if (error.code === "23503") {
      console.error("\n💡 Foreign key constraint error. Please ensure:");
      console.error(
        "   - Referenced tables (users, products, product_variants) exist"
      );
    }

    console.error("\nFull error details:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration with error handling
console.log(
  "╔═══════════════════════════════════════════════════════════════╗"
);
console.log(
  "║         CART DATABASE MIGRATION - AHIA E-COMMERCE             ║"
);
console.log(
  "╚═══════════════════════════════════════════════════════════════╝\n"
);

runMigration()
  .then(() => {
    console.log("✨ Migration script finished successfully.");
    console.log("🚀 Your cart system is ready to use!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("💥 Unhandled promise rejection:", error);
  process.exit(1);
});

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\n⚠️  Migration interrupted by user");
  await pool.end();
  process.exit(130);
});
