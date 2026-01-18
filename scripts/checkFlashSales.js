// checkFlashSales.js
// Run this script with: node checkFlashSales.js

const { Pool } = require("pg");

// Database configuration - Update these with your actual credentials
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "your_database_name",
  user: process.env.DB_USER || "your_username",
  password: process.env.DB_PASSWORD || "your_password",
});

async function checkFlashSales() {
  const client = await pool.connect();

  try {
    console.log("\n========================================");
    console.log("🔍 CHECKING FLASH SALES DATA");
    console.log("========================================\n");

    // Query 1: Check active flash sales
    console.log("1️⃣ Active Flash Sales:");
    console.log("------------------------");
    const activeSales = await client.query(`
      SELECT 
        id,
        title,
        description,
        start_time,
        end_time,
        is_active,
        created_at
      FROM flash_sales
      WHERE is_active = true
        AND end_time > NOW()
      ORDER BY created_at DESC
    `);

    if (activeSales.rows.length === 0) {
      console.log("❌ No active flash sales found!\n");
    } else {
      console.log(
        `✅ Found ${activeSales.rows.length} active flash sale(s):\n`
      );
      activeSales.rows.forEach((sale, index) => {
        console.log(`   Sale ${index + 1}:`);
        console.log(`   - ID: ${sale.id}`);
        console.log(`   - Title: ${sale.title}`);
        console.log(`   - Start: ${sale.start_time}`);
        console.log(`   - End: ${sale.end_time}`);
        console.log(`   - Active: ${sale.is_active}`);
        console.log("");
      });
    }

    // Query 2: Check flash sale products
    console.log("2️⃣ Flash Sale Products:");
    console.log("------------------------");
    const flashSaleProducts = await client.query(`
      SELECT 
        fs.id as sale_id,
        fs.title as sale_title,
        p.id as product_id,
        p.name as product_name,
        fsp.sale_price,
        fsp.stock_quantity,
        fsp.max_quantity,
        fsp.discount_percentage,
        p.original_price,
        p.images
      FROM flash_sales fs
      JOIN flash_sale_products fsp ON fsp.flash_sale_id = fs.id
      JOIN products p ON p.id = fsp.product_id
      WHERE fs.is_active = true
        AND fs.end_time > NOW()
      ORDER BY fs.title, p.name
    `);

    if (flashSaleProducts.rows.length === 0) {
      console.log("❌ No products found in active flash sales!\n");
    } else {
      console.log(
        `✅ Found ${flashSaleProducts.rows.length} product(s) in flash sales:\n`
      );

      // Group by sale
      const groupedBySale = {};
      flashSaleProducts.rows.forEach((product) => {
        if (!groupedBySale[product.sale_title]) {
          groupedBySale[product.sale_title] = [];
        }
        groupedBySale[product.sale_title].push(product);
      });

      Object.keys(groupedBySale).forEach((saleTitle) => {
        console.log(`   📦 ${saleTitle}:`);
        groupedBySale[saleTitle].forEach((product, index) => {
          console.log(`      ${index + 1}. ${product.product_name}`);
          console.log(`         - Product ID: ${product.product_id}`);
          console.log(
            `         - Sale Price: ₦${parseFloat(
              product.sale_price
            ).toLocaleString()}`
          );
          console.log(
            `         - Original Price: ₦${parseFloat(
              product.original_price || 0
            ).toLocaleString()}`
          );
          console.log(
            `         - Stock: ${product.stock_quantity}/${product.max_quantity}`
          );
          console.log(`         - Discount: ${product.discount_percentage}%`);
          console.log(
            `         - Has Images: ${
              product.images && product.images.length > 0 ? "Yes" : "No"
            }`
          );
          console.log("");
        });
      });
    }

    // Query 3: Check for product variants
    console.log("3️⃣ Product Variants for Flash Sale Products:");
    console.log("---------------------------------------------");
    const variants = await client.query(`
      SELECT 
        p.name as product_name,
        pv.id as variant_id,
        pv.color,
        pv.size,
        pv.sku,
        pv.stock_quantity,
        pv.base_price
      FROM flash_sales fs
      JOIN flash_sale_products fsp ON fsp.flash_sale_id = fs.id
      JOIN products p ON p.id = fsp.product_id
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      WHERE fs.is_active = true
        AND fs.end_time > NOW()
      ORDER BY p.name, pv.color, pv.size
    `);

    if (variants.rows.length === 0) {
      console.log("⚠️  No variants found for flash sale products\n");
    } else {
      console.log(`✅ Found ${variants.rows.length} variant(s):\n`);

      const groupedByProduct = {};
      variants.rows.forEach((variant) => {
        if (!groupedByProduct[variant.product_name]) {
          groupedByProduct[variant.product_name] = [];
        }
        groupedByProduct[variant.product_name].push(variant);
      });

      Object.keys(groupedByProduct).forEach((productName) => {
        console.log(`   🎨 ${productName}:`);
        groupedByProduct[productName].forEach((variant, index) => {
          if (variant.variant_id) {
            console.log(
              `      ${index + 1}. Variant ID: ${variant.variant_id}`
            );
            console.log(`         - Color: ${variant.color || "N/A"}`);
            console.log(`         - Size: ${variant.size || "N/A"}`);
            console.log(`         - SKU: ${variant.sku || "N/A"}`);
            console.log(`         - Stock: ${variant.stock_quantity}`);
            console.log(
              `         - Price: ₦${parseFloat(
                variant.base_price || 0
              ).toLocaleString()}`
            );
          } else {
            console.log(`      ⚠️  No variants defined for this product`);
          }
          console.log("");
        });
      });
    }

    // Query 4: Check if tables exist
    console.log("4️⃣ Database Schema Check:");
    console.log("-------------------------");
    const tableCheck = await client.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
        AND table_name IN ('flash_sales', 'flash_sale_products', 'products', 'product_variants')
      ORDER BY table_name
    `);

    console.log("✅ Tables found:");
    tableCheck.rows.forEach((table) => {
      console.log(`   - ${table.table_name} (${table.column_count} columns)`);
    });
    console.log("");

    // Query 5: Count total records
    console.log("5️⃣ Record Counts:");
    console.log("-----------------");

    const counts = await Promise.all([
      client.query("SELECT COUNT(*) as count FROM flash_sales"),
      client.query("SELECT COUNT(*) as count FROM flash_sale_products"),
      client.query("SELECT COUNT(*) as count FROM products"),
      client.query("SELECT COUNT(*) as count FROM product_variants"),
    ]);

    console.log(`   - Total Flash Sales: ${counts[0].rows[0].count}`);
    console.log(`   - Total Flash Sale Products: ${counts[1].rows[0].count}`);
    console.log(`   - Total Products: ${counts[2].rows[0].count}`);
    console.log(`   - Total Product Variants: ${counts[3].rows[0].count}`);
    console.log("");

    // Summary and recommendations
    console.log("========================================");
    console.log("📊 SUMMARY & RECOMMENDATIONS");
    console.log("========================================\n");

    if (activeSales.rows.length === 0) {
      console.log("⚠️  ISSUE: No active flash sales found");
      console.log("   👉 You need to create flash sales with:");
      console.log("      - is_active = true");
      console.log("      - end_time > NOW()");
      console.log("      - start_time <= NOW()");
      console.log("");
    }

    if (flashSaleProducts.rows.length === 0 && activeSales.rows.length > 0) {
      console.log("⚠️  ISSUE: Flash sales exist but have no products");
      console.log(
        "   👉 Add products to your flash sales in the flash_sale_products table"
      );
      console.log("");
    }

    if (variants.rows.filter((v) => !v.variant_id).length > 0) {
      console.log("⚠️  WARNING: Some products have no variants");
      console.log("   👉 Consider adding variants to these products");
      console.log("");
    }

    if (activeSales.rows.length > 0 && flashSaleProducts.rows.length > 0) {
      console.log("✅ Everything looks good! Your flash sales should work.");
      console.log("");
    }

    console.log("========================================\n");
  } catch (error) {
    console.error("❌ Error executing query:", error.message);
    console.error("\nFull error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the check
checkFlashSales().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
