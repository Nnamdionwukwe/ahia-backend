// createMissingTables.js
// Run with: node scripts/createMissingTables.js
// This creates the missing tables from your database inspection

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function createMissingTables() {
  const client = await pool.connect();

  try {
    console.log("\n🔧 Creating Missing Tables...\n");

    // Start transaction
    await client.query("BEGIN");

    // 1. Create categories table (if you want a dedicated categories table)
    console.log("1️⃣ Creating categories table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        slug VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        image_url VARCHAR(500),
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
    `);
    console.log("   ✅ categories table created\n");

    // 2. Create cart_items table (to go with your existing carts table)
    console.log("2️⃣ Creating cart_items table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        price NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_cart_variant UNIQUE(cart_id, product_variant_id),
        CONSTRAINT positive_quantity CHECK (quantity > 0)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
      CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON cart_items(product_variant_id);
    `);
    console.log("   ✅ cart_items table created\n");

    // 3. Create addresses table
    console.log("3️⃣ Creating addresses table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        address_type VARCHAR(50) DEFAULT 'shipping',
        full_name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        street_address TEXT NOT NULL,
        apartment VARCHAR(100),
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'Nigeria',
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
      CREATE INDEX IF NOT EXISTS idx_addresses_default ON addresses(user_id, is_default);
    `);
    console.log("   ✅ addresses table created\n");

    // 4. Create payments table
    console.log("4️⃣ Creating payments table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'NGN',
        payment_method VARCHAR(50) NOT NULL,
        payment_provider VARCHAR(50),
        transaction_id VARCHAR(255) UNIQUE,
        reference VARCHAR(255) UNIQUE,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
    `);
    console.log("   ✅ payments table created\n");

    // 5. Create triggers for updated_at
    console.log("5️⃣ Creating triggers...");

    // Function to update updated_at timestamp
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for each new table
    const tablesWithUpdatedAt = [
      "categories",
      "cart_items",
      "addresses",
      "payments",
    ];

    for (const table of tablesWithUpdatedAt) {
      await client.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `);
      console.log(`   ✅ Trigger created for ${table}`);
    }
    console.log("");

    // 6. Insert some default categories based on your existing product categories
    console.log("6️⃣ Inserting default categories...");
    await client.query(`
      INSERT INTO categories (name, slug, description, display_order)
      VALUES 
        ('Electronics', 'electronics', 'Electronic devices and gadgets', 1),
        ('Fashion', 'fashion', 'Clothing, accessories, and fashion items', 2),
        ('Home & Kitchen', 'home-kitchen', 'Home appliances and kitchen items', 3),
        ('Sports', 'sports', 'Sports equipment and fitness gear', 4),
        ('Beauty', 'beauty', 'Beauty and personal care products', 5),
        ('Books', 'books', 'Books and reading materials', 6),
        ('Toys', 'toys', 'Toys and games', 7)
      ON CONFLICT (slug) DO NOTHING
    `);
    console.log("   ✅ Default categories inserted\n");

    // Commit transaction
    await client.query("COMMIT");

    // 7. Verify tables were created
    console.log("7️⃣ Verifying new tables...");
    const verification = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
        AND table_name IN ('categories', 'cart_items', 'addresses', 'payments')
      ORDER BY table_name
    `);

    console.log("\n✅ Tables Created:\n");
    verification.rows.forEach((table) => {
      console.log(`   • ${table.table_name} (${table.column_count} columns)`);
    });

    // 8. Show table counts
    console.log("\n8️⃣ Table Record Counts:\n");

    const counts = await Promise.all([
      client.query("SELECT COUNT(*) as count FROM categories"),
      client.query("SELECT COUNT(*) as count FROM cart_items"),
      client.query("SELECT COUNT(*) as count FROM addresses"),
      client.query("SELECT COUNT(*) as count FROM payments"),
    ]);

    console.log(`   Categories: ${counts[0].rows[0].count}`);
    console.log(`   Cart Items: ${counts[1].rows[0].count}`);
    console.log(`   Addresses: ${counts[2].rows[0].count}`);
    console.log(`   Payments: ${counts[3].rows[0].count}`);

    console.log("\n✅ All missing tables created successfully!\n");
    console.log("📝 Summary:");
    console.log("   - categories: For organizing products");
    console.log("   - cart_items: Items in shopping carts");
    console.log("   - addresses: User delivery addresses");
    console.log("   - payments: Payment transaction records\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error creating tables:", error.message);
    console.error("\nFull error:", error);

    if (error.code === "42P07") {
      console.log("\n⚠️  Some tables already exist - this is fine!");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
console.log("Starting table creation...\n");
createMissingTables().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
