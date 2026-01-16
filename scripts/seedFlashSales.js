// seedFlashSales.js
const db = require("../src/config/database"); // Use your existing db config
const { v4: uuidv4 } = require("uuid");

// Flash sale templates
const flashSaleTemplates = [
  {
    title: "⚡ Lightning Electronics Sale",
    description: "Massive discounts on top electronics - Limited quantities!",
    discount_percentage: 45,
    duration_hours: 6,
    status: "active",
  },
  {
    title: "🔥 Mega Fashion Flash Deal",
    description: "Hottest fashion trends at unbeatable prices",
    discount_percentage: 60,
    duration_hours: 12,
    status: "active",
  },
  {
    title: "💎 Luxury Weekend Sale",
    description: "Premium products at incredible discounts",
    discount_percentage: 35,
    duration_hours: 48,
    status: "active",
  },
  {
    title: "🎮 Gaming Gear Blowout",
    description: "Level up your gaming setup for less",
    discount_percentage: 50,
    duration_hours: 8,
    status: "scheduled",
  },
  {
    title: "🏠 Home & Living Flash Sale",
    description: "Transform your space with amazing deals",
    discount_percentage: 40,
    duration_hours: 24,
    status: "scheduled",
  },
];

// Helper function to get random date
const getRandomFutureDate = (hoursFromNow) => {
  const date = new Date();
  date.setHours(date.getHours() + hoursFromNow);
  return date;
};

const getRandomPastDate = (hoursAgo) => {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return date;
};

// Seed flash sales
async function seedFlashSales() {
  const client = await db.pool.connect();

  try {
    console.log("🌱 Starting flash sales seeding...\n");

    await client.query("BEGIN");

    // Get existing products to link with flash sales
    const productsResult = await client.query(`
      SELECT id, name, price, category 
      FROM products 
      WHERE stock_quantity > 0 
      LIMIT 50
    `);

    const products = productsResult.rows;

    if (products.length === 0) {
      console.log("❌ No products found. Please seed products first.");
      await client.query("ROLLBACK");
      return;
    }

    console.log(`✅ Found ${products.length} products to use\n`);

    // Create flash sales
    for (let i = 0; i < flashSaleTemplates.length; i++) {
      const template = flashSaleTemplates[i];
      const flashSaleId = uuidv4();

      // Determine start and end times based on status
      let startTime, endTime;
      if (template.status === "active") {
        startTime = getRandomPastDate(1); // Started 1 hour ago
        endTime = getRandomFutureDate(template.duration_hours);
      } else {
        startTime = getRandomFutureDate(24 + i * 12); // Starts in future
        endTime = getRandomFutureDate(24 + i * 12 + template.duration_hours);
      }

      // Insert flash sale
      await client.query(
        `INSERT INTO flash_sales 
         (id, title, description, start_time, end_time, discount_percentage, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          flashSaleId,
          template.title,
          template.description,
          startTime,
          endTime,
          template.discount_percentage,
          template.status,
        ]
      );

      console.log(`✅ Created flash sale: ${template.title}`);
      console.log(`   Status: ${template.status}`);
      console.log(`   Discount: ${template.discount_percentage}%`);
      console.log(`   Duration: ${template.duration_hours} hours`);

      // Select random products for this flash sale (5-10 products per sale)
      const numProducts = Math.floor(Math.random() * 6) + 5;
      const selectedProducts = products
        .sort(() => 0.5 - Math.random())
        .slice(0, numProducts);

      // Add products to flash sale
      for (const product of selectedProducts) {
        const flashSaleProductId = uuidv4();
        const originalPrice = parseFloat(product.price);
        const salePrice =
          originalPrice * (1 - template.discount_percentage / 100);
        const maxQuantity = Math.floor(Math.random() * 51) + 50; // 50-100 items
        const soldQuantity =
          template.status === "active"
            ? Math.floor(Math.random() * maxQuantity * 0.7) // 0-70% sold for active sales
            : 0;

        await client.query(
          `INSERT INTO flash_sale_products 
           (id, flash_sale_id, product_id, original_price, sale_price, max_quantity, sold_quantity, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            flashSaleProductId,
            flashSaleId,
            product.id,
            originalPrice,
            salePrice.toFixed(2),
            maxQuantity,
            soldQuantity,
          ]
        );
      }

      console.log(`   Added ${selectedProducts.length} products\n`);
    }

    await client.query("COMMIT");

    console.log("✅ Flash sales seeding completed successfully!\n");

    // Display summary
    const summaryResult = await client.query(`
      SELECT 
        fs.status,
        COUNT(fs.id) as flash_sale_count,
        COUNT(fsp.id) as total_products
      FROM flash_sales fs
      LEFT JOIN flash_sale_products fsp ON fs.id = fsp.flash_sale_id
      GROUP BY fs.status
    `);

    console.log("📊 Summary:");
    summaryResult.rows.forEach((row) => {
      console.log(
        `   ${row.status}: ${row.flash_sale_count} flash sales, ${row.total_products} products`
      );
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error seeding flash sales:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the seeder
seedFlashSales()
  .then(() => {
    console.log("\n✅ Seeding process completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seeding process failed:", error);
    process.exit(1);
  });
