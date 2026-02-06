// scripts/seedProducts.js - FIXED VERSION 2 (UUID Support)
const db = require("../src/config/database");
const redis = require("../src/config/redis");
require("dotenv").config();

// Sample product data with complete variants and attributes
const productsData = [
  {
    name: "[sneakers] Casual Running Shoes | Breathable",
    description:
      "Premium casual running shoes with breathable mesh upper and responsive cushioning. Perfect for daily comfort and athletic performance.",
    price: 52258,
    original_price: 85000,
    discount_percentage: 38,
    category: "Footwear",
    brand: "MINZHE YL",
    tags: ["sneakers", "running", "casual", "sports"],
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500",
      "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=500",
      "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=500",
      "https://images.unsplash.com/photo-1543163521-9726539c1a91?w=500",
      "https://images.unsplash.com/photo-1470229722913-7f419344ca51?w=500",
    ],
    stock_quantity: 45,
    seller_id: null, // Will be NULL if no seller exists
    variants: [
      {
        color: "Black",
        size: "36",
        sku: "SNEAK-BLK-36",
        stock_quantity: 10,
        base_price: 52258,
        discount_percentage: 38,
      },
      {
        color: "Black",
        size: "37",
        sku: "SNEAK-BLK-37",
        stock_quantity: 8,
        base_price: 52258,
        discount_percentage: 38,
      },
      {
        color: "Black",
        size: "38",
        sku: "SNEAK-BLK-38",
        stock_quantity: 6,
        base_price: 52258,
        discount_percentage: 38,
      },
      {
        color: "Black",
        size: "39",
        sku: "SNEAK-BLK-39",
        stock_quantity: 5,
        base_price: 52258,
        discount_percentage: 38,
      },
      {
        color: "Black",
        size: "40",
        sku: "SNEAK-BLK-40",
        stock_quantity: 7,
        base_price: 52258,
        discount_percentage: 38,
      },
      {
        color: "White",
        size: "36",
        sku: "SNEAK-WHT-36",
        stock_quantity: 9,
        base_price: 54500,
        discount_percentage: 35,
      },
      {
        color: "White",
        size: "37",
        sku: "SNEAK-WHT-37",
        stock_quantity: 8,
        base_price: 54500,
        discount_percentage: 35,
      },
      {
        color: "White",
        size: "38",
        sku: "SNEAK-WHT-38",
        stock_quantity: 10,
        base_price: 54500,
        discount_percentage: 35,
      },
      {
        color: "White",
        size: "39",
        sku: "SNEAK-WHT-39",
        stock_quantity: 6,
        base_price: 54500,
        discount_percentage: 35,
      },
      {
        color: "White",
        size: "40",
        sku: "SNEAK-WHT-40",
        stock_quantity: 8,
        base_price: 54500,
        discount_percentage: 35,
      },
    ],
    attributes: [
      {
        attribute_name: "Material",
        attribute_value: "Mesh & Synthetic",
        attribute_group: "Materials",
      },
      {
        attribute_name: "Closure Type",
        attribute_value: "Lace-Up",
        attribute_group: "Features",
      },
      {
        attribute_name: "Sole Material",
        attribute_value: "Rubber",
        attribute_group: "Materials",
      },
      {
        attribute_name: "Water Resistant",
        attribute_value: "Yes",
        attribute_group: "Features",
      },
      {
        attribute_name: "Weight per Shoe",
        attribute_value: "250g",
        attribute_group: "Specifications",
      },
    ],
  },

  {
    name: "Feiran'S New Model Features a Fresh Color Sc...",
    description:
      "Latest collection featuring fresh color schemes and modern design. High-quality construction with premium materials for everyday wear.",
    price: 10822,
    original_price: 57994,
    discount_percentage: 81,
    category: "Footwear",
    brand: "Feiran",
    tags: ["shoes", "fashion", "new", "collection"],
    images: [
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=500",
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500",
      "https://images.unsplash.com/photo-1552820728-8ac41f1ce891?w=500",
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=500",
      "https://images.unsplash.com/photo-1595777707802-41d339d60280?w=500",
    ],
    stock_quantity: 38,
    seller_id: null,
    variants: [
      {
        color: "Red",
        size: "35",
        sku: "FEIR-RED-35",
        stock_quantity: 8,
        base_price: 10822,
        discount_percentage: 81,
      },
      {
        color: "Red",
        size: "36",
        sku: "FEIR-RED-36",
        stock_quantity: 10,
        base_price: 10822,
        discount_percentage: 81,
      },
      {
        color: "Red",
        size: "37",
        sku: "FEIR-RED-37",
        stock_quantity: 7,
        base_price: 10822,
        discount_percentage: 81,
      },
      {
        color: "Red",
        size: "38",
        sku: "FEIR-RED-38",
        stock_quantity: 6,
        base_price: 10822,
        discount_percentage: 81,
      },
      {
        color: "Blue",
        size: "35",
        sku: "FEIR-BLU-35",
        stock_quantity: 9,
        base_price: 11200,
        discount_percentage: 80,
      },
      {
        color: "Blue",
        size: "36",
        sku: "FEIR-BLU-36",
        stock_quantity: 8,
        base_price: 11200,
        discount_percentage: 80,
      },
      {
        color: "Blue",
        size: "37",
        sku: "FEIR-BLU-37",
        stock_quantity: 9,
        base_price: 11200,
        discount_percentage: 80,
      },
      {
        color: "Blue",
        size: "38",
        sku: "FEIR-BLU-38",
        stock_quantity: 7,
        base_price: 11200,
        discount_percentage: 80,
      },
      {
        color: "Pink",
        size: "36",
        sku: "FEIR-PNK-36",
        stock_quantity: 6,
        base_price: 11500,
        discount_percentage: 79,
      },
      {
        color: "Pink",
        size: "37",
        sku: "FEIR-PNK-37",
        stock_quantity: 8,
        base_price: 11500,
        discount_percentage: 79,
      },
    ],
    attributes: [
      {
        attribute_name: "Style",
        attribute_value: "Modern Casual",
        attribute_group: "Style",
      },
      {
        attribute_name: "Upper Material",
        attribute_value: "Fabric",
        attribute_group: "Materials",
      },
      {
        attribute_name: "Insole Type",
        attribute_value: "Memory Foam",
        attribute_group: "Comfort",
      },
      {
        attribute_name: "Warranty",
        attribute_value: "1 Year",
        attribute_group: "Service",
      },
    ],
  },

  {
    name: "Black USB to USB-C Adapter | USB to USB-C F...",
    description:
      "High-speed USB to USB-C adapter for seamless connectivity. Supports fast data transfer and charging. Durable construction.",
    price: 1687,
    original_price: 4500,
    discount_percentage: 62,
    category: "Electronics",
    brand: "TechPro",
    tags: ["adapter", "usb", "tech", "accessories"],
    images: [
      "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=500",
      "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=500",
      "https://images.unsplash.com/photo-1547394765-185a0f6bf6d7?w=500",
      "https://images.unsplash.com/photo-1609034227505-5876f6aa4e90?w=500",
      "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=500",
    ],
    stock_quantity: 156,
    seller_id: null,
    variants: [
      {
        color: "Black",
        size: "1 PCS",
        sku: "USB-BLK-1PC",
        stock_quantity: 50,
        base_price: 1687,
        discount_percentage: 62,
      },
      {
        color: "Black",
        size: "2 PCS",
        sku: "USB-BLK-2PC",
        stock_quantity: 40,
        base_price: 3200,
        discount_percentage: 60,
      },
      {
        color: "Black",
        size: "3 PCS",
        sku: "USB-BLK-3PC",
        stock_quantity: 30,
        base_price: 4500,
        discount_percentage: 58,
      },
      {
        color: "White",
        size: "1 PCS",
        sku: "USB-WHT-1PC",
        stock_quantity: 25,
        base_price: 1800,
        discount_percentage: 61,
      },
      {
        color: "White",
        size: "2 PCS",
        sku: "USB-WHT-2PC",
        stock_quantity: 20,
        base_price: 3400,
        discount_percentage: 59,
      },
      {
        color: "Silver",
        size: "1 PCS",
        sku: "USB-SLV-1PC",
        stock_quantity: 18,
        base_price: 1900,
        discount_percentage: 60,
      },
      {
        color: "Silver",
        size: "2 PCS",
        sku: "USB-SLV-2PC",
        stock_quantity: 15,
        base_price: 3600,
        discount_percentage: 58,
      },
      {
        color: "Gold",
        size: "1 PCS",
        sku: "USB-GLD-1PC",
        stock_quantity: 10,
        base_price: 2000,
        discount_percentage: 59,
      },
      {
        color: "Gold",
        size: "2 PCS",
        sku: "USB-GLD-2PC",
        stock_quantity: 8,
        base_price: 3800,
        discount_percentage: 57,
      },
    ],
    attributes: [
      {
        attribute_name: "Connector Type",
        attribute_value: "USB 3.0 to USB-C",
        attribute_group: "Specifications",
      },
      {
        attribute_name: "Data Transfer Speed",
        attribute_value: "480 Mbps",
        attribute_group: "Performance",
      },
      {
        attribute_name: "Power Delivery",
        attribute_value: "100W",
        attribute_group: "Power",
      },
      {
        attribute_name: "Cable Length",
        attribute_value: "0.1m",
        attribute_group: "Dimensions",
      },
      {
        attribute_name: "Certification",
        attribute_value: "FCC, CE",
        attribute_group: "Compliance",
      },
    ],
  },

  {
    name: "Universal Vertical Display Stand for a Detacha...",
    description:
      "Adjustable universal stand compatible with all tablets and monitors. Three-section heightening model for optimal viewing angles.",
    price: 38034,
    original_price: 61646,
    discount_percentage: 38,
    category: "Accessories",
    brand: "StandPro",
    tags: ["stand", "display", "tablet", "universal"],
    images: [
      "https://images.unsplash.com/photo-1527814050087-3793815479db?w=500",
      "https://images.unsplash.com/photo-1552308995-5658abf46ff3?w=500",
      "https://images.unsplash.com/photo-1611532736579-6b16e2b50449?w=500",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
      "https://images.unsplash.com/photo-1587829191301-dc798b83add3?w=500",
    ],
    stock_quantity: 89,
    seller_id: null,
    variants: [
      {
        color: "Black",
        size: "Small (4-6 inch)",
        sku: "STAND-BLK-SM",
        stock_quantity: 20,
        base_price: 38034,
        discount_percentage: 38,
      },
      {
        color: "Black",
        size: "Medium (7-10 inch)",
        sku: "STAND-BLK-MD",
        stock_quantity: 18,
        base_price: 42000,
        discount_percentage: 36,
      },
      {
        color: "Black",
        size: "Large (11-15 inch)",
        sku: "STAND-BLK-LG",
        stock_quantity: 15,
        base_price: 46000,
        discount_percentage: 35,
      },
      {
        color: "Silver",
        size: "Small (4-6 inch)",
        sku: "STAND-SLV-SM",
        stock_quantity: 12,
        base_price: 39000,
        discount_percentage: 37,
      },
      {
        color: "Silver",
        size: "Medium (7-10 inch)",
        sku: "STAND-SLV-MD",
        stock_quantity: 14,
        base_price: 43000,
        discount_percentage: 35,
      },
      {
        color: "Silver",
        size: "Large (11-15 inch)",
        sku: "STAND-SLV-LG",
        stock_quantity: 10,
        base_price: 47000,
        discount_percentage: 34,
      },
      {
        color: "White",
        size: "Small (4-6 inch)",
        sku: "STAND-WHT-SM",
        stock_quantity: 8,
        base_price: 38500,
        discount_percentage: 37,
      },
      {
        color: "White",
        size: "Medium (7-10 inch)",
        sku: "STAND-WHT-MD",
        stock_quantity: 6,
        base_price: 42500,
        discount_percentage: 36,
      },
    ],
    attributes: [
      {
        attribute_name: "Material",
        attribute_value: "Aluminum Alloy",
        attribute_group: "Materials",
      },
      {
        attribute_name: "Weight Capacity",
        attribute_value: "5 kg",
        attribute_group: "Specifications",
      },
      {
        attribute_name: "Adjustable Height",
        attribute_value: "Yes (3-section)",
        attribute_group: "Features",
      },
      {
        attribute_name: "Compatibility",
        attribute_value: "Universal",
        attribute_group: "Compatibility",
      },
      {
        attribute_name: "Non-slip Pads",
        attribute_value: "Rubber Base",
        attribute_group: "Features",
      },
    ],
  },

  {
    name: "Premium Wireless Headphones with Active Noise Cancellation",
    description:
      "Experience crystal-clear audio with advanced noise cancellation technology. Comfortable for extended wear with 40-hour battery life.",
    price: 24087,
    original_price: 52258,
    discount_percentage: 54,
    category: "Electronics",
    brand: "AudioMax",
    tags: ["headphones", "wireless", "audio", "anc"],
    images: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500",
      "https://images.unsplash.com/photo-1487210078519-e21cc028cb29?w=500",
      "https://images.unsplash.com/photo-1487210078519-e21cc028cb29?w=500",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500",
    ],
    stock_quantity: 72,
    seller_id: null,
    variants: [
      {
        color: "Black",
        size: "Standard",
        sku: "HEAD-BLK-STD",
        stock_quantity: 15,
        base_price: 24087,
        discount_percentage: 54,
      },
      {
        color: "Black",
        size: "Pro (With Case)",
        sku: "HEAD-BLK-PRO",
        stock_quantity: 12,
        base_price: 27500,
        discount_percentage: 52,
      },
      {
        color: "Gold",
        size: "Standard",
        sku: "HEAD-GLD-STD",
        stock_quantity: 14,
        base_price: 25000,
        discount_percentage: 53,
      },
      {
        color: "Gold",
        size: "Pro (With Case)",
        sku: "HEAD-GLD-PRO",
        stock_quantity: 10,
        base_price: 28000,
        discount_percentage: 51,
      },
      {
        color: "Silver",
        size: "Standard",
        sku: "HEAD-SLV-STD",
        stock_quantity: 13,
        base_price: 24500,
        discount_percentage: 53,
      },
      {
        color: "Silver",
        size: "Pro (With Case)",
        sku: "HEAD-SLV-PRO",
        stock_quantity: 8,
        base_price: 28500,
        discount_percentage: 51,
      },
      {
        color: "White",
        size: "Standard",
        sku: "HEAD-WHT-STD",
        stock_quantity: 10,
        base_price: 24300,
        discount_percentage: 53,
      },
      {
        color: "White",
        size: "Pro (With Case)",
        sku: "HEAD-WHT-PRO",
        stock_quantity: 7,
        base_price: 27800,
        discount_percentage: 51,
      },
      {
        color: "Blue",
        size: "Standard",
        sku: "HEAD-BLU-STD",
        stock_quantity: 9,
        base_price: 24700,
        discount_percentage: 53,
      },
      {
        color: "Blue",
        size: "Pro (With Case)",
        sku: "HEAD-BLU-PRO",
        stock_quantity: 6,
        base_price: 28200,
        discount_percentage: 51,
      },
    ],
    attributes: [
      {
        attribute_name: "Driver Size",
        attribute_value: "40mm",
        attribute_group: "Audio",
      },
      {
        attribute_name: "Frequency Range",
        attribute_value: "20Hz - 20kHz",
        attribute_group: "Audio",
      },
      {
        attribute_name: "Battery Life",
        attribute_value: "40 hours",
        attribute_group: "Battery",
      },
      {
        attribute_name: "Charging Time",
        attribute_value: "3 hours",
        attribute_group: "Battery",
      },
      {
        attribute_name: "ANC Technology",
        attribute_value: "Active Noise Cancellation",
        attribute_group: "Features",
      },
      {
        attribute_name: "Connectivity",
        attribute_value: "Bluetooth 5.3",
        attribute_group: "Connectivity",
      },
      {
        attribute_name: "Noise Cancellation Level",
        attribute_value: "Up to 40dB",
        attribute_group: "Features",
      },
    ],
  },
];

// Function to seed products
async function seedProducts() {
  try {
    console.log("🌱 Starting product seeding...\n");

    for (const productData of productsData) {
      console.log(`📦 Creating product: ${productData.name}`);

      // Insert product - seller_id can be NULL
      const productResult = await db.query(
        `INSERT INTO products 
         (name, description, price, original_price, discount_percentage, 
          category, brand, images, stock_quantity, seller_id, tags, 
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::text[], NOW(), NOW())
         RETURNING id`,
        [
          productData.name,
          productData.description,
          productData.price,
          productData.original_price,
          productData.discount_percentage,
          productData.category,
          productData.brand,
          JSON.stringify(productData.images),
          productData.stock_quantity,
          productData.seller_id, // This will be NULL
          productData.tags,
        ],
      );

      const productId = productResult.rows[0].id;
      console.log(`✅ Product created with ID: ${productId}`);

      // Insert variants
      console.log(`   Adding ${productData.variants.length} variants...`);
      for (const variant of productData.variants) {
        await db.query(
          `INSERT INTO product_variants 
           (product_id, color, size, sku, stock_quantity, base_price, discount_percentage)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            productId,
            variant.color,
            variant.size,
            variant.sku,
            variant.stock_quantity,
            variant.base_price,
            variant.discount_percentage,
          ],
        );
      }
      console.log(`   ✓ All ${productData.variants.length} variants added`);

      // Insert attributes
      if (productData.attributes && productData.attributes.length > 0) {
        console.log(`   Adding ${productData.attributes.length} attributes...`);
        for (const attr of productData.attributes) {
          await db.query(
            `INSERT INTO product_attributes 
             (product_id, attribute_name, attribute_value, attribute_group, display_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              productId,
              attr.attribute_name,
              attr.attribute_value,
              attr.attribute_group,
              1,
            ],
          );
        }
        console.log(
          `   ✓ All ${productData.attributes.length} attributes added`,
        );
      }

      // Clear cache
      await redis.del(`product:${productId}`);
      console.log(`✅ Product ${productId} completed!\n`);
    }

    console.log("✅ All products seeded successfully!\n");
    console.log(`📊 Summary:`);
    console.log(`   - Total Products: ${productsData.length}`);
    console.log(
      `   - Total Variants: ${productsData.reduce((sum, p) => sum + p.variants.length, 0)}`,
    );
    console.log(
      `   - Total Attributes: ${productsData.reduce((sum, p) => sum + (p.attributes?.length || 0), 0)}`,
    );
    console.log(`\n🎉 Ready to use! Your products are now in the database.\n`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding products:", error.message);
    if (error.detail) {
      console.error("📌 Detail:", error.detail);
    }
    console.error(
      "\n💡 If seller_id error: Make sure seller_id column allows NULL or UUID type",
    );
    process.exit(1);
  }
}

// Run seeding
seedProducts();
