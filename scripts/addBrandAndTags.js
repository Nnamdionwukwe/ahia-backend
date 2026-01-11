// scripts/addBrandAndTags.js
require("dotenv").config();
const db = require("../src/config/database");

async function addBrandAndTags() {
  try {
    console.log("🔧 Adding brand and tags columns to products table...");

    // Add brand column
    await db.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
    `);
    console.log("✅ Added brand column");

    // Add tags column (array of text)
    await db.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS tags TEXT[];
    `);
    console.log("✅ Added tags column");

    // Create index on tags for better search performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_products_tags 
      ON products USING GIN (tags);
    `);
    console.log("✅ Created index on tags");

    console.log("\n🎉 Database schema updated successfully!");

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

addBrandAndTags();
