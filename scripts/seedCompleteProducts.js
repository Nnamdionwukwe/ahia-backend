// scripts/seedCompleteProducts.js
require("dotenv").config();
const db = require("../src/config/database");

async function seedCompleteProducts() {
  try {
    console.log("🌱 Seeding complete product data...");

    // Create seller
    console.log("Creating seller...");
    await db.query(`
      INSERT INTO sellers (id, user_id, store_name, rating, total_followers, verified, created_at)
      VALUES 
        ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440099', 'Effeokki', 4.6, 327, TRUE, NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Seller created");

    // Product 1: Smart Watch
    console.log("Creating Smart Watch...");
    await db.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '3e4d07d2-3f26-4b51-b174-a23690148798',
        '550e8400-e29b-41d4-a716-446655440001',
        'EFFEOKKI 2in1 Smart Watch with Earbuds Wireless 5.11cm Display',
        '2.01 TFT HD comprehensive touch screen with 240x296 resolution. Built-in TWS earphones with multiple watch faces and multi-sport modes. Perfect for fitness tracking, calls, and music.',
        'Electronics',
        26552.00,
        60159.00,
        59,
        'EFFEOKKI',
        ARRAY['smartwatch', 'wireless earbuds', 'fitness tracker', 'bluetooth watch', 'TWS'],
        4.6,
        1466,
        150,
        '["https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800","https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800","https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800","https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800"]'::jsonb,
        NOW() - INTERVAL '30 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Smart Watch created");

    // Product 1 Images
    console.log("Adding Smart Watch images...");
    await db.query(`
      INSERT INTO product_images (id, product_id, image_url, alt_text, display_order, created_at)
      VALUES 
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800', 'EFFEOKKI Smart Watch Front View', 1, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800', 'Smart Watch with Earbuds', 2, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800', 'Watch Face Display', 3, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800', 'Smart Watch Side View', 4, NOW())
      ON CONFLICT DO NOTHING;
    `);

    // Product 1 Variants
    console.log("Adding Smart Watch variants...");
    await db.query(`
      INSERT INTO product_variants (id, product_id, color, size, sku, stock_quantity, base_price, discount_percentage, created_at)
      VALUES 
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'Black', 'Standard', 'EFFEO-WATCH-BLK-STD', 50, 26552.00, 59, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'Silver', 'Standard', 'EFFEO-WATCH-SLV-STD', 45, 28000.00, 55, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'Rose Gold', 'Standard', 'EFFEO-WATCH-ROSE-STD', 30, 29500.00, 50, NOW())
      ON CONFLICT DO NOTHING;
    `);

    // Product 2: Water Bottle
    console.log("Creating Water Bottle...");
    await db.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '4f5e8511-f3ac-52e5-b825-557766551001',
        '550e8400-e29b-41d4-a716-446655440001',
        'Insulated Stainless Steel Water Bottle 32oz',
        'Premium double-wall vacuum insulated water bottle. Keeps drinks cold 24hrs, hot 12hrs. BPA-free, eco-friendly alternative to plastic bottles.',
        'Home & Kitchen',
        4500.00,
        8900.00,
        49,
        'HydroFlask Pro',
        ARRAY['water bottle', 'insulated', 'stainless steel', 'eco-friendly', 'sports'],
        4.8,
        892,
        200,
        '["https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800","https://images.unsplash.com/photo-1588012262823-8c9c8a3a2f21?w=800","https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800"]'::jsonb,
        NOW() - INTERVAL '45 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Water Bottle created");

    // Product 2 Variants
    console.log("Adding Water Bottle variants...");
    await db.query(`
      INSERT INTO product_variants (id, product_id, color, size, sku, stock_quantity, base_price, discount_percentage, created_at)
      VALUES 
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'Matte Black', '32oz', 'HYDRO-BOTTLE-BLK-32', 80, 4500.00, 49, NOW()),
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'Ocean Blue', '32oz', 'HYDRO-BOTTLE-BLU-32', 60, 4500.00, 49, NOW()),
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'Rose Pink', '32oz', 'HYDRO-BOTTLE-PINK-32', 40, 4500.00, 49, NOW()),
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'Matte Black', '40oz', 'HYDRO-BOTTLE-BLK-40', 20, 5200.00, 45, NOW())
      ON CONFLICT DO NOTHING;
    `);

    // Product 3: Headphones (FIXED UUID - removed 'g' characters)
    console.log("Creating Headphones...");
    await db.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '5a6f9622-a4bd-63f6-c936-668877662002',
        '550e8400-e29b-41d4-a716-446655440001',
        'Premium Wireless Bluetooth 5.3 Headphones - Active Noise Cancellation',
        'Experience studio-quality sound with advanced ANC technology. 40-hour battery life, ultra-comfortable memory foam ear cushions. Perfect for music lovers and travelers.',
        'Electronics',
        12800.00,
        32000.00,
        60,
        'SoundMax Ultra',
        ARRAY['headphones', 'wireless', 'bluetooth', 'noise cancelling', 'ANC'],
        4.7,
        2341,
        95,
        '["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800","https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800","https://images.unsplash.com/photo-1545127398-14699f92334b?w=800","https://images.unsplash.com/photo-1577174881658-0f30157e609d?w=800"]'::jsonb,
        NOW() - INTERVAL '60 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Headphones created");

    // Product 3 Images
    console.log("Adding Headphones images...");
    await db.query(`
      INSERT INTO product_images (id, product_id, image_url, alt_text, display_order, created_at)
      VALUES 
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', 'Wireless Headphones Main View', 1, NOW()),
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800', 'Headphones Side Profile', 2, NOW()),
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'https://images.unsplash.com/photo-1545127398-14699f92334b?w=800', 'Headphones Folded View', 3, NOW()),
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'https://images.unsplash.com/photo-1577174881658-0f30157e609d?w=800', 'Headphones with Case', 4, NOW())
      ON CONFLICT DO NOTHING;
    `);

    // Product 3 Variants
    console.log("Adding Headphones variants...");
    await db.query(`
      INSERT INTO product_variants (id, product_id, color, size, sku, stock_quantity, base_price, discount_percentage, created_at)
      VALUES 
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'Midnight Black', 'Standard', 'SOUND-HP-BLK-STD', 45, 12800.00, 60, NOW()),
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'Space Gray', 'Standard', 'SOUND-HP-GRAY-STD', 30, 12800.00, 60, NOW()),
        (gen_random_uuid(), '5a6f9622-a4bd-63f6-c936-668877662002', 'Cloud White', 'Standard', 'SOUND-HP-WHT-STD', 20, 13500.00, 58, NOW())
      ON CONFLICT DO NOTHING;
    `);

    console.log("\n✅ All products seeded successfully!");

    // Verify
    const count = await db.query("SELECT COUNT(*) FROM products");
    console.log(`📊 Total products: ${count.rows[0].count}`);

    const withBrand = await db.query(
      "SELECT COUNT(*) FROM products WHERE brand IS NOT NULL"
    );
    console.log(`📦 Products with brand: ${withBrand.rows[0].count}`);

    const withTags = await db.query(
      "SELECT COUNT(*) FROM products WHERE tags IS NOT NULL"
    );
    console.log(`🏷️  Products with tags: ${withTags.rows[0].count}`);

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seedCompleteProducts();
