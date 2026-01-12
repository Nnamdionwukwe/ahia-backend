const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

const createTablesSQL = `
-- ========================================
-- SEASONAL SALES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS seasonal_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  season VARCHAR(50) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  banner_color VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- SEASONAL SALE PRODUCTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS seasonal_sale_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seasonal_sale_id UUID REFERENCES seasonal_sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  sale_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(seasonal_sale_id, product_id)
);

-- ========================================
-- FLASH SALES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS flash_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- FLASH SALE PRODUCTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS flash_sale_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_sale_id UUID REFERENCES flash_sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  original_price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2) NOT NULL,
  max_quantity INTEGER NOT NULL,
  sold_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flash_sale_id, product_id)
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_seasonal_sales_active ON seasonal_sales(is_active, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_seasonal_sale_products_product ON seasonal_sale_products(product_id);
CREATE INDEX IF NOT EXISTS idx_flash_sales_status ON flash_sales(status, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_flash_sale_products_product ON flash_sale_products(product_id);

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to get active seasonal sale for a product
CREATE OR REPLACE FUNCTION get_active_seasonal_sale(product_uuid UUID)
RETURNS TABLE (
  sale_name VARCHAR,
  season VARCHAR,
  discount DECIMAL,
  end_time TIMESTAMP,
  time_remaining INTERVAL,
  banner_color VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.name,
    ss.season,
    ss.discount_percentage,
    ss.end_time,
    ss.end_time - NOW() as time_remaining,
    ss.banner_color
  FROM seasonal_sales ss
  JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
  WHERE ssp.product_id = product_uuid
    AND ss.is_active = TRUE
    AND NOW() BETWEEN ss.start_time AND ss.end_time
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get active flash sale for a product
CREATE OR REPLACE FUNCTION get_active_flash_sale(product_uuid UUID)
RETURNS TABLE (
  sale_title VARCHAR,
  flash_sale_id UUID,
  sale_price DECIMAL,
  original_price DECIMAL,
  discount_percentage DECIMAL,
  max_quantity INTEGER,
  sold_quantity INTEGER,
  remaining_quantity INTEGER,
  end_time TIMESTAMP,
  time_remaining INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fs.title,
    fs.id,
    fsp.sale_price,
    fsp.original_price,
    fs.discount_percentage,
    fsp.max_quantity,
    fsp.sold_quantity,
    (fsp.max_quantity - fsp.sold_quantity) as remaining,
    fs.end_time,
    fs.end_time - NOW() as time_remaining
  FROM flash_sales fs
  JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
  WHERE fsp.product_id = product_uuid
    AND fs.status = 'active'
    AND NOW() BETWEEN fs.start_time AND fs.end_time
  ORDER BY fs.end_time ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
`;

async function addProductAttributes() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting to add product attributes...\n");

    // Execute the SQL to create tables and functions
    await client.query(createTablesSQL);
    console.log("✅ Created seasonal_sales table");
    console.log("✅ Created seasonal_sale_products table");
    console.log("✅ Created flash_sales table");
    console.log("✅ Created flash_sale_products table");
    console.log("✅ Created indexes for performance");
    console.log("✅ Created helper functions\n");

    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('seasonal_sales', 'seasonal_sale_products', 'flash_sales', 'flash_sale_products')
      ORDER BY table_name;
    `);

    console.log("📋 Verified tables:");
    tablesResult.rows.forEach((row) => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log("\n🎉 Product attributes tables created successfully!");
    console.log(
      '👉 Next step: Run "node scripts/seedProductsWithAttributes.js" to add sample data\n'
    );
  } catch (error) {
    console.error("❌ Error adding product attributes:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
addProductAttributes();
