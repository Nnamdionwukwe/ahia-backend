// src/database/migrations.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createTables = async () => {
  try {
    console.log("Starting database migrations...");

    // Users table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                phone_number VARCHAR(20) UNIQUE NOT NULL,
                password_hash VARCHAR,
                full_name VARCHAR NOT NULL,
                profile_image VARCHAR,
                address TEXT,
                delivery_addresses JSONB,
                theme_preference VARCHAR DEFAULT 'light',
                signup_method VARCHAR DEFAULT 'phone',
                is_verified BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Users table created");

    // Sellers table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS sellers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                store_name VARCHAR NOT NULL,
                store_logo_url VARCHAR,
                rating DECIMAL(3, 2) DEFAULT 0,
                total_followers INT DEFAULT 0,
                total_sold INT DEFAULT 0,
                verified BOOLEAN DEFAULT FALSE,
                country VARCHAR,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Sellers table created");

    // Products table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR NOT NULL,
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                original_price DECIMAL(10, 2),
                discount_percentage INT DEFAULT 0,
                category VARCHAR,
                brand VARCHAR,
                stock_quantity INT DEFAULT 0,
                rating DECIMAL(3, 2) DEFAULT 0,
                total_reviews INT DEFAULT 0,
                seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
                images JSONB,
                specifications JSONB,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Products table created");

    // Product images table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS product_images (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                image_url VARCHAR NOT NULL,
                alt_text VARCHAR,
                display_order INT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Product images table created");

    // Product variants table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                color VARCHAR,
                size VARCHAR,
                sku VARCHAR UNIQUE,
                stock_quantity INT DEFAULT 0,
                base_price DECIMAL(10, 2),
                price_adjustment DECIMAL(10, 2) DEFAULT 0,
                original_price DECIMAL(10, 2),
                discount_percentage INT DEFAULT 0,
                images JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
    console.log("✓ Product variants table created");

    // OAuth accounts table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS oauth_accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                provider VARCHAR NOT NULL,
                provider_user_id VARCHAR NOT NULL,
                provider_email VARCHAR,
                access_token VARCHAR,
                refresh_token VARCHAR,
                token_expires_at TIMESTAMP,
                profile_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(provider, provider_user_id)
            )
        `);
    console.log("✓ OAuth accounts table created");

    // Cart table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS carts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
                quantity INT DEFAULT 1,
                added_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, product_variant_id)
            )
        `);
    console.log("✓ Cart table created");

    // Create indexes
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth_accounts(user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_cart_user_id ON carts(user_id)"
    );
    console.log("✓ Indexes created");

    console.log("✅ All migrations completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
};

createTables();
