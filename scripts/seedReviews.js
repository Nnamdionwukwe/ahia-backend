// scripts/seedReviews.js
require("dotenv").config();
const db = require("../src/config/database");
const { v4: uuidv4 } = require("uuid");

async function seedReviews() {
  try {
    console.log("🌱 Seeding product reviews...");

    const productIds = [
      "4f5e8511-f3ac-52e5-b825-557766551001", // Water Bottle
      "5a6f9622-a4bd-63f6-c936-668877662002", // Headphones
      "0448901f-6af8-40fb-b2a3-7bf02e78db2a", // Another product
    ];

    const userIds = [
      "75fc5026-802b-4a84-8279-6b2aa5fba94c",
      "36ec4e6b-cab2-4931-a668-144b651c5d5f",
    ];

    const reviews = [
      // Water Bottle Reviews - Product 1
      {
        product_id: productIds[0],
        user_id: userIds[0],
        rating: 5,
        title: "Best water bottle ever!",
        comment:
          "Keeps my water ice cold for the entire day even in hot weather. No leaks at all and fits perfectly in my car cup holder. The quality is outstanding and worth every penny! Highly recommend for gym, office, or outdoor activities.",
        helpful_count: 45,
        verified_purchase: true,
        days_ago: 8,
      },
      {
        product_id: productIds[0],
        user_id: userIds[0],
        rating: 5,
        title: "Perfect for the gym",
        comment:
          "I use this bottle daily at the gym and it keeps my drinks cold throughout my entire workout. The handle makes it easy to carry and the wide mouth is perfect for adding ice cubes.",
        helpful_count: 28,
        verified_purchase: true,
        days_ago: 15,
      },
      {
        product_id: productIds[0],
        user_id: userIds[1],
        rating: 4,
        title: "Great quality, bit heavy",
        comment:
          "Very sturdy and well-made bottle. Insulation works amazingly well. The only downside is it's a bit heavy when filled completely, but that's expected with stainless steel. Still love it!",
        helpful_count: 18,
        verified_purchase: true,
        days_ago: 12,
      },
      {
        product_id: productIds[0],
        user_id: userIds[1],
        rating: 5,
        title: "Eco-friendly and stylish",
        comment:
          "Finally ditched plastic bottles! This looks great, performs even better, and I feel good about reducing plastic waste. The matte finish doesn't show fingerprints.",
        helpful_count: 32,
        verified_purchase: true,
        days_ago: 20,
      },

      // Headphones Reviews - Product 2
      {
        product_id: productIds[1],
        user_id: userIds[0],
        rating: 5,
        title: "Amazing sound quality and ANC!",
        comment:
          "These headphones exceeded my expectations! The noise cancellation is incredible - I use them daily for work calls and music. Battery lasts forever and they're super comfortable even after hours of wear. Best purchase this year!",
        helpful_count: 67,
        verified_purchase: true,
        days_ago: 3,
      },
      {
        product_id: productIds[1],
        user_id: userIds[0],
        rating: 5,
        title: "Perfect for travel",
        comment:
          "Used these on a 12-hour flight and the ANC blocked out engine noise completely. Battery lasted the entire trip and still had juice left. Comfortable enough to sleep in!",
        helpful_count: 52,
        verified_purchase: true,
        days_ago: 7,
      },
      {
        product_id: productIds[1],
        user_id: userIds[1],
        rating: 4,
        title: "Great value for money",
        comment:
          "Excellent headphones for the price. Sound is crisp, bass is powerful without being overwhelming. The ANC works really well on flights and in busy offices. Only minor issue is the touch controls take some getting used to.",
        helpful_count: 34,
        verified_purchase: true,
        days_ago: 14,
      },
      {
        product_id: productIds[1],
        user_id: userIds[1],
        rating: 5,
        title: "Best wireless headphones under $150",
        comment:
          "Coming from cheaper headphones, the difference is night and day. The sound quality is studio-level, and I love being able to connect to my laptop and phone simultaneously. Worth every cent!",
        helpful_count: 89,
        verified_purchase: true,
        days_ago: 5,
      },

      // Product 3 Reviews
      {
        product_id: productIds[2],
        user_id: userIds[0],
        rating: 5,
        title: "Excellent product!",
        comment:
          "Really impressed with the quality and performance. Exactly as described and arrived quickly. Would definitely buy again and recommend to friends!",
        helpful_count: 23,
        verified_purchase: true,
        days_ago: 10,
      },
      {
        product_id: productIds[2],
        user_id: userIds[0],
        rating: 4,
        title: "Very good, minor issues",
        comment:
          "Overall a great product. Works as expected and good value. Only small complaint is the packaging could be better, but the product itself is solid.",
        helpful_count: 15,
        verified_purchase: true,
        days_ago: 18,
      },
      {
        product_id: productIds[2],
        user_id: userIds[1],
        rating: 5,
        title: "Highly recommend",
        comment:
          "This exceeded my expectations in every way. Quality is top-notch and it does exactly what it promises. Customer service was also excellent when I had a question.",
        helpful_count: 41,
        verified_purchase: true,
        days_ago: 6,
      },
      {
        product_id: productIds[2],
        user_id: userIds[1],
        rating: 5,
        title: "Perfect!",
        comment:
          "No complaints at all. Great quality, fast shipping, and works perfectly. I've been using it for a month now and still love it. Will buy more products from this seller.",
        helpful_count: 27,
        verified_purchase: true,
        days_ago: 22,
      },
    ];

    console.log(`Adding ${reviews.length} reviews...`);

    for (const review of reviews) {
      // Generate UUID for order_id
      const orderId = uuidv4();

      const result = await db.query(
        `
        INSERT INTO reviews (
          id, product_id, user_id, order_id, rating, title, comment, 
          helpful_count, verified_purchase, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 
          NOW() - INTERVAL '${review.days_ago} days'
        )
        RETURNING id
      `,
        [
          review.product_id,
          review.user_id,
          orderId,
          review.rating,
          review.title,
          review.comment,
          review.helpful_count,
          review.verified_purchase,
        ]
      );

      console.log(`✅ Added review: "${review.title}" (Order ID: ${orderId})`);
    }

    console.log("\n✅ All reviews added successfully!");

    // Update product review counts and ratings
    console.log("\nUpdating product statistics...");

    for (const productId of productIds) {
      await db.query(
        `
        UPDATE products
        SET 
          total_reviews = (SELECT COUNT(*) FROM reviews WHERE product_id = $1),
          rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE product_id = $1)
        WHERE id = $1
      `,
        [productId]
      );
    }

    console.log("✅ Product statistics updated");

    // Show summary
    const summary = await db.query(
      `
      SELECT 
        p.name,
        p.rating,
        p.total_reviews,
        COUNT(DISTINCT r.user_id) as unique_reviewers
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id
      WHERE p.id = ANY($1)
      GROUP BY p.id, p.name, p.rating, p.total_reviews
      ORDER BY p.name
    `,
      [productIds]
    );

    console.log("\n📊 Review Summary:");
    summary.rows.forEach((row) => {
      console.log(`\n${row.name}`);
      console.log(`  ⭐ Rating: ${row.rating}/5`);
      console.log(`  💬 Reviews: ${row.total_reviews}`);
      console.log(`  👥 Reviewers: ${row.unique_reviewers}`);
    });

    // Show some sample order IDs generated
    const sampleOrders = await db.query(
      `
      SELECT DISTINCT order_id 
      FROM reviews 
      WHERE product_id = ANY($1)
      LIMIT 5
    `,
      [productIds]
    );

    console.log("\n🆔 Sample Order IDs generated:");
    sampleOrders.rows.forEach((row) => {
      console.log(`  ${row.order_id}`);
    });

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seedReviews();
