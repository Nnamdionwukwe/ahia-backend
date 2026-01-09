// src/database/seed.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const seedData = async () => {
  try {
    console.log("Starting data seeding...");

    // Create a seller
    const sellerId = uuidv4();
    await db.query(
      `INSERT INTO sellers (id, store_name, rating, verified)
             VALUES ($1, $2, $3, $4)`,
      [sellerId, "Official Store", 4.8, true]
    );
    console.log("✓ Seller created");

    // Create sample products
    const products = [
      {
        name: "Gaming Chair | Elastic Office",
        description: "Premium gaming chair with elastic support",
        category: "Furniture",
        brand: "EliteGaming",
        price: 270263,
        original_price: 600120,
        discount_percentage: 54,
        stock_quantity: 10,
      },
      {
        name: "Laptop Docking Station",
        description: '15.6" portable touch display',
        category: "Electronics",
        brand: "AMGATE",
        price: 151624,
        original_price: 303248,
        discount_percentage: 50,
        stock_quantity: 15,
      },
      {
        name: "Wireless Hair Trimmer Set",
        description: "Professional grooming set with multiple attachments",
        category: "Beauty",
        brand: "WEEME",
        price: 25630,
        original_price: 77547,
        discount_percentage: 67,
        stock_quantity: 20,
      },
      {
        name: "Travel Backpack",
        description: "Unisex travel leisure shoulder tote bag",
        category: "Bags",
        brand: "TravelPro",
        price: 18280,
        original_price: 59764,
        discount_percentage: 66,
        stock_quantity: 25,
      },
    ];

    for (const product of products) {
      const productId = uuidv4();

      await db.query(
        `INSERT INTO products 
                 (id, name, description, category, brand, price, original_price, 
                  discount_percentage, stock_quantity, seller_id, rating, total_reviews, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          productId,
          product.name,
          product.description,
          product.category,
          product.brand,
          product.price,
          product.original_price,
          product.discount_percentage,
          product.stock_quantity,
          sellerId,
          Math.random() * 2 + 3,
          Math.floor(Math.random() * 100 + 20),
        ]
      );

      // Create variants
      const colors = ["Black", "White", "Red", "Blue"];
      for (const color of colors) {
        const variantId = uuidv4();
        await db.query(
          `INSERT INTO product_variants
                     (id, product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            variantId,
            productId,
            color,
            "Standard",
            `SKU-${productId}-${color}`,
            product.stock_quantity,
            product.price,
            product.discount_percentage,
          ]
        );
      }
    }

    console.log("✓ Products and variants created");
    console.log("✅ Data seeding completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
};

seedData();
