// scripts/add-selected-image-column.js
// Run this script to add the selected_image_url column to your carts table

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log(
      "🚀 Starting migration: Add selected_image_url to carts table...",
    );

    // Start transaction
    await client.query("BEGIN");

    // Add the column if it doesn't exist
    await client.query(`
      ALTER TABLE carts 
      ADD COLUMN IF NOT EXISTS selected_image_url TEXT;
    `);

    console.log('✅ Column "selected_image_url" added successfully');

    // Add comment to document the column
    await client.query(`
      COMMENT ON COLUMN carts.selected_image_url 
      IS 'Stores the image URL that the user selected from the variant modal';
    `);

    console.log("✅ Column comment added");

    // Verify the column was added
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'carts' 
      AND column_name = 'selected_image_url';
    `);

    if (result.rows.length > 0) {
      console.log("✅ Verification successful:");
      console.log("   Column:", result.rows[0].column_name);
      console.log("   Type:", result.rows[0].data_type);
      console.log("   Nullable:", result.rows[0].is_nullable);
    } else {
      throw new Error("Column verification failed");
    }

    // Commit transaction
    await client.query("COMMIT");

    console.log("\n🎉 Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Deploy the updated cartController.js");
    console.log("2. Deploy the updated cartStore.js");
    console.log("3. Deploy the updated ProductVariantModal.jsx");
    console.log("4. Deploy the updated ProductCard.jsx");
  } catch (error) {
    // Rollback on error
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration();
