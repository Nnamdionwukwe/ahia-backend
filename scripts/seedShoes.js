const { Pool } = require("pg");
const dotenv = require("dotenv");
const crypto = require("crypto");

// Load environment variables
dotenv.config();

// Generate unique suffix for SKUs to avoid duplicates
const uniqueSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();

// Log connection details for debugging
console.log("📡 Database Connection Details:");
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  console.log(`   User: ${url.username}`);
  console.log(`   Host: ${url.hostname}`);
  console.log(`   Database: ${url.pathname.slice(1)}`);
  console.log(`   Port: ${url.port}\n`);
} else {
  console.log(
    `   User: ${process.env.DB_USER || process.env.PGUSER || "Not set"}`
  );
  console.log(
    `   Host: ${process.env.DB_HOST || process.env.PGHOST || "Not set"}`
  );
  console.log(
    `   Database: ${process.env.DB_NAME || process.env.PGDATABASE || "Not set"}`
  );
  console.log(
    `   Port: ${process.env.DB_PORT || process.env.PGPORT || "5432"}\n`
  );
}

// Create a pool connection - use DATABASE_URL if available, otherwise build from env vars
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        user: process.env.DB_USER || process.env.PGUSER,
        host: process.env.DB_HOST || process.env.PGHOST,
        database: process.env.DB_NAME || process.env.PGDATABASE,
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
        port: process.env.DB_PORT || process.env.PGPORT || 5432,
      }
);

const seedShoeProducts = async () => {
  const client = await pool.connect();

  try {
    // Test connection and get current user
    const userResult = await client.query("SELECT current_user");
    const currentUser = userResult.rows[0].current_user;
    console.log(`✓ Connected as user: ${currentUser}\n`);

    await client.query("BEGIN");
    console.log("🌱 Starting shoe products seed...\n");

    // Get a seller ID
    const sellerResult = await client.query("SELECT id FROM sellers LIMIT 1");
    if (sellerResult.rows.length === 0) {
      throw new Error(
        "No sellers found in database. Please create a seller first."
      );
    }
    const sellerId = sellerResult.rows[0].id;
    console.log(`✓ Using seller ID: ${sellerId}\n`);

    // Product 1: Nike Air Max Running Shoes
    const product1 = await client.query(
      `INSERT INTO products (
        id, name, description, price, original_price, discount_percentage,
        category, brand, images, stock_quantity, rating, total_reviews,
        tags, seller_id, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
      ) RETURNING id`,
      [
        "Nike Air Max Running Shoes",
        "High-performance running shoes with advanced cushioning technology. Perfect for daily running and training. Features responsive foam and lightweight design.",
        28999,
        32999,
        12,
        "shoes",
        "Nike",
        JSON.stringify([
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&crop=shoes",
          "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=500",
        ]),
        150,
        4.5,
        328,
        ["running", "sports", "comfortable", "breathable", "lightweight"],
        sellerId,
      ]
    );
    const product1Id = product1.rows[0].id;
    console.log(
      `✓ Created Product 1: Nike Air Max Running Shoes (${product1Id})`
    );

    // Product 2: Converse Canvas Sneakers
    const product2 = await client.query(
      `INSERT INTO products (
        id, name, description, price, original_price, discount_percentage,
        category, brand, images, stock_quantity, rating, total_reviews,
        tags, seller_id, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
      ) RETURNING id`,
      [
        "Classic Canvas Sneakers",
        "Versatile casual sneakers perfect for everyday wear. Timeless design with comfortable canvas upper and durable rubber sole. Great for all-day comfort.",
        4999,
        6499,
        23,
        "shoes",
        "Converse",
        JSON.stringify([
          "https://images.unsplash.com/photo-1549928030-01f0ea9a8ae8?w=500",
          "https://images.unsplash.com/photo-1549928030-01f0ea9a8ae8?w=500&crop=shoes",
          "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=500",
        ]),
        200,
        4.3,
        412,
        ["casual", "everyday", "canvas", "sneakers", "unisex"],
        sellerId,
      ]
    );
    const product2Id = product2.rows[0].id;
    console.log(`✓ Created Product 2: Classic Canvas Sneakers (${product2Id})`);

    // Product 3: Jordan Basketball Shoes
    const product3 = await client.query(
      `INSERT INTO products (
        id, name, description, price, original_price, discount_percentage,
        category, brand, images, stock_quantity, rating, total_reviews,
        tags, seller_id, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
      ) RETURNING id`,
      [
        "Air Jordan Sports Basketball Shoes",
        "Professional-grade basketball shoes with superior ankle support and grip. Engineered for court performance with premium materials and cushioning system.",
        45999,
        54999,
        16,
        "shoes",
        "Jordan",
        JSON.stringify([
          "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=500",
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
          "https://images.unsplash.com/photo-1549928030-01f0ea9a8ae8?w=500",
        ]),
        120,
        4.8,
        245,
        ["basketball", "sports", "professional", "high-performance", "court"],
        sellerId,
      ]
    );
    const product3Id = product3.rows[0].id;
    console.log(
      `✓ Created Product 3: Air Jordan Sports Basketball Shoes (${product3Id})\n`
    );

    // Add product attributes
    const attributes = [
      {
        productId: product1Id,
        name: "Material",
        value: "Breathable Mesh & Synthetic",
        group: "construction",
        order: 1,
      },
      {
        productId: product1Id,
        name: "Sole",
        value: "Rubber",
        group: "construction",
        order: 2,
      },
      {
        productId: product1Id,
        name: "Weight",
        value: "285g (per shoe)",
        group: "specifications",
        order: 1,
      },
      {
        productId: product2Id,
        name: "Material",
        value: "Canvas Upper",
        group: "construction",
        order: 1,
      },
      {
        productId: product2Id,
        name: "Sole",
        value: "Rubber",
        group: "construction",
        order: 2,
      },
      {
        productId: product2Id,
        name: "Style",
        value: "Casual",
        group: "specifications",
        order: 1,
      },
      {
        productId: product3Id,
        name: "Material",
        value: "Premium Leather & Mesh",
        group: "construction",
        order: 1,
      },
      {
        productId: product3Id,
        name: "Support",
        value: "High Ankle Support",
        group: "specifications",
        order: 1,
      },
      {
        productId: product3Id,
        name: "Cushioning",
        value: "Air Jordan Zoom Air",
        group: "specifications",
        order: 2,
      },
    ];

    for (const attr of attributes) {
      await client.query(
        `INSERT INTO product_attributes (product_id, attribute_name, attribute_value, attribute_group, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [attr.productId, attr.name, attr.value, attr.group, attr.order]
      );
    }
    console.log(`✓ Added product attributes\n`);

    // Add variants for Nike Air Max (3 colors × 7 sizes with different prices & discounts)
    const nikeColors = [
      { name: "Black", discount: 12, priceMultiplier: 1.0 },
      { name: "White", discount: 18, priceMultiplier: 1.05 },
      { name: "Red", discount: 25, priceMultiplier: 0.95 },
    ];
    const nikeSizes = ["6", "7", "8", "9", "10", "11", "12"];
    const nikeSizeMultipliers = {
      6: 0.95,
      7: 0.97,
      8: 1.0,
      9: 1.02,
      10: 1.05,
      11: 1.08,
      12: 1.1,
    };

    for (const color of nikeColors) {
      for (const size of nikeSizes) {
        const stock = Math.floor(Math.random() * 30 + 5);
        const basePrice = Math.round(
          28999 * color.priceMultiplier * nikeSizeMultipliers[size]
        );
        await client.query(
          `INSERT INTO product_variants (product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            product1Id,
            color.name,
            size,
            `NIKE-${color.name.toUpperCase()}-${size}-${uniqueSuffix}`,
            stock,
            basePrice,
            color.discount,
          ]
        );
      }
    }
    console.log(
      `✓ Added Nike Air Max variants (3 colors × 7 sizes = 21 variants with varying prices & discounts)`
    );

    // Add variants for Converse (4 colors × 8 sizes with different prices & discounts)
    const converseColors = [
      { name: "Black", discount: 23, priceMultiplier: 1.0 },
      { name: "White", discount: 15, priceMultiplier: 1.08 },
      { name: "Navy", discount: 28, priceMultiplier: 0.98 },
      { name: "Red", discount: 20, priceMultiplier: 1.05 },
    ];
    const converseSizes = ["5", "6", "7", "8", "9", "10", "11", "12"];
    const converseSizeMultipliers = {
      5: 0.92,
      6: 0.95,
      7: 0.98,
      8: 1.0,
      9: 1.03,
      10: 1.06,
      11: 1.09,
      12: 1.12,
    };

    for (const color of converseColors) {
      for (const size of converseSizes) {
        const stock = Math.floor(Math.random() * 40 + 10);
        const basePrice = Math.round(
          4999 * color.priceMultiplier * converseSizeMultipliers[size]
        );
        await client.query(
          `INSERT INTO product_variants (product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            product2Id,
            color.name,
            size,
            `CONVERSE-${color.name.toUpperCase()}-${size}-${uniqueSuffix}`,
            stock,
            basePrice,
            color.discount,
          ]
        );
      }
    }
    console.log(
      `✓ Added Converse Canvas variants (4 colors × 8 sizes = 32 variants with varying prices & discounts)`
    );

    // Add variants for Jordan (3 colors × 8 sizes with different prices & discounts)
    const jordanColors = [
      { name: "Black/Red", discount: 16, priceMultiplier: 1.0 },
      { name: "White/Black", discount: 22, priceMultiplier: 1.1 },
      { name: "Navy/Gold", discount: 19, priceMultiplier: 0.97 },
    ];
    const jordanSizes = ["7", "8", "9", "10", "11", "12", "13", "14"];
    const jordanSizeMultipliers = {
      7: 0.95,
      8: 0.98,
      9: 1.0,
      10: 1.03,
      11: 1.06,
      12: 1.09,
      13: 1.12,
      14: 1.15,
    };

    for (const color of jordanColors) {
      for (const size of jordanSizes) {
        const stock = Math.floor(Math.random() * 25 + 5);
        const basePrice = Math.round(
          45999 * color.priceMultiplier * jordanSizeMultipliers[size]
        );
        await client.query(
          `INSERT INTO product_variants (product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            product3Id,
            color.name,
            size,
            `JORDAN-${color.name
              .toUpperCase()
              .replace("/", "-")}-${size}-${uniqueSuffix}`,
            stock,
            basePrice,
            color.discount,
          ]
        );
      }
    }
    console.log(
      `✓ Added Jordan Basketball variants (3 colors × 8 sizes = 24 variants with varying prices & discounts)\n`
    );

    // Verify the data
    const verification = await client.query(
      `SELECT 
        p.name, 
        p.brand, 
        COUNT(pv.id) as variant_count,
        p.price,
        p.original_price,
        p.discount_percentage
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE p.brand IN ('Nike', 'Converse', 'Jordan')
      GROUP BY p.id, p.name, p.brand, p.price, p.original_price, p.discount_percentage
      ORDER BY p.created_at DESC`
    );

    console.log("✅ Verification - Products created:\n");
    verification.rows.forEach((row) => {
      console.log(`  • ${row.name}`);
      console.log(`    Brand: ${row.brand}`);
      console.log(
        `    Price: ₦${row.price.toLocaleString()} (Original: ₦${row.original_price.toLocaleString()})`
      );
      console.log(`    Discount: ${row.discount_percentage}%`);
      console.log(`    Variants: ${row.variant_count}`);
      console.log("");
    });

    await client.query("COMMIT");
    console.log("🎉 Seed completed successfully!\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error seeding data:", error.message);
    console.error("\n📝 Connection details:");
    console.error(`   User: ${process.env.DB_USER || "postgres"}`);
    console.error(`   Host: ${process.env.DB_HOST || "localhost"}`);
    console.error(`   Database: ${process.env.DB_NAME || "ecommerce"}`);
    console.error(`   Port: ${process.env.DB_PORT || 5432}`);
    console.error(
      "\n💡 Make sure your .env file has correct database credentials"
    );
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

// Run the seed
seedShoeProducts();
