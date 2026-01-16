require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const recreateTable = async () => {
  const client = await pool.connect();

  try {
    console.log("🔨 Recreating flash_sales table...\n");

    await client.query("BEGIN");

    // Backup existing data if any
    const backupCheck = await client.query("SELECT COUNT(*) FROM flash_sales");
    const hasData = parseInt(backupCheck.rows[0].count) > 0;

    if (hasData) {
      console.log(
        `⚠️  Found ${backupCheck.rows[0].count} existing flash sales`
      );
      console.log("Creating backup...");

      await client.query(`
        CREATE TABLE flash_sales_backup AS 
        SELECT * FROM flash_sales;
      `);
      console.log("✅ Backup created\n");
    }

    // Drop and recreate
    console.log("Dropping flash_sales table...");
    await client.query("DROP TABLE IF EXISTS flash_sales CASCADE");
    console.log("✅ Dropped\n");

    console.log("Creating new flash_sales table...");
    await client.query(`
      CREATE TABLE flash_sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        sale_price DECIMAL(10, 2),
        sold_quantity INTEGER DEFAULT 0,
        discount_percentage DECIMAL(5, 2),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'scheduled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Table created\n");

    // Create indexes
    console.log("Creating indexes...");
    await client.query(`
      CREATE INDEX idx_flash_sales_product ON flash_sales(product_id);
      CREATE INDEX idx_flash_sales_dates ON flash_sales(start_time, end_time);
      CREATE INDEX idx_flash_sales_status ON flash_sales(status);
    `);
    console.log("✅ Indexes created\n");

    // Create flash_sale_products table
    console.log("Creating flash_sale_products table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS flash_sale_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        flash_sale_id UUID NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        original_price DECIMAL(10, 2) NOT NULL,
        sale_price DECIMAL(10, 2) NOT NULL,
        max_quantity INTEGER DEFAULT 100,
        sold_quantity INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(flash_sale_id, product_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flash_sale_products_flash_sale 
      ON flash_sale_products(flash_sale_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flash_sale_products_product 
      ON flash_sale_products(product_id);
    `);
    console.log("✅ flash_sale_products table created\n");

    await client.query("COMMIT");
    console.log("✅ Flash sales tables recreated successfully!");

    if (hasData) {
      console.log("\n📝 Note: Old data backed up in flash_sales_backup table");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Recreation failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

recreateTable()
  .then(() => {
    console.log("\n🎉 Ready! Now run: node scripts/seed-sales.js\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
