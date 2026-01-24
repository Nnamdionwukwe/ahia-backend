// scripts/add-sold-count-column.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function addSoldCountColumn() {
  const client = await pool.connect();

  try {
    console.log(
      "🔄 Starting migration: Adding sold_count column to products table..."
    );

    // Check if column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' 
      AND column_name = 'sold_count'
    `);

    if (checkColumn.rows.length > 0) {
      console.log("ℹ️  Column sold_count already exists. Skipping...");
      return;
    }

    // Add the column
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN sold_count INTEGER DEFAULT 0 NOT NULL
    `);

    console.log("✅ Successfully added sold_count column to products table");

    // Optional: Initialize sold_count based on existing order data if you have an orders table
    // Uncomment this section if you have order_items table
    /*
    console.log('🔄 Calculating initial sold_count from existing orders...');
    
    await client.query(`
      UPDATE products p
      SET sold_count = COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        WHERE oi.product_id = p.id
      ), 0)
    `);
    
    console.log('✅ Initialized sold_count based on existing orders');
    */

    // Show some stats
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(sold_count) as total_sales,
        AVG(sold_count) as avg_sales_per_product
      FROM products
    `);

    console.log("\n📊 Products table stats:");
    console.log(`   Total products: ${stats.rows[0].total_products}`);
    console.log(`   Total sales tracked: ${stats.rows[0].total_sales}`);
    console.log(
      `   Average sales per product: ${parseFloat(
        stats.rows[0].avg_sales_per_product
      ).toFixed(2)}`
    );

    console.log("\n✨ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Error during migration:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
addSoldCountColumn()
  .then(() => {
    console.log("\n✅ Script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
