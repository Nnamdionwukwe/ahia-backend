require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// UK Shoe sizes
const ukSizes = [
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
  "9",
  "9.5",
  "10",
  "10.5",
  "11",
];

// Common colors for products
const colors = [
  { name: "Black", index: 0 },
  { name: "White", index: 1 },
  { name: "Blue", index: 2 },
  { name: "Red", index: 3 },
  { name: "Gray", index: 4 },
  { name: "Green", index: 5 },
];

const seedVariants = async () => {
  const client = await pool.connect();

  try {
    console.log("🌱 Seeding product variants...\n");

    await client.query("BEGIN");

    // Get all products with images
    const productsResult = await client.query(`
      SELECT id, name, price, images, category
      FROM products
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0
      LIMIT 50;
    `);

    console.log(
      `Found ${productsResult.rows.length} products to create variants for\n`
    );

    let totalVariants = 0;

    for (const product of productsResult.rows) {
      const numColors = Math.min(colors.length, product.images.length);
      const numSizes =
        product.category === "Fashion" || product.category === "Sports"
          ? Math.floor(Math.random() * 5) + 5 // 5-9 sizes for shoes/clothing
          : 1; // 1 size for other products

      console.log(`Creating variants for: ${product.name}`);
      console.log(
        `  Colors: ${numColors}, Sizes: ${numSizes === 1 ? "N/A" : numSizes}`
      );

      for (let c = 0; c < numColors; c++) {
        const color = colors[c];
        const imageUrl = product.images[c % product.images.length];

        // Create size variants for this color
        const sizesToCreate =
          numSizes === 1
            ? [null] // No size variant
            : ukSizes.slice(0, numSizes);

        for (const size of sizesToCreate) {
          const priceVariation = Math.random() * 0.2 - 0.1; // ±10% price variation
          const variantPrice = Math.round(product.price * (1 + priceVariation));
          const discount =
            Math.random() > 0.7 ? Math.floor(Math.random() * 30) + 5 : 0; // 30% chance of discount
          const stockQty = Math.floor(Math.random() * 50) + 10;

          const sku = size
            ? `${product.id.substring(
                0,
                8
              )}-${color.name.toUpperCase()}-${size.replace(".", "")}`
            : `${product.id.substring(0, 8)}-${color.name.toUpperCase()}`;

          try {
            await client.query(
              `
              INSERT INTO product_variants (
                product_id, 
                color, 
                size, 
                sku, 
                stock_quantity, 
                base_price, 
                discount_percentage,
                image_url
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (product_id, color, size) DO NOTHING;
            `,
              [
                product.id,
                color.name,
                size,
                sku,
                stockQty,
                variantPrice,
                discount,
                imageUrl,
              ]
            );
            totalVariants++;
          } catch (err) {
            if (err.code !== "23505") {
              // Ignore unique constraint violations
              console.error(`  ❌ Error creating variant: ${err.message}`);
            }
          }
        }
      }

      console.log(`  ✅ Created variants for ${product.name}\n`);
    }

    await client.query("COMMIT");
    console.log(`✅ Successfully seeded ${totalVariants} product variants!`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedVariants()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding error:", error);
    process.exit(1);
  });
