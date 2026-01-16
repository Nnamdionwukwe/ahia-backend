require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const fixSchema = async () => {
  const client = await pool.connect();

  try {
    console.log("🔧 Fixing flash_sales schema (FINAL FIX)...\n");

    await client.query("BEGIN");

    // Check current constraints
    console.log("Checking current constraints...");
    const constraints = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'flash_sales'
    `);

    console.log("Current constraints:");
    constraints.rows.forEach((c) => {
      console.log(`  - ${c.constraint_name} (${c.constraint_type})`);
    });

    // Drop the NOT NULL constraint forcefully
    console.log("\nRemoving NOT NULL constraint from product_id...");

    // Method 1: Try direct ALTER
    try {
      await client.query(`
        ALTER TABLE flash_sales 
        ALTER COLUMN product_id DROP NOT NULL;
      `);
      console.log("✅ NOT NULL constraint removed");
    } catch (err) {
      console.log("Direct ALTER failed, trying workaround...");

      // Method 2: Recreate the column without constraint
      await client.query(`
        ALTER TABLE flash_sales 
        ALTER COLUMN product_id TYPE UUID USING product_id;
      `);

      await client.query(`
        ALTER TABLE flash_sales 
        ALTER COLUMN product_id DROP NOT NULL;
      `);
      console.log("✅ NOT NULL constraint removed (workaround)");
    }

    // Verify the change
    const columnInfo = await client.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'flash_sales' AND column_name = 'product_id'
    `);

    console.log("\nColumn info after fix:");
    console.log(
      `  product_id: ${columnInfo.rows[0].data_type}, nullable: ${columnInfo.rows[0].is_nullable}`
    );

    // Ensure flash_sale_products table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'flash_sale_products'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("\nCreating flash_sale_products table...");
      await client.query(`
        CREATE TABLE flash_sale_products (
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
        CREATE INDEX idx_flash_sale_products_flash_sale 
        ON flash_sale_products(flash_sale_id);
      `);

      await client.query(`
        CREATE INDEX idx_flash_sale_products_product 
        ON flash_sale_products(product_id);
      `);

      console.log("✅ flash_sale_products table created");
    } else {
      console.log("\n✅ flash_sale_products table already exists");
    }

    // Update status column from is_active if needed
    const columns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'flash_sales'
    `);

    const existingColumns = columns.rows.map((r) => r.column_name);

    if (
      existingColumns.includes("is_active") &&
      existingColumns.includes("status")
    ) {
      console.log("\nMigrating data from is_active to status...");
      await client.query(`
        UPDATE flash_sales 
        SET status = CASE 
          WHEN is_active = true THEN 'active' 
          ELSE 'scheduled' 
        END
        WHERE status IS NULL;
      `);
      console.log("✅ Status data migrated");
    }

    await client.query("COMMIT");
    console.log("\n✅ Schema fixed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Fix failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

fixSchema()
  .then(() => {
    console.log("\n🎉 All done! Now run: node scripts/seed-sales.js\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
