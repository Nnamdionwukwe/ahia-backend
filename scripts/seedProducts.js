// scripts/addMoreProducts.js
require("dotenv").config();
const db = require("../src/config/database");

async function seedProducts() {
  try {
    console.log("🌱 Adding 4 more products with multiple images...");

    const result = await db.query(`
      INSERT INTO products (
        id, name, description, price, original_price, discount_percentage,
        category, stock_quantity, images, rating, total_reviews, created_at, updated_at
      ) VALUES 
      (
        gen_random_uuid(),
        'Smart Watch Fitness Tracker',
        'Advanced fitness tracker with heart rate monitor, sleep tracking, and 50+ sport modes. Features include GPS tracking, waterproof design, 7-day battery life, and smartphone notifications. Perfect for fitness enthusiasts and health-conscious individuals.',
        129.99, 199.99, 35, 'Electronics', 75,
        '[
          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
          "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800",
          "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800",
          "https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800"
        ]'::jsonb,
        4.5, 892, NOW(), NOW()
      ),
      (
        gen_random_uuid(),
        'Leather Crossbody Bag',
        'Elegant genuine leather crossbody bag with adjustable strap. Features multiple compartments, secure zipper closure, and premium craftsmanship. Available in various colors. Perfect for everyday use or special occasions.',
        89.99, 149.99, 40, 'Fashion', 40,
        '[
          "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
          "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800",
          "https://images.unsplash.com/photo-1564422167509-4f3a11c9e0b8?w=800",
          "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800"
        ]'::jsonb,
        4.8, 456, NOW(), NOW()
      ),
      (
        gen_random_uuid(),
        'Stainless Steel Water Bottle',
        'Insulated stainless steel water bottle keeps drinks cold for 24 hours or hot for 12 hours. BPA-free, leak-proof design with wide mouth for easy cleaning. Eco-friendly alternative to plastic bottles. 32oz capacity.',
        34.99, 49.99, 30, 'Home & Kitchen', 200,
        '[
          "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800",
          "https://images.unsplash.com/photo-1523362628745-0c100150b504?w=800",
          "https://images.unsplash.com/photo-1624708200850-c31e9f54e826?w=800",
          "https://images.unsplash.com/photo-1625772452859-1c03d5ba1cf0?w=800"
        ]'::jsonb,
        4.7, 1203, NOW(), NOW()
      ),
      (
        gen_random_uuid(),
        'Running Shoes - Lightweight Performance',
        'Professional running shoes with breathable mesh upper and responsive cushioning. Features include arch support, anti-slip sole, and shock absorption technology. Ideal for running, jogging, gym workouts, and daily wear.',
        79.99, 120.00, 33, 'Sports', 120,
        '[
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
          "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=800",
          "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800",
          "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=800"
        ]'::jsonb,
        4.6, 678, NOW(), NOW()
      )
      RETURNING id, name, price, category;
    `);

    console.log("\n✅ Products created successfully:\n");
    result.rows.forEach((product, index) => {
      console.log(`   ${index + 1}. 📦 ${product.name}`);
      console.log(`      ID: ${product.id}`);
      console.log(`      Price: $${product.price}`);
      console.log(`      Category: ${product.category}`);
      console.log(`      Images: 4 photos\n`);
    });

    // Show total products
    const totalCount = await db.query("SELECT COUNT(*) FROM products");
    console.log(`📊 Total products in database: ${totalCount.rows[0].count}`);

    await db.pool.end();
    console.log("\n🎉 Successfully added 4 more products with 4 images each!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding products:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seedProducts();
