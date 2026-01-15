require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const createTables = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Creating database schema...\n");

    await client.query("BEGIN");

    // 1. Create sellers table
    console.log("1. Creating sellers table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sellers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        store_name VARCHAR(255) NOT NULL,
        description TEXT,
        rating DECIMAL(3, 2) DEFAULT 0.00,
        total_followers INTEGER DEFAULT 0,
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ sellers table created\n");

    // 2. Create products table
    console.log("2. Creating products table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        original_price DECIMAL(10, 2),
        discount_percentage DECIMAL(5, 2) DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0,
        category VARCHAR(100),
        subcategory VARCHAR(100),
        tags TEXT[],
        images TEXT[],
        rating DECIMAL(3, 2) DEFAULT 0.00,
        total_reviews INTEGER DEFAULT 0,
        total_sales INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ products table created\n");

    // 3. Create product_variants table
    console.log("3. Creating product_variants table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        color VARCHAR(100),
        size VARCHAR(50),
        sku VARCHAR(100) UNIQUE,
        stock_quantity INTEGER DEFAULT 0,
        base_price DECIMAL(10, 2),
        discount_percentage DECIMAL(5, 2) DEFAULT 0,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_product_variant UNIQUE(product_id, color, size)
      );
    `);
    console.log("✅ product_variants table created\n");

    // 4. Create product_attributes table
    console.log("4. Creating product_attributes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_attributes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        attribute_name VARCHAR(255) NOT NULL,
        attribute_value TEXT NOT NULL,
        attribute_group VARCHAR(100),
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ product_attributes table created\n");

    // 5. Create reviews table
    console.log("5. Creating reviews table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        comment TEXT,
        images TEXT[],
        full_name VARCHAR(255),
        helpful_count INTEGER DEFAULT 0,
        verified_purchase BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ reviews table created\n");

    // 6. Create seasonal_sales table
    console.log("6. Creating seasonal_sales table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS seasonal_sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        sale_price DECIMAL(10, 2) NOT NULL,
        banner_color VARCHAR(50),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ seasonal_sales table created\n");

    // 7. Create flash_sales table
    console.log("7. Creating flash_sales table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS flash_sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        sale_price DECIMAL(10, 2) NOT NULL,
        sold_quantity INTEGER DEFAULT 0,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ flash_sales table created\n");

    // Create indexes
    console.log("8. Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
      CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_variants_color ON product_variants(color);
      CREATE INDEX IF NOT EXISTS idx_product_variants_size ON product_variants(size);
      CREATE INDEX IF NOT EXISTS idx_product_attributes_product_id ON product_attributes(product_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
      CREATE INDEX IF NOT EXISTS idx_seasonal_sales_product_id ON seasonal_sales(product_id);
      CREATE INDEX IF NOT EXISTS idx_flash_sales_product_id ON flash_sales(product_id);
    `);
    console.log("✅ Indexes created\n");

    // Create triggers for updated_at
    console.log("9. Creating triggers...");
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const tables = ["sellers", "products", "product_variants", "reviews"];
    for (const table of tables) {
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_update_${table}_updated_at ON ${table};
        CREATE TRIGGER trigger_update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      `);
    }
    console.log("✅ Triggers created\n");

    await client.query("COMMIT");
    console.log("✅ All tables created successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

createTables()
  .then(() => {
    console.log("\n✅ Database schema is ready!");
    console.log("\nNext steps:");
    console.log("  1. Run: node scripts/seed-sellers.js");
    console.log("  2. Run: node scripts/seed-products.js");
    console.log("  3. Run: node scripts/seed-product-variants.js");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration error:", error);
    process.exit(1);
  });
