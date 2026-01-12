// scripts/seedReviewsWithOrders.js
require("dotenv").config();
const db = require("../src/config/database");
const { v4: uuidv4 } = require("uuid");

async function seedReviewsWithOrders() {
  try {
    console.log("🌱 Seeding orders and reviews...");

    const productIds = [
      "4f5e8511-f3ac-52e5-b825-557766551001", // Water Bottle
      "5a6f9622-a4bd-63f6-c936-668877662002", // Headphones
      "0448901f-6af8-40fb-b2a3-7bf02e78db2a", // Another product
    ];

    const userIds = [
      "75fc5026-802b-4a84-8279-6b2aa5fba94c",
      "36ec4e6b-cab2-4931-a668-144b651c5d5f",
    ];

    // Get products and their variants
    const products = await db.query(
      `
      SELECT 
        p.id, p.name, p.price,
        pv.id as variant_id, pv.base_price, pv.color, pv.size
      FROM products p
      LEFT JOIN product_variants pv ON p.id = pv.product_id
      WHERE p.id = ANY($1)
    `,
      [productIds]
    );

    const productMap = {};
    products.rows.forEach((p) => {
      if (!productMap[p.id]) {
        productMap[p.id] = {
          id: p.id,
          name: p.name,
          price: p.price,
          variants: [],
        };
      }
      if (p.variant_id) {
        productMap[p.id].variants.push({
          id: p.variant_id,
          price: p.base_price || p.price,
          color: p.color,
          size: p.size,
        });
      }
    });

    const reviews = [
      // Water Bottle Reviews
      {
        product_id: productIds[0],
        user_id: userIds[0],
        rating: 5,
        title: "Best water bottle ever!",
        comment: "Keeps my water ice cold for the entire day. No leaks at all!",
        helpful_count: 45,
        verified_purchase: true,
        days_ago: 8,
        quantity: 1,
      },
      {
        product_id: productIds[0],
        user_id: userIds[0],
        rating: 5,
        title: "Perfect for the gym",
        comment: "Keeps drinks cold throughout my workout. Easy to carry.",
        helpful_count: 28,
        verified_purchase: true,
        days_ago: 15,
        quantity: 2,
      },
      {
        product_id: productIds[0],
        user_id: userIds[1],
        rating: 4,
        title: "Great quality, bit heavy",
        comment: "Very sturdy. Insulation works great. A bit heavy when full.",
        helpful_count: 18,
        verified_purchase: true,
        days_ago: 12,
        quantity: 1,
      },
      {
        product_id: productIds[0],
        user_id: userIds[1],
        rating: 5,
        title: "Eco-friendly and stylish",
        comment: "Finally ditched plastic! Looks great and performs better.",
        helpful_count: 32,
        verified_purchase: true,
        days_ago: 20,
        quantity: 1,
      },

      // Headphones Reviews
      {
        product_id: productIds[1],
        user_id: userIds[0],
        rating: 5,
        title: "Amazing sound quality!",
        comment: "Noise cancellation is incredible. Battery lasts forever!",
        helpful_count: 67,
        verified_purchase: true,
        days_ago: 3,
        quantity: 1,
      },
      {
        product_id: productIds[1],
        user_id: userIds[0],
        rating: 5,
        title: "Perfect for travel",
        comment: "ANC blocked out all engine noise on 12-hour flight!",
        helpful_count: 52,
        verified_purchase: true,
        days_ago: 7,
        quantity: 1,
      },
      {
        product_id: productIds[1],
        user_id: userIds[1],
        rating: 4,
        title: "Great value",
        comment: "Excellent for the price. Sound is crisp, bass is powerful.",
        helpful_count: 34,
        verified_purchase: true,
        days_ago: 14,
        quantity: 1,
      },
      {
        product_id: productIds[1],
        user_id: userIds[1],
        rating: 5,
        title: "Best headphones!",
        comment: "Studio-level sound quality. Worth every cent!",
        helpful_count: 89,
        verified_purchase: true,
        days_ago: 5,
        quantity: 1,
      },

      // Product 3 Reviews
      {
        product_id: productIds[2],
        user_id: userIds[0],
        rating: 5,
        title: "Excellent product!",
        comment: "Quality and performance exceeded expectations!",
        helpful_count: 23,
        verified_purchase: true,
        days_ago: 10,
        quantity: 1,
      },
      {
        product_id: productIds[2],
        user_id: userIds[0],
        rating: 4,
        title: "Very good",
        comment: "Works as expected. Good value overall.",
        helpful_count: 15,
        verified_purchase: true,
        days_ago: 18,
        quantity: 1,
      },
      {
        product_id: productIds[2],
        user_id: userIds[1],
        rating: 5,
        title: "Highly recommend",
        comment: "Top-notch quality. Does exactly what it promises!",
        helpful_count: 41,
        verified_purchase: true,
        days_ago: 6,
        quantity: 1,
      },
      {
        product_id: productIds[2],
        user_id: userIds[1],
        rating: 5,
        title: "Perfect!",
        comment: "Great quality, fast shipping. Love it!",
        helpful_count: 27,
        verified_purchase: true,
        days_ago: 22,
        quantity: 1,
      },
    ];

    console.log(`Creating ${reviews.length} orders and reviews...`);

    for (const review of reviews) {
      const orderId = uuidv4();
      const product = productMap[review.product_id];

      // Use first available variant or null
      const variant = product.variants.length > 0 ? product.variants[0] : null;
      const unitPrice = variant ? variant.price : product.price;
      const itemSubtotal = unitPrice * review.quantity;
      const discountAmount = 0;
      const totalAmount = itemSubtotal - discountAmount;

      // Create order
      await db.query(
        `
        INSERT INTO orders (
          id, user_id, status, total_amount, discount_amount,
          delivery_address, payment_method, estimated_delivery,
          created_at, updated_at
        )
        VALUES (
          $1, $2, 'delivered', $3, $4,
          '123 Main St, Lagos, Nigeria',
          'card',
          NOW() - INTERVAL '${review.days_ago - 3} days',
          NOW() - INTERVAL '${review.days_ago + 5} days',
          NOW() - INTERVAL '${review.days_ago} days'
        )
      `,
        [orderId, review.user_id, totalAmount, discountAmount]
      );

      // Create order item with variant_id
      await db.query(
        `
        INSERT INTO order_items (
          id, order_id, product_variant_id, flash_sale_product_id, 
          quantity, unit_price, subtotal, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, NULL, $3, $4, $5,
          NOW() - INTERVAL '${review.days_ago + 5} days'
        )
      `,
        [
          orderId,
          variant ? variant.id : null,
          review.quantity,
          unitPrice,
          itemSubtotal,
        ]
      );

      // Create review (reviews still reference product_id directly)
      await db.query(
        `
        INSERT INTO reviews (
          id, product_id, user_id, order_id, rating, title, comment, 
          helpful_count, verified_purchase, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 
          NOW() - INTERVAL '${review.days_ago} days'
        )
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

      const variantInfo = variant
        ? ` (${variant.color || variant.size || "default"})`
        : "";
      console.log(
        `✅ Order ${orderId.substring(0, 8)}...${variantInfo} + "${
          review.title
        }"`
      );
    }

    console.log("\n✅ All orders and reviews created!");

    // Update product statistics
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
        p.name, p.rating, p.total_reviews,
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
      console.log(`\n📦 ${row.name}`);
      console.log(`  ⭐ Rating: ${row.rating}/5`);
      console.log(`  💬 Reviews: ${row.total_reviews}`);
      console.log(`  👥 Reviewers: ${row.unique_reviewers}`);
    });

    const orderSummary = await db.query(
      `
      SELECT COUNT(*) as total_orders, SUM(total_amount) as total_revenue
      FROM orders WHERE user_id = ANY($1)
    `,
      [userIds]
    );

    console.log("\n💰 Order Summary:");
    console.log(`  📋 Total Orders: ${orderSummary.rows[0].total_orders}`);
    console.log(
      `  💵 Total Revenue: $${parseFloat(
        orderSummary.rows[0].total_revenue
      ).toFixed(2)}`
    );

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seedReviewsWithOrders();
