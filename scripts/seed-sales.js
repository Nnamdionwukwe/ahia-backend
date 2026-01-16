require("dotenv").config();
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const seedSales = async () => {
  const client = await pool.connect();

  try {
    console.log("🌱 Seeding flash sales and seasonal sales...\n");

    await client.query("BEGIN");

    // Get some random products
    const productsResult = await client.query(`
      SELECT id, name, price, original_price, images
      FROM products
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0
      LIMIT 10
    `);

    if (productsResult.rows.length === 0) {
      console.log("❌ No products found. Please seed products first.");
      await client.query("ROLLBACK");
      return;
    }

    const products = productsResult.rows;
    console.log(`Found ${products.length} products to create sales for\n`);

    // ==================== FLASH SALES ====================
    console.log("📱 Creating Flash Sales...\n");

    // Flash Sale 1: Electronics Flash Sale
    const flashSale1Id = uuidv4();
    const flashSale1Start = new Date();
    const flashSale1End = new Date(Date.now() + 6 * 60 * 60 * 1000);

    await client.query(
      `
      INSERT INTO flash_sales (
        id, title, description, start_time, end_time, 
        discount_percentage, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
      [
        flashSale1Id,
        "⚡ Super Flash Sale - Tech Deals",
        "Limited time offer on electronics and gadgets!",
        flashSale1Start,
        flashSale1End,
        40,
        "active",
      ]
    );

    // Add 2 products to Flash Sale 1
    for (let i = 0; i < Math.min(2, products.length); i++) {
      const product = products[i];
      const salePrice = Math.round(product.price * 0.6);
      const soldQty = Math.floor(Math.random() * 50) + 10;

      await client.query(
        `
        INSERT INTO flash_sale_products (
          id, flash_sale_id, product_id, original_price, sale_price,
          max_quantity, sold_quantity, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
        [
          uuidv4(),
          flashSale1Id,
          product.id,
          product.price,
          salePrice,
          100,
          soldQty,
        ]
      );

      console.log(
        `  ✅ Added ${product.name.substring(0, 40)}... to Flash Sale 1`
      );
      console.log(
        `     Original: ₦${product.price.toLocaleString()} → Sale: ₦${salePrice.toLocaleString()} (${soldQty} sold)`
      );
    }

    // Flash Sale 2: Fashion Flash Sale
    const flashSale2Id = uuidv4();
    const flashSale2Start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const flashSale2End = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await client.query(
      `
      INSERT INTO flash_sales (
        id, title, description, start_time, end_time,
        discount_percentage, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `,
      [
        flashSale2Id,
        "🔥 Mega Flash Sale - Fashion Frenzy",
        "Unbeatable prices on fashion items!",
        flashSale2Start,
        flashSale2End,
        45,
        "scheduled",
      ]
    );

    // Add 2 products to Flash Sale 2
    for (let i = 2; i < Math.min(4, products.length); i++) {
      const product = products[i];
      const salePrice = Math.round(product.price * 0.55);
      const soldQty = Math.floor(Math.random() * 30) + 5;

      await client.query(
        `
        INSERT INTO flash_sale_products (
          id, flash_sale_id, product_id, original_price, sale_price,
          max_quantity, sold_quantity, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
        [
          uuidv4(),
          flashSale2Id,
          product.id,
          product.price,
          salePrice,
          100,
          soldQty,
        ]
      );

      console.log(
        `  ✅ Added ${product.name.substring(0, 40)}... to Flash Sale 2`
      );
      console.log(
        `     Original: ₦${product.price.toLocaleString()} → Sale: ₦${salePrice.toLocaleString()} (${soldQty} sold)`
      );
    }

    console.log("\n✅ Flash Sales created!\n");

    // ==================== SEASONAL SALES ====================
    console.log("🎉 Creating Seasonal Sales...\n");

    // Seasonal Sale products (2 products for New Year Sale)
    for (let i = 4; i < Math.min(6, products.length); i++) {
      const product = products[i];
      const salePrice = Math.round(product.price * 0.7); // 30% off
      const seasonalStart = new Date();
      const seasonalEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query(
        `
        INSERT INTO seasonal_sales (
          id, product_id, name, sale_price, banner_color,
          start_time, end_time, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      `,
        [
          uuidv4(),
          product.id,
          "🎊 New Year Special",
          salePrice,
          "#FF6B35",
          seasonalStart,
          seasonalEnd,
        ]
      );

      console.log(`✅ Seasonal Sale: ${product.name.substring(0, 40)}...`);
      console.log(
        `   ₦${product.price.toLocaleString()} → ₦${salePrice.toLocaleString()}`
      );
    }

    // More seasonal sale products (2 products for Valentine Sale)
    for (let i = 6; i < Math.min(8, products.length); i++) {
      const product = products[i];
      const salePrice = Math.round(product.price * 0.65); // 35% off
      const seasonalStart = new Date();
      const seasonalEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await client.query(
        `
        INSERT INTO seasonal_sales (
          id, product_id, name, sale_price, banner_color,
          start_time, end_time, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
      `,
        [
          uuidv4(),
          product.id,
          "💝 Valentine Special",
          salePrice,
          "#E91E63",
          seasonalStart,
          seasonalEnd,
        ]
      );

      console.log(`✅ Seasonal Sale: ${product.name.substring(0, 40)}...`);
      console.log(
        `   ₦${product.price.toLocaleString()} → ₦${salePrice.toLocaleString()}`
      );
    }

    console.log("\n✅ Seasonal Sales created!\n");

    await client.query("COMMIT");

    console.log("\n" + "=".repeat(60));
    console.log("📊 SEEDING COMPLETE");
    console.log("=".repeat(60));
    console.log("✅ Flash sales: 4 products");
    console.log("✅ Seasonal sales: 4 products");
    console.log("=".repeat(60));
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedSales()
  .then(() => {
    console.log("\n✅ Sales seeding complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seeding error:", error);
    process.exit(1);
  });
