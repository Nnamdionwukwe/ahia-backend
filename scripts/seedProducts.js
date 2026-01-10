// scripts/seedProducts.js
require("dotenv").config();
const db = require("../src/config/database");

async function seedProducts() {
  try {
    console.log("🌱 Seeding products to Railway database...");

    // Check what's already there
    const existing = await db.query("SELECT COUNT(*) FROM products");
    console.log(`📊 Products before seeding: ${existing.rows[0].count}`);

    const result = await db.query(`
      INSERT INTO products (
        id, name, description, price, original_price, discount_percentage,
        category, stock_quantity, images, rating, total_reviews, created_at, updated_at
      ) VALUES 
      (
        gen_random_uuid(),
        'Wireless Bluetooth Headphones',
        'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and superior sound quality. Features wireless Bluetooth 5.0 connectivity, built-in microphone, foldable design, and comfortable memory foam ear cushions.',
        79.99, 129.99, 38, 'Electronics', 50,
        '["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800"]'::jsonb,
        4.6, 342, NOW(), NOW()
      ),
      (
        gen_random_uuid(),
        'Organic Cotton T-Shirt',
        'Soft and comfortable 100% organic cotton t-shirt. Made from sustainably sourced materials with eco-friendly dyes. Classic crew neck design, relaxed fit, preshrunk fabric. Available in multiple colors and sizes.',
        24.99, 39.99, 37, 'Clothing', 150,
        '["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800"]'::jsonb,
        4.7, 567, NOW(), NOW()
      )
      RETURNING id, name, price, category;
    `);

    console.log("\n✅ Products created successfully:\n");
    result.rows.forEach((product) => {
      console.log(`   📦 ${product.name}`);
      console.log(`      ID: ${product.id}`);
      console.log(`      Price: $${product.price}`);
      console.log(`      Category: ${product.category}\n`);
    });

    // Verify total count
    const afterCount = await db.query("SELECT COUNT(*) FROM products");
    console.log(`📊 Total products after seeding: ${afterCount.rows[0].count}`);

    // List all products
    const allProducts = await db.query(
      "SELECT id, name, price, category FROM products ORDER BY created_at DESC"
    );
    console.log("\n📋 ALL PRODUCTS IN DATABASE:");
    allProducts.rows.forEach((p, index) => {
      console.log(`   ${index + 1}. ${p.name} - $${p.price} (${p.category})`);
      console.log(`      ID: ${p.id}`);
    });

    await db.pool.end();
    console.log("\n🎉 Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding products:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seedProducts();
