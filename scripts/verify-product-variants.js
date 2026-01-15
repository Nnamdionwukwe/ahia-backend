require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const verify = async () => {
  try {
    console.log("🔍 Verifying product_variants table...\n");

    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'product_variants'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log("❌ product_variants table does not exist!");
      return;
    }

    console.log("✅ product_variants table exists\n");

    // Check columns
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'product_variants' 
      ORDER BY ordinal_position;
    `);

    console.log("Table columns:");
    columns.rows.forEach((col) => {
      console.log(
        `  • ${col.column_name} (${col.data_type}) ${
          col.is_nullable === "NO" ? "- NOT NULL" : ""
        }`
      );
    });

    // Check data
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_variants,
        COUNT(DISTINCT product_id) as products_with_variants,
        COUNT(DISTINCT color) as unique_colors,
        COUNT(DISTINCT size) as unique_sizes,
        COUNT(image_url) as variants_with_images,
        COUNT(base_price) as variants_with_price,
        ROUND(AVG(base_price), 2) as avg_price,
        ROUND(AVG(discount_percentage), 2) as avg_discount
      FROM product_variants;
    `);

    console.log("\nVariant Statistics:");
    const stat = stats.rows[0];
    console.log(`  Total variants: ${stat.total_variants}`);
    console.log(`  Products with variants: ${stat.products_with_variants}`);
    console.log(`  Unique colors: ${stat.unique_colors}`);
    console.log(`  Unique sizes: ${stat.unique_sizes}`);
    console.log(`  Variants with images: ${stat.variants_with_images}`);
    console.log(`  Variants with price: ${stat.variants_with_price}`);
    console.log(`  Average price: ₦${stat.avg_price}`);
    console.log(`  Average discount: ${stat.avg_discount}%`);

    // Sample variants
    const samples = await pool.query(`
      SELECT 
        pv.color,
        pv.size,
        pv.base_price,
        pv.discount_percentage,
        pv.stock_quantity,
        p.name as product_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LIMIT 5;
    `);

    console.log("\nSample Variants:");
    samples.rows.forEach((v) => {
      console.log(
        `  • ${v.product_name} - ${v.color}${v.size ? ` (Size ${v.size})` : ""}`
      );
      console.log(
        `    Price: ₦${v.base_price}, Discount: ${v.discount_percentage}%, Stock: ${v.stock_quantity}`
      );
    });

    console.log("\n✅ Verification complete!");
  } catch (error) {
    console.error("❌ Verification failed:", error);
  } finally {
    await pool.end();
  }
};

verify();
