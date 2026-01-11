// scripts/addProductAttributes.js
require("dotenv").config();
const db = require("../src/config/database");

async function addProductAttributes() {
  try {
    console.log("🔧 Creating product attributes system...");

    // Create product_attributes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS product_attributes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        attribute_name VARCHAR(100) NOT NULL,
        attribute_value TEXT NOT NULL,
        attribute_group VARCHAR(50), -- e.g., 'specifications', 'features', 'dimensions'
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(product_id, attribute_name)
      );
    `);
    console.log("✅ Created product_attributes table");

    // Create index for faster queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_product_attributes_product_id 
      ON product_attributes(product_id);
    `);
    console.log("✅ Created index on product_attributes");

    console.log("\n🎉 Product attributes system ready!");

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

addProductAttributes();
