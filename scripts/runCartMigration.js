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
-- Check if carts table exists, if not create cart_items
DO $$ 
BEGIN
  -- If carts table exists, use it, otherwise create cart_items
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'carts') THEN
    -- Create cart_items table (fallback)
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
  ELSE
    -- Ensure carts table has all necessary columns
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'product_id') THEN
      ALTER TABLE carts ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'is_selected') THEN
      ALTER TABLE carts ADD COLUMN is_selected BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'carts' AND column_name = 'updated_at') THEN
      ALTER TABLE carts ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
  END IF;
END $$;

-- Create indexes for carts table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'carts') THEN
    CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);
    CREATE INDEX IF NOT EXISTS idx_carts_product_id ON carts(product_id);
    CREATE INDEX IF NOT EXISTS idx_carts_product_variant_id ON carts(product_variant_id);
    CREATE INDEX IF NOT EXISTS idx_carts_selected ON carts(user_id, is_selected);
  ELSE
    -- Create indexes for cart_items
    CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON cart_items(product_variant_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_selected ON cart_items(user_id, is_selected);
  END IF;
END $$;

-- Create or update trigger for carts table
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'carts') THEN
    -- Drop existing trigger if exists
    DROP TRIGGER IF EXISTS carts_updated_at ON carts;
    DROP FUNCTION IF EXISTS update_carts_updated_at();
    
    -- Create trigger function
    CREATE OR REPLACE FUNCTION update_carts_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
    
    -- Create trigger
    CREATE TRIGGER carts_updated_at
    BEFORE UPDATE ON carts
    FOR EACH ROW
    EXECUTE FUNCTION update_carts_updated_at();
  ELSE
    -- Create trigger for cart_items
    DROP TRIGGER IF EXISTS cart_items_updated_at ON cart_items;
    DROP FUNCTION IF EXISTS update_cart_items_updated_at();
    
    CREATE OR REPLACE FUNCTION update_cart_items_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
    
    CREATE TRIGGER cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cart_items_updated_at();
  END IF;
END $$;
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

    // Check which cart table exists
    const cartsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'carts'
      );
    `);

    const cartItemsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cart_items'
      );
    `);

    const tableName = cartsTableExists.rows[0].exists ? "carts" : "cart_items";

    if (cartsTableExists.rows[0].exists) {
      console.log('✅ Found existing "carts" table (UUID-based)');
      console.log("   Will add missing columns and indexes...\n");
    } else if (cartItemsTableExists.rows[0].exists) {
      console.log('✅ Found existing "cart_items" table');
      console.log("   Will update structure if needed...\n");
    } else {
      console.log('✨ Creating new "cart_items" table...\n');
    }

    // Run migration
    await client.query(cartMigration);

    // Verify table structure
    const columns = await client.query(
      `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `,
      [tableName]
    );

    console.log(`✅ ${tableName} table structure:`);
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
    const constraints = await client.query(
      `
      SELECT 
        con.conname as constraint_name,
        CASE con.contype
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'p' THEN 'PRIMARY KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'c' THEN 'CHECK'
          ELSE con.contype::text
        END as type_description
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = $1
      ORDER BY con.contype, con.conname;
    `,
      [tableName]
    );

    console.log("✅ Constraints:");
    if (constraints.rows.length > 0) {
      constraints.rows.forEach((con) => {
        console.log(`   - ${con.constraint_name} (${con.type_description})`);
      });
    } else {
      console.log("   - No constraints found");
    }
    console.log("");

    // Verify indexes
    const indexes = await client.query(
      `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = $1
      ORDER BY indexname;
    `,
      [tableName]
    );

    console.log("✅ Indexes created:");
    indexes.rows.forEach((idx) => {
      console.log(`   - ${idx.indexname}`);
    });
    console.log("");

    // Verify triggers
    const triggers = await client.query(
      `
      SELECT trigger_name, event_manipulation
      FROM information_schema.triggers
      WHERE event_object_table = $1;
    `,
      [tableName]
    );

    console.log("✅ Triggers:");
    if (triggers.rows.length > 0) {
      triggers.rows.forEach((trig) => {
        console.log(`   - ${trig.trigger_name} (${trig.event_manipulation})`);
      });
    } else {
      console.log("   - No triggers found");
    }
    console.log("");

    // Get row count
    const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
    console.log(`📊 Current cart entries: ${countResult.rows[0].count}\n`);

    // Show sample data if exists
    if (parseInt(countResult.rows[0].count) > 0) {
      const sampleData = await client.query(
        `SELECT * FROM ${tableName} LIMIT 3`
      );
      console.log("📝 Sample cart data:");
      console.log(JSON.stringify(sampleData.rows, null, 2));
      console.log("");
    }

    // Commit transaction
    await client.query("COMMIT");

    console.log("🎉 Cart migration completed successfully!\n");

    // Show example queries based on table structure
    console.log("📝 Example queries you can run:");
    if (tableName === "carts") {
      console.log(`   - SELECT * FROM carts WHERE user_id = '<uuid>';`);
      console.log(
        `   - SELECT COUNT(*) as items, SUM(quantity) as total_qty FROM carts;`
      );
      console.log(`   - SELECT * FROM carts WHERE is_selected = true;`);
      console.log(
        `   - SELECT c.*, p.name FROM carts c JOIN products p ON c.product_id = p.id;`
      );
    } else {
      console.log("   - SELECT * FROM cart_items WHERE user_id = 1;");
      console.log(
        "   - SELECT COUNT(*) as items, SUM(quantity) as total_qty FROM cart_items;"
      );
      console.log("   - SELECT * FROM cart_items WHERE is_selected = true;");
      console.log(
        "   - SELECT ci.*, p.name FROM cart_items ci JOIN products p ON ci.product_id = p.id;"
      );
    }
    console.log("");

    // Show API endpoints
    console.log("🔌 Available API endpoints:");
    console.log("   GET    /api/cart              - Get user cart");
    console.log("   POST   /api/cart/add          - Add item to cart");
    console.log("   PUT    /api/cart/:id/quantity - Update quantity");
    console.log("   PUT    /api/cart/:id/select   - Toggle selection");
    console.log("   PUT    /api/cart/select-all   - Select/deselect all");
    console.log("   DELETE /api/cart/:id          - Remove item");
    console.log("   DELETE /api/cart/selected     - Remove selected items\n");

    console.log(`💡 Note: Your table is named "${tableName}"`);
    console.log("   Make sure your controller uses this table name!\n");
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
      console.error("   - Referenced tables exist");
    } else if (error.code === "42703") {
      console.error("\n💡 Column does not exist error.");
      console.error("   This migration will add missing columns.");
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
