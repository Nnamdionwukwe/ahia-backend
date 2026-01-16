// seedSeasonalSales.js
const db = require("../src/config/database"); // Use your existing db config
const { v4: uuidv4 } = require("uuid");

// Seasonal sale templates
const seasonalSaleTemplates = [
  {
    name: "Summer Clearance Bonanza",
    season: "Summer",
    description: "Beat the heat with hot summer deals on everything you need!",
    discount_percentage: 55,
    banner_color: "#FF6B35",
    duration_days: 30,
    is_active: true,
  },
  {
    name: "Winter Warmth Sale",
    season: "Winter",
    description: "Cozy up with amazing winter savings across all categories",
    discount_percentage: 45,
    banner_color: "#4A90E2",
    duration_days: 45,
    is_active: true,
  },
  {
    name: "Spring Fresh Start",
    season: "Spring",
    description: "Refresh your life with incredible spring savings",
    discount_percentage: 40,
    banner_color: "#50C878",
    duration_days: 28,
    is_active: false,
  },
  {
    name: "Fall Harvest Sale",
    season: "Fall",
    description: "Harvest the savings this fall season!",
    discount_percentage: 50,
    banner_color: "#D2691E",
    duration_days: 35,
    is_active: false,
  },
  {
    name: "Holiday Mega Sale",
    season: "Holiday",
    description: "Celebrate the holidays with our biggest sale of the year",
    discount_percentage: 65,
    banner_color: "#C41E3A",
    duration_days: 60,
    is_active: true,
  },
];

// Helper function to get dates
const getFutureDate = (daysFromNow) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
};

const getPastDate = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

// Seed seasonal sales
async function seedSeasonalSales() {
  const client = await db.pool.connect();

  try {
    console.log("🌱 Starting seasonal sales seeding...\n");

    await client.query("BEGIN");

    // Get existing products
    const productsResult = await client.query(`
      SELECT id, name, price, category 
      FROM products 
      WHERE stock_quantity > 0 
      LIMIT 100
    `);

    const products = productsResult.rows;

    if (products.length === 0) {
      console.log("❌ No products found. Please seed products first.");
      await client.query("ROLLBACK");
      return;
    }

    console.log(`✅ Found ${products.length} products to use\n`);

    // Create seasonal sales
    for (let i = 0; i < seasonalSaleTemplates.length; i++) {
      const template = seasonalSaleTemplates[i];
      const seasonalSaleId = uuidv4();

      // Determine start and end times
      let startTime, endTime;
      if (template.is_active) {
        startTime = getPastDate(5); // Started 5 days ago
        endTime = getFutureDate(template.duration_days);
      } else {
        startTime = getFutureDate(30 + i * 15); // Starts in future
        endTime = getFutureDate(30 + i * 15 + template.duration_days);
      }

      // Insert seasonal sale
      await client.query(
        `INSERT INTO seasonal_sales 
         (id, name, season, description, start_time, end_time, discount_percentage, banner_color, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          seasonalSaleId,
          template.name,
          template.season,
          template.description,
          startTime,
          endTime,
          template.discount_percentage,
          template.banner_color,
          template.is_active,
        ]
      );

      console.log(`✅ Created seasonal sale: ${template.name}`);
      console.log(`   Season: ${template.season}`);
      console.log(`   Active: ${template.is_active}`);
      console.log(`   Discount: ${template.discount_percentage}%`);
      console.log(`   Duration: ${template.duration_days} days`);

      // Select products for this seasonal sale (20-40 products per sale)
      const numProducts = Math.floor(Math.random() * 21) + 20;
      const selectedProducts = products
        .sort(() => 0.5 - Math.random())
        .slice(0, numProducts);

      // Add products to seasonal sale
      for (const product of selectedProducts) {
        const seasonalSaleProductId = uuidv4();
        const originalPrice = parseFloat(product.price);
        const salePrice =
          originalPrice * (1 - template.discount_percentage / 100);

        await client.query(
          `INSERT INTO seasonal_sale_products 
           (id, seasonal_sale_id, product_id, sale_price, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            seasonalSaleProductId,
            seasonalSaleId,
            product.id,
            salePrice.toFixed(2),
          ]
        );
      }

      console.log(`   Added ${selectedProducts.length} products\n`);
    }

    await client.query("COMMIT");

    console.log("✅ Seasonal sales seeding completed successfully!\n");

    // Display summary
    const summaryResult = await client.query(`
      SELECT 
        ss.season,
        ss.is_active,
        COUNT(ssp.id) as total_products
      FROM seasonal_sales ss
      LEFT JOIN seasonal_sale_products ssp ON ss.id = ssp.seasonal_sale_id
      GROUP BY ss.season, ss.is_active
      ORDER BY ss.is_active DESC, ss.season
    `);

    console.log("📊 Summary:");
    summaryResult.rows.forEach((row) => {
      const status = row.is_active ? "🟢 Active" : "⚪ Inactive";
      console.log(`   ${status} ${row.season}: ${row.total_products} products`);
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error seeding seasonal sales:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the seeder
seedSeasonalSales()
  .then(() => {
    console.log("\n✅ Seeding process completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seeding process failed:", error);
    process.exit(1);
  });
