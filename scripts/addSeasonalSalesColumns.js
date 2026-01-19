// scripts/addSeasonalSalesColumns.js
require("dotenv").config();
const db = require("../src/config/database");

async function addColumnsToSeasonalSalesProducts() {
  try {
    console.log("🔄 Starting database migration...");

    // Check if columns already exist
    const checkColumns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'seasonal_sale_products'
      AND column_name IN ('original_price', 'max_quantity', 'sold_quantity')
    `);

    if (checkColumns.rows.length > 0) {
      console.log("✅ Some columns already exist:");
      checkColumns.rows.forEach((row) => {
        console.log(`   - ${row.column_name}`);
      });
    }

    // Add original_price column if it doesn't exist
    try {
      await db.query(`
        ALTER TABLE seasonal_sale_products
        ADD COLUMN original_price DECIMAL(12, 2) NOT NULL DEFAULT 0
      `);
      console.log("✅ Added original_price column");
    } catch (error) {
      if (error.code === "42701") {
        // Column already exists
        console.log("⚠️  original_price column already exists");
      } else {
        throw error;
      }
    }

    // Add max_quantity column if it doesn't exist
    try {
      await db.query(`
        ALTER TABLE seasonal_sale_products
        ADD COLUMN max_quantity INTEGER NOT NULL DEFAULT 100
      `);
      console.log("✅ Added max_quantity column");
    } catch (error) {
      if (error.code === "42701") {
        // Column already exists
        console.log("⚠️  max_quantity column already exists");
      } else {
        throw error;
      }
    }

    // Add sold_quantity column if it doesn't exist
    try {
      await db.query(`
        ALTER TABLE seasonal_sale_products
        ADD COLUMN sold_quantity INTEGER NOT NULL DEFAULT 0
      `);
      console.log("✅ Added sold_quantity column");
    } catch (error) {
      if (error.code === "42701") {
        // Column already exists
        console.log("⚠️  sold_quantity column already exists");
      } else {
        throw error;
      }
    }

    // Add sale_price column if it doesn't exist (for completeness)
    try {
      await db.query(`
        ALTER TABLE seasonal_sale_products
        ADD COLUMN sale_price DECIMAL(12, 2) NOT NULL DEFAULT 0
      `);
      console.log("✅ Added sale_price column");
    } catch (error) {
      if (error.code === "42701") {
        // Column already exists
        console.log("⚠️  sale_price column already exists");
      } else {
        throw error;
      }
    }

    // Populate sale_price from products table if empty
    try {
      const updateResult = await db.query(`
        UPDATE seasonal_sale_products ssp
        SET sale_price = COALESCE(p.price, ssp.original_price)
        FROM products p
        WHERE ssp.product_id = p.id
        AND (ssp.sale_price = 0 OR ssp.sale_price IS NULL)
      `);
      console.log(
        `✅ Updated ${updateResult.rowCount} rows with sale_price from products`
      );
    } catch (error) {
      console.warn("⚠️  Could not update sale_price:", error.message);
    }

    // Populate original_price from products table if empty
    try {
      const updateResult = await db.query(`
        UPDATE seasonal_sale_products ssp
        SET original_price = COALESCE(p.original_price, p.price, ssp.original_price)
        FROM products p
        WHERE ssp.product_id = p.id
        AND (ssp.original_price = 0 OR ssp.original_price IS NULL)
      `);
      console.log(
        `✅ Updated ${updateResult.rowCount} rows with original_price from products`
      );
    } catch (error) {
      console.warn("⚠️  Could not update original_price:", error.message);
    }

    // Create index on seasonal_sale_id for better query performance
    try {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_seasonal_sale_products_seasonal_sale_id
        ON seasonal_sale_products(seasonal_sale_id)
      `);
      console.log("✅ Created index on seasonal_sale_id");
    } catch (error) {
      console.warn("⚠️  Index already exists or could not be created");
    }

    // Create index on product_id for better query performance
    try {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_seasonal_sale_products_product_id
        ON seasonal_sale_products(product_id)
      `);
      console.log("✅ Created index on product_id");
    } catch (error) {
      console.warn("⚠️  Index already exists or could not be created");
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📊 Table structure updated:");
    console.log("   - original_price: DECIMAL(12, 2)");
    console.log("   - max_quantity: INTEGER");
    console.log("   - sold_quantity: INTEGER");
    console.log("   - sale_price: DECIMAL(12, 2)");

    // Display current table structure
    const tableInfo = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'seasonal_sale_products'
      ORDER BY ordinal_position
    `);

    console.log("\n📋 Current seasonal_sale_products table structure:");
    tableInfo.rows.forEach((col) => {
      const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
      const defaultVal = col.column_default
        ? ` DEFAULT ${col.column_default}`
        : "";
      console.log(
        `   ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`
      );
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the migration
addColumnsToSeasonalSalesProducts();
