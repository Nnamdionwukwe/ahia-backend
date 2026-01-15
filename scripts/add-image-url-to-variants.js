require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const addImageUrlColumn = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Adding image_url column to product_variants...\n");

    await client.query("BEGIN");

    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'product_variants' 
      AND column_name = 'image_url';
    `);

    if (columnCheck.rows.length > 0) {
      console.log("✅ image_url column already exists");
    } else {
      // Add image_url column
      console.log("Adding image_url column...");
      await client.query(`
        ALTER TABLE product_variants 
        ADD COLUMN image_url TEXT;
      `);
      console.log("✅ image_url column added");
    }

    // Check if base_price column exists
    const basePriceCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'product_variants' 
      AND column_name = 'base_price';
    `);

    if (basePriceCheck.rows.length === 0) {
      console.log("\nAdding base_price column...");
      await client.query(`
        ALTER TABLE product_variants 
        ADD COLUMN base_price DECIMAL(10, 2);
      `);
      console.log("✅ base_price column added");
    }

    // Check if discount_percentage column exists
    const discountCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'product_variants' 
      AND column_name = 'discount_percentage';
    `);

    if (discountCheck.rows.length === 0) {
      console.log("\nAdding discount_percentage column...");
      await client.query(`
        ALTER TABLE product_variants 
        ADD COLUMN discount_percentage DECIMAL(5, 2) DEFAULT 0;
      `);
      console.log("✅ discount_percentage column added");
    }

    // Update base_price from products table for existing variants
    console.log("\nUpdating variant prices from products...");
    const updateResult = await client.query(`
      UPDATE product_variants pv
      SET base_price = p.price
      FROM products p
      WHERE pv.product_id = p.id 
      AND pv.base_price IS NULL;
    `);
    console.log(`✅ Updated ${updateResult.rowCount} variant prices`);

    // Assign product images to variants
    console.log("\nAssigning images to variants...");
    const imageResult = await client.query(`
      WITH color_image_mapping AS (
        SELECT 
          pv.id,
          pv.color,
          p.images,
          ROW_NUMBER() OVER (PARTITION BY pv.product_id ORDER BY pv.color) as color_rank,
          array_length(p.images, 1) as image_count
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE p.images IS NOT NULL 
          AND array_length(p.images, 1) > 0
          AND pv.image_url IS NULL
      )
      UPDATE product_variants pv
      SET image_url = cim.images[((cim.color_rank - 1) % cim.image_count) + 1]
      FROM color_image_mapping cim
      WHERE pv.id = cim.id;
    `);
    console.log(`✅ Assigned images to ${imageResult.rowCount} variants`);

    await client.query("COMMIT");
    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

addImageUrlColumn()
  .then(() => {
    console.log("\n✅ Product variants are ready!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration error:", error);
    process.exit(1);
  });
