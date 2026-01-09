// src/database/seed-phase2.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const seedReviews = async () => {
  try {
    console.log("Seeding Phase 2 data...");

    // Get first user and product
    const user = await db.query("SELECT id FROM users LIMIT 1");
    const product = await db.query("SELECT id FROM products LIMIT 1");

    if (user.rows.length === 0 || product.rows.length === 0) {
      console.error("No users or products found. Run seed.js first");
      process.exit(1);
    }

    const userId = user.rows[0].id;
    const productId = product.rows[0].id;

    // Add sample reviews
    const reviews = [
      {
        rating: 5,
        title: "Amazing product!",
        comment: "Great quality and fast delivery. Highly recommended!",
      },
      {
        rating: 4,
        title: "Good value for money",
        comment: "Good product overall. Packaging could be better.",
      },
      {
        rating: 5,
        title: "Perfect!",
        comment: "Exactly as described. Will buy again.",
      },
      {
        rating: 3,
        title: "Decent",
        comment: "Not bad but expected better quality.",
      },
    ];

    for (const review of reviews) {
      await db.query(
        `INSERT INTO reviews (id, product_id, user_id, rating, title, comment, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          uuidv4(),
          productId,
          userId,
          review.rating,
          review.title,
          review.comment,
        ]
      );
    }

    console.log("✓ Sample reviews added");
    console.log("✅ Phase 2 seeding completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
};

seedReviews();
