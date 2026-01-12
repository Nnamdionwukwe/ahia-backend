const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

async function seedProductsWithAttributes() {
  const client = await pool.connect();

  try {
    console.log("🌱 Starting to seed products with attributes...\n");

    // ========================================
    // 1. CREATE SAMPLE SELLER
    // ========================================
    console.log("👤 Creating sample seller...");
    const sellerResult = await client.query(`
      INSERT INTO sellers (id, user_id, store_name, rating, total_followers, verified, created_at)
      VALUES 
        ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440099', 'Effeokki', 4.6, 327, TRUE, NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING id;
    `);
    console.log("✅ Seller created\n");

    // ========================================
    // 2. CREATE 6 SAMPLE PRODUCTS
    // (2 for flash sales + 4 for seasonal sales)
    // ========================================
    console.log("📦 Creating sample products...\n");

    // ===== FLASH SALE PRODUCTS (2) =====
    console.log("⚡ Flash Sale Products:");

    // Flash Product 1: Smart Watch
    await client.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '3e4d07d2-3f26-4b51-b174-a23690148798',
        '550e8400-e29b-41d4-a716-446655440001',
        'EFFEOKKI 2in 1 Smart Watch with Earbuds Wireless 5.11 cm Display TWS Earphones',
        '2.01TFT HD comprehensive touch screen with 240*296 resolution greatly improves the user experience. More content can be seen at a glance, presenting you with more details. Built-in TWS earphones with multiple watch faces and multi-sport modes.',
        'Electronics',
        26552.00,
        60159.00,
        59,
        'EFFEOKKI',
        ARRAY['smartwatch', 'wireless earbuds', 'fitness tracker', 'bluetooth watch', 'TWS'],
        4.6,
        1466,
        150,
        ARRAY[
          'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800',
          'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800',
          'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800',
          'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800'
        ],
        NOW() - INTERVAL '30 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("  ✅ Smart Watch (Flash Sale Product 1)");

    // Flash Product 2: Wireless Headphones
    await client.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '5g6f9622-g4bd-63f6-c936-668877662002',
        '550e8400-e29b-41d4-a716-446655440001',
        'Premium Wireless Bluetooth 5.3 Headphones - Active Noise Cancellation ANC',
        'Experience studio-quality sound with our flagship wireless headphones. Features advanced ANC technology, 40-hour battery life, ultra-comfortable memory foam ear cushions, and premium audio drivers. Perfect for music lovers, travelers, and professionals.',
        'Electronics',
        12800.00,
        32000.00,
        60,
        'SoundMax Ultra',
        ARRAY['headphones', 'wireless', 'bluetooth', 'noise cancelling', 'ANC'],
        4.7,
        2341,
        95,
        ARRAY[
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800',
          'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800',
          'https://images.unsplash.com/photo-1545127398-14699f92334b?w=800',
          'https://images.unsplash.com/photo-1577174881658-0f30157e609d?w=800'
        ],
        NOW() - INTERVAL '60 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("  ✅ Wireless Headphones (Flash Sale Product 2)\n");

    // ===== SEASONAL SALE PRODUCTS (4) =====
    console.log("🌦️  Seasonal Sale Products:");

    // Seasonal Product 1: Water Bottle
    await client.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '4f5e8511-f3ac-52e5-b825-557766551001',
        '550e8400-e29b-41d4-a716-446655440001',
        'Insulated Stainless Steel Water Bottle 32oz - Keeps Drinks Cold 24hrs Hot 12hrs',
        'Premium double-wall vacuum insulated water bottle made from high-grade 18/8 stainless steel. BPA-free, eco-friendly alternative to plastic bottles. Perfect for gym, office, outdoor activities. Leak-proof lid with convenient carry handle.',
        'Home & Kitchen',
        4500.00,
        8900.00,
        49,
        'HydroFlask Pro',
        ARRAY['water bottle', 'insulated', 'stainless steel', 'eco-friendly', 'sports'],
        4.8,
        892,
        200,
        ARRAY[
          'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800',
          'https://images.unsplash.com/photo-1588012262823-8c9c8a3a2f21?w=800',
          'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800'
        ],
        NOW() - INTERVAL '45 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("  ✅ Water Bottle (Seasonal Product 1)");

    // Seasonal Product 2: Yoga Mat
    await client.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '6h7g0733-h5ce-74g7-d047-779988773003',
        '550e8400-e29b-41d4-a716-446655440001',
        'Premium Non-Slip Yoga Mat with Carrying Strap - Extra Thick 6mm',
        'High-density eco-friendly TPE yoga mat with superior cushioning and grip. Perfect for yoga, pilates, meditation, and floor exercises. Non-slip texture on both sides ensures stability. Lightweight and portable with free carrying strap.',
        'Sports',
        3200.00,
        6500.00,
        51,
        'ZenFit Pro',
        ARRAY['yoga mat', 'exercise', 'fitness', 'non-slip', 'eco-friendly'],
        4.5,
        678,
        180,
        ARRAY[
          'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800',
          'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
          'https://images.unsplash.com/photo-1603988363607-e1e4a66962c6?w=800'
        ],
        NOW() - INTERVAL '20 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("  ✅ Yoga Mat (Seasonal Product 2)");

    // Seasonal Product 3: Backpack
    await client.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '7i8h1844-i6df-85h8-e158-880099884004',
        '550e8400-e29b-41d4-a716-446655440001',
        'Anti-Theft Laptop Backpack with USB Charging Port - Water Resistant Travel Bag',
        'Premium business travel backpack with TSA-friendly laptop compartment (fits 15.6" laptops). Features hidden anti-theft pockets, USB charging port, breathable back panel, and water-resistant material. Perfect for work, travel, and daily commute.',
        'Fashion',
        8900.00,
        17800.00,
        50,
        'TravelPro Elite',
        ARRAY['backpack', 'laptop bag', 'travel', 'anti-theft', 'USB charging'],
        4.7,
        1234,
        120,
        ARRAY[
          'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800',
          'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=800',
          'https://images.unsplash.com/photo-1581605405669-fcdf81165afa?w=800'
        ],
        NOW() - INTERVAL '25 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("  ✅ Anti-Theft Backpack (Seasonal Product 3)");

    // Seasonal Product 4: LED Desk Lamp
    await client.query(`
      INSERT INTO products (
        id, seller_id, name, description, category, price, original_price, 
        discount_percentage, brand, tags, rating, total_reviews, stock_quantity, 
        images, created_at, updated_at
      )
      VALUES (
        '8j9i2955-j7eg-96i9-f269-991100995005',
        '550e8400-e29b-41d4-a716-446655440001',
        'Smart LED Desk Lamp with Wireless Charging Pad - Dimmable Eye-Care Light',
        'Multifunctional LED desk lamp with built-in wireless charging pad for smartphones. Features 5 color modes, 5 brightness levels, USB charging port, and eye-care technology to reduce eye strain. Touch control and memory function. Perfect for office, study, and bedroom.',
        'Home & Kitchen',
        5600.00,
        11200.00,
        50,
        'BrightSpace',
        ARRAY['desk lamp', 'LED', 'wireless charging', 'eye-care', 'dimmable'],
        4.6,
        567,
        90,
        ARRAY[
          'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800',
          'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800',
          'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=800'
        ],
        NOW() - INTERVAL '15 days',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("  ✅ Smart LED Desk Lamp (Seasonal Product 4)\n");

    // ========================================
    // 3. ADD PRODUCT IMAGES
    // ========================================
    console.log("🖼️  Adding product images...");

    await client.query(`
      INSERT INTO product_images (id, product_id, image_url, alt_text, display_order, created_at)
      VALUES 
        -- Smart Watch (Flash)
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800', 'EFFEOKKI Smart Watch Front View', 1, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800', 'Smart Watch with Earbuds', 2, NOW()),
        
        -- Wireless Headphones (Flash)
        (gen_random_uuid(), '5g6f9622-g4bd-63f6-c936-668877662002', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', 'Wireless Headphones', 1, NOW()),
        (gen_random_uuid(), '5g6f9622-g4bd-63f6-c936-668877662002', 'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800', 'Headphones Side Profile', 2, NOW()),
        
        -- Water Bottle (Seasonal)
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800', 'Stainless Steel Water Bottle', 1, NOW()),
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'https://images.unsplash.com/photo-1588012262823-8c9c8a3a2f21?w=800', 'Water Bottle Side View', 2, NOW()),
        
        -- Yoga Mat (Seasonal)
        (gen_random_uuid(), '6h7g0733-h5ce-74g7-d047-779988773003', 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800', 'Premium Yoga Mat', 1, NOW()),
        (gen_random_uuid(), '6h7g0733-h5ce-74g7-d047-779988773003', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800', 'Yoga Mat Close Up', 2, NOW()),
        
        -- Backpack (Seasonal)
        (gen_random_uuid(), '7i8h1844-i6df-85h8-e158-880099884004', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800', 'Anti-Theft Backpack', 1, NOW()),
        (gen_random_uuid(), '7i8h1844-i6df-85h8-e158-880099884004', 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=800', 'Backpack Interior', 2, NOW()),
        
        -- LED Desk Lamp (Seasonal)
        (gen_random_uuid(), '8j9i2955-j7eg-96i9-f269-991100995005', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800', 'Smart LED Desk Lamp', 1, NOW()),
        (gen_random_uuid(), '8j9i2955-j7eg-96i9-f269-991100995005', 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800', 'Desk Lamp Wireless Charging', 2, NOW())
      ON CONFLICT DO NOTHING;
    `);
    console.log("✅ Product images added\n");

    // ========================================
    // 4. ADD PRODUCT VARIANTS
    // ========================================
    console.log("🎨 Adding product variants...");

    await client.query(`
      INSERT INTO product_variants (id, product_id, color, size, sku, stock_quantity, base_price, discount_percentage, created_at)
      VALUES 
        -- Smart Watch variants
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'Black', 'Standard', 'EFFEO-WATCH-BLK-STD', 50, 26552.00, 59, NOW()),
        (gen_random_uuid(), '3e4d07d2-3f26-4b51-b174-a23690148798', 'Silver', 'Standard', 'EFFEO-WATCH-SLV-STD', 45, 28000.00, 55, NOW()),
        
        -- Wireless Headphones variants
        (gen_random_uuid(), '5g6f9622-g4bd-63f6-c936-668877662002', 'Black', 'Standard', 'SOUND-HP-BLK-STD', 45, 12800.00, 60, NOW()),
        (gen_random_uuid(), '5g6f9622-g4bd-63f6-c936-668877662002', 'White', 'Standard', 'SOUND-HP-WHT-STD', 20, 13500.00, 58, NOW()),
        
        -- Water Bottle variants
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'Black', '32oz', 'HYDRO-BOTTLE-BLK-32', 80, 4500.00, 49, NOW()),
        (gen_random_uuid(), '4f5e8511-f3ac-52e5-b825-557766551001', 'Blue', '32oz', 'HYDRO-BOTTLE-BLU-32', 60, 4500.00, 49, NOW()),
        
        -- Yoga Mat variants
        (gen_random_uuid(), '6h7g0733-h5ce-74g7-d047-779988773003', 'Purple', '6mm', 'ZEN-MAT-PUR-6MM', 70, 3200.00, 51, NOW()),
        (gen_random_uuid(), '6h7g0733-h5ce-74g7-d047-779988773003', 'Blue', '6mm', 'ZEN-MAT-BLU-6MM', 55, 3200.00, 51, NOW()),
        
        -- Backpack variants
        (gen_random_uuid(), '7i8h1844-i6df-85h8-e158-880099884004', 'Black', 'Standard', 'TRAVEL-PACK-BLK-STD', 60, 8900.00, 50, NOW()),
        (gen_random_uuid(), '7i8h1844-i6df-85h8-e158-880099884004', 'Gray', 'Standard', 'TRAVEL-PACK-GRAY-STD', 40, 8900.00, 50, NOW()),
        
        -- LED Desk Lamp variants
        (gen_random_uuid(), '8j9i2955-j7eg-96i9-f269-991100995005', 'White', 'Standard', 'BRIGHT-LAMP-WHT-STD', 45, 5600.00, 50, NOW()),
        (gen_random_uuid(), '8j9i2955-j7eg-96i9-f269-991100995005', 'Black', 'Standard', 'BRIGHT-LAMP-BLK-STD', 35, 5600.00, 50, NOW())
      ON CONFLICT (sku) DO NOTHING;
    `);
    console.log("✅ Product variants added\n");

    // ========================================
    // 5. ADD SEASONAL SALES
    // ========================================
    console.log("🌦️  Creating seasonal sales...");

    await client.query(`
      INSERT INTO seasonal_sales (id, name, season, description, start_time, end_time, discount_percentage, is_active, banner_color, created_at)
      VALUES 
        ('11111111-1111-1111-1111-111111111111', 'DRY SEASON SALE', 'Dry', 
         'Biggest savings of the dry season! Up to 60% off on electronics and more',
         NOW() - INTERVAL '3 days', NOW() + INTERVAL '4 days', 60, TRUE, '#FF6B35', NOW()),
        
        ('22222222-2222-2222-2222-222222222222', 'RAINY SEASON SALE', 'Rainy',
         'Stay cozy and save big! Waterproof items and indoor essentials on sale',
         NOW() + INTERVAL '10 days', NOW() + INTERVAL '24 days', 55, FALSE, '#3498DB', NOW()),
        
        ('33333333-3333-3333-3333-333333333333', 'HARMATTAN SALE', 'Harmattan',
         'Beat the cold with hot deals! Special discounts on warm clothing and more',
         NOW() + INTERVAL '30 days', NOW() + INTERVAL '44 days', 50, FALSE, '#9B59B6', NOW()),
        
        ('44444444-4444-4444-4444-444444444444', 'WET SEASON SALE', 'Wet',
         'Splash into savings! Outdoor gear and rainy day essentials',
         NOW() + INTERVAL '50 days', NOW() + INTERVAL '64 days', 45, FALSE, '#2ECC71', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Created 4 seasonal sales (DRY, RAINY, HARMATTAN, WET)\n");

    // Link 4 SEASONAL products to DRY SEASON SALE
    console.log("🔗 Linking seasonal products to DRY SEASON SALE...");
    await client.query(`
      INSERT INTO seasonal_sale_products (seasonal_sale_id, product_id, sale_price, created_at)
      VALUES 
        ('11111111-1111-1111-1111-111111111111', '4f5e8511-f3ac-52e5-b825-557766551001', 4500.00, NOW()),
        ('11111111-1111-1111-1111-111111111111', '6h7g0733-h5ce-74g7-d047-779988773003', 3200.00, NOW()),
        ('11111111-1111-1111-1111-111111111111', '7i8h1844-i6df-85h8-e158-880099884004', 8900.00, NOW()),
        ('11111111-1111-1111-1111-111111111111', '8j9i2955-j7eg-96i9-f269-991100995005', 5600.00, NOW())
      ON CONFLICT (seasonal_sale_id, product_id) DO NOTHING;
    `);
    console.log("✅ 4 products linked to DRY SEASON SALE\n");

    // ========================================
    // 6. ADD FLASH SALES
    // ========================================
    console.log("⚡ Creating flash sales...");

    await client.query(`
      INSERT INTO flash_sales (id, title, description, start_time, end_time, discount_percentage, status, created_at, updated_at)
      VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Electronics Flash Sale',
         'Lightning deals on top electronics! Limited time only - grab them before they are gone!',
         NOW() - INTERVAL '2 hours', NOW() + INTERVAL '10 hours', 65, 'active', NOW(), NOW()),
        
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Midnight Madness Sale',
         'Crazy deals at midnight! The best prices you will ever see on premium products',
         NOW() + INTERVAL '14 hours', NOW() + INTERVAL '20 hours', 70, 'scheduled', NOW(), NOW()),
        
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Weekend Warrior Flash Sale',
         'Weekend exclusive! Sports and outdoor gear at unbeatable prices',
         NOW() + INTERVAL '2 days', NOW() + INTERVAL '3 days', 55, 'scheduled', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Created 3 flash sales\n");

    // ========================================
    // 7. ADD 2 FLASH SALE PRODUCTS
    // ========================================
    console.log("🏷️  Adding 2 products to flash sales...");

    // Flash Sale 1: Electronics Blowout - Smart Watch & Headphones
    await client.query(`
      INSERT INTO flash_sale_products (flash_sale_id, product_id, original_price, sale_price, max_quantity, sold_quantity, created_at)
      VALUES 
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '3e4d07d2-3f26-4b51-b174-a23690148798', 60159.00, 21000.00, 100, 67, NOW()),
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5g6f9622-g4bd-63f6-c936-668877662002', 32000.00, 11200.00, 75, 52, NOW())
      ON CONFLICT (flash_sale_id, product_id) DO NOTHING;
    `);
    console.log(
      "  ✅ Electronics Flash Sale: 2 products (Smart Watch + Headphones)"
    );

    // Flash Sale 2: Midnight Madness - Same 2 products with better prices
    await client.query(`
      INSERT INTO flash_sale_products (flash_sale_id, product_id, original_price, sale_price, max_quantity, sold_quantity, created_at)
      VALUES 
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '3e4d07d2-3f26-4b51-b174-a23690148798', 60159.00, 18000.00, 50, 0, NOW()),
        ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '5g6f9622-g4bd-63f6-c936-668877662002', 32000.00, 9600.00, 50, 0, NOW())
      ON CONFLICT (flash_sale_id, product_id) DO NOTHING;
    `);
    console.log(
      "  ✅ Midnight Madness Sale: 2 products (Smart Watch + Headphones)"
    );

    // Flash Sale 3: Weekend Warrior - Same 2 products
    await client.query(`
      INSERT INTO flash_sale_products (flash_sale_id, product_id, original_price, sale_price, max_quantity, sold_quantity, created_at)
      VALUES 
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', '3e4d07d2-3f26-4b51-b174-a23690148798', 60159.00, 27000.00, 80, 0, NOW()),
        ('cccccccc-cccc-cccc-cccc-cccccccccccc', '5g6f9622-g4bd-63f6-c936-668877662002', 32000.00, 14400.00, 80, 0, NOW())
      ON CONFLICT (flash_sale_id, product_id) DO NOTHING;
    `);
    console.log(
      "  ✅ Weekend Warrior Sale: 2 products (Smart Watch + Headphones)\n"
    );

    // ========================================
    // 8. VERIFICATION
    // ========================================
    console.log("🔍 Verifying seeded data...\n");

    const productCount = await client.query("SELECT COUNT(*) FROM products");
    console.log(`📦 Total Products: ${productCount.rows[0].count}`);

    const flashProducts = await client.query(`
      SELECT COUNT(DISTINCT product_id) FROM flash_sale_products
    `);
    console.log(`⚡ Flash Sale Products: ${flashProducts.rows[0].count}`);

    const seasonalProducts = await client.query(`
      SELECT COUNT(DISTINCT product_id) FROM seasonal_sale_products
    `);
    console.log(
      `🌦️  Seasonal Sale Products: ${seasonalProducts.rows[0].count}`
    );

    const variantCount = await client.query(
      "SELECT COUNT(*) FROM product_variants"
    );
    console.log(`🎨 Product variants: ${variantCount.rows[0].count}`);

    const imageCount = await client.query(
      "SELECT COUNT(*) FROM product_images"
    );
    console.log(`🖼️  Product images: ${imageCount.rows[0].count}`);

    const seasonalCount = await client.query(
      "SELECT COUNT(*) FROM seasonal_sales"
    );
    console.log(`🌦️  Seasonal sales: ${seasonalCount.rows[0].count}`);

    const flashCount = await client.query("SELECT COUNT(*) FROM flash_sales");
    console.log(`⚡ Flash sales: ${flashCount.rows[0].count}`);

    const flashProductsCount = await client.query(
      "SELECT COUNT(*) FROM flash_sale_products"
    );
    console.log(
      `🏷️  Total flash sale entries: ${flashProductsCount.rows[0].count}`
    );

    console.log("\n🎉 Database seeding completed successfully!");
    console.log("\n📋 Summary:");
    console.log("   • 6 Products created total");
    console.log("     - 2 Flash Sale Products (Smart Watch, Headphones)");
    console.log(
      "     - 4 Seasonal Sale Products (Water Bottle, Yoga Mat, Backpack, Desk Lamp)"
    );
    console.log("   • 12 Product variants created");
    console.log("   • 12 Product images added");
    console.log("   • 4 Seasonal sales created (DRY SEASON active now)");
    console.log(
      "   • 3 Flash sales created (Electronics Flash Sale active now)"
    );

    console.log(
      "   • 2 products in flash sales (appearing in all 3 flash sales)"
    );
    console.log("\n✨ Your e-commerce database is ready!\n");
  } catch (error) {
    console.error("❌ Error seeding database:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
// Run the script
seedProductsWithAttributes();
