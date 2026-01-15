require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const migrate = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Creating product_variants table...\n");

    await client.query("BEGIN");

    // Create product_variants table
    console.log("1. Creating product_variants table...");
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

    // Create indexes
    console.log("2. Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_product_id 
      ON product_variants(product_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_color 
      ON product_variants(color);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_variants_size 
      ON product_variants(size);
    `);
    console.log("✅ Indexes created\n");

    // Create trigger for updated_at
    console.log("3. Creating updated_at trigger...");
    await client.query(`
      CREATE OR REPLACE FUNCTION update_product_variants_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_product_variants_updated_at 
      ON product_variants;
    `);

    await client.query(`
      CREATE TRIGGER trigger_update_product_variants_updated_at
      BEFORE UPDATE ON product_variants
      FOR EACH ROW
      EXECUTE FUNCTION update_product_variants_updated_at();
    `);
    console.log("✅ Trigger created\n");

    await client.query("COMMIT");
    console.log("✅ Migration completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate()
  .then(() => {
    console.log("\n✅ Product variants table is ready!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration error:", error);
    process.exit(1);
  });
