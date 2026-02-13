// migrate-wishlist-cart.js
// Run this script to create wishlists and carts tables
// Usage: node migrate-wishlist-cart.js

const { Pool } = require("pg");
require("dotenv").config();

// Use the external DATABASE_URL from your .env
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:ioZdfUKsMPIPNjUzekosYYPHnoIFcknp@turntable.proxy.rlwy.net:15164/railway";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Railway
  },
});

const createWishlistsTable = `
-- Create wishlists table
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure a user can only have one entry per product
  UNIQUE(user_id, product_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_created_at ON wishlists(created_at DESC);

-- Add comments
COMMENT ON TABLE wishlists IS 'User wishlist/favorites for products';
COMMENT ON COLUMN wishlists.user_id IS 'Reference to the user who added the item';
COMMENT ON COLUMN wishlists.product_id IS 'Reference to the product in wishlist';
`;

const createCartsTable = `
-- Create carts table if it doesn't exist
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_selected BOOLEAN DEFAULT true,
  selected_image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
`;

const addSelectedImageColumn = `
-- Add selected_image_url column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'carts' AND column_name = 'selected_image_url'
  ) THEN
    ALTER TABLE carts ADD COLUMN selected_image_url TEXT;
    RAISE NOTICE 'Added selected_image_url column to carts table';
  ELSE
    RAISE NOTICE 'selected_image_url column already exists';
  END IF;
END $$;
`;

const createCartsIndexes = `
-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_product_id ON carts(product_id);
CREATE INDEX IF NOT EXISTS idx_carts_product_variant_id ON carts(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_product ON carts(user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_carts_created_at ON carts(created_at DESC);
`;

const createCartsTrigger = `
-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_carts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_carts_updated_at ON carts;
CREATE TRIGGER trigger_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION update_carts_updated_at();
`;

const addCartsComments = `
-- Add comments to carts table
COMMENT ON TABLE carts IS 'User shopping cart items';
COMMENT ON COLUMN carts.user_id IS 'Reference to the user who owns this cart item';
COMMENT ON COLUMN carts.product_id IS 'Reference to the product';
COMMENT ON COLUMN carts.product_variant_id IS 'Optional reference to product variant';
COMMENT ON COLUMN carts.quantity IS 'Quantity of items in cart';
COMMENT ON COLUMN carts.is_selected IS 'Whether item is selected for checkout';
COMMENT ON COLUMN carts.selected_image_url IS 'User manually selected product image URL';
`;

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting database migrations...\n");
    console.log("📊 Database:", DATABASE_URL.split("@")[1].split("/")[0]);

    await client.query("BEGIN");

    // 1. Create wishlists table
    console.log("📦 Creating wishlists table...");
    await client.query(createWishlistsTable);
    console.log("✅ Wishlists table created successfully\n");

    // 2. Create carts table
    console.log("🛒 Creating carts table...");
    await client.query(createCartsTable);
    console.log("✅ Carts table created successfully\n");

    // 3. Add selected_image_url column
    console.log("🖼️  Adding selected_image_url column to carts...");
    await client.query(addSelectedImageColumn);
    console.log("✅ Column check completed\n");

    // 4. Create carts indexes
    console.log("📇 Creating carts indexes...");
    await client.query(createCartsIndexes);
    console.log("✅ Carts indexes created successfully\n");

    // 5. Create carts trigger
    console.log("⚙️  Creating carts update trigger...");
    await client.query(createCartsTrigger);
    console.log("✅ Carts trigger created successfully\n");

    // 6. Add comments
    console.log("💬 Adding table comments...");
    await client.query(addCartsComments);
    console.log("✅ Comments added successfully\n");

    await client.query("COMMIT");

    // Verify tables
    console.log("🔍 Verifying tables...\n");

    const wishlistsCheck = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wishlists'
      ORDER BY ordinal_position
    `);

    const cartsCheck = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'carts'
      ORDER BY ordinal_position
    `);

    console.log("✅ WISHLISTS TABLE STRUCTURE:");
    console.table(wishlistsCheck.rows);

    console.log("\n✅ CARTS TABLE STRUCTURE:");
    console.table(cartsCheck.rows);

    // Count existing records
    const wishlistCount = await client.query("SELECT COUNT(*) FROM wishlists");
    const cartCount = await client.query("SELECT COUNT(*) FROM carts");

    console.log("\n📊 CURRENT DATA:");
    console.log(`   Wishlists: ${wishlistCount.rows[0].count} records`);
    console.log(`   Carts: ${cartCount.rows[0].count} records`);

    console.log("\n✨ All migrations completed successfully!");
    console.log("\n📋 NEXT STEPS:");
    console.log("   1. Update src/controllers/wishlistController.js");
    console.log("   2. Update src/routes/wishlist.js");
    console.log("   3. Restart your server");
    console.log("   4. Test wishlist and cart functionality\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migrations
runMigrations().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
