// scripts/seedProductsWithAttributes.js
require("dotenv").config();
const db = require("../src/config/database");

async function seedProductsWithAttributes() {
  try {
    console.log("🌱 Seeding products with complete attributes...");

    // Product 1: Smart Watch with TWS Earbuds
    const product1Id = "3e4d07d2-3f26-4b51-b174-a23690148798";

    const smartWatchAttributes = [
      // Display Specifications
      {
        name: "Display Type",
        value: '2.01" TFT HD Touch Screen',
        group: "display",
        order: 1,
      },
      {
        name: "Resolution",
        value: "240 x 296 pixels",
        group: "display",
        order: 2,
      },
      {
        name: "Display Size",
        value: "5.11 cm (2.01 inches)",
        group: "display",
        order: 3,
      },

      // Connectivity
      {
        name: "Bluetooth Version",
        value: "Bluetooth 5.3",
        group: "connectivity",
        order: 1,
      },
      {
        name: "Wireless Property",
        value: "Bluetooth + TWS",
        group: "connectivity",
        order: 2,
      },
      { name: "NFC", value: "No", group: "connectivity", order: 3 },

      // Battery
      {
        name: "Battery Capacity",
        value: "230mAh (Watch) + 40mAh (Earbuds)",
        group: "battery",
        order: 1,
      },
      {
        name: "Battery Life",
        value: "Up to 7 days",
        group: "battery",
        order: 2,
      },
      { name: "Charging Time", value: "2-3 hours", group: "battery", order: 3 },
      {
        name: "Charging Method",
        value: "Magnetic USB Cable",
        group: "battery",
        order: 4,
      },

      // Features
      {
        name: "Heart Rate Monitor",
        value: "Yes - 24/7 monitoring",
        group: "features",
        order: 1,
      },
      { name: "Sleep Tracking", value: "Yes", group: "features", order: 2 },
      { name: "Step Counter", value: "Yes", group: "features", order: 3 },
      {
        name: "Sports Modes",
        value: "100+ sport modes",
        group: "features",
        order: 4,
      },
      { name: "Water Resistance", value: "IP68", group: "features", order: 5 },
      {
        name: "Call Function",
        value: "Yes - Make & receive calls",
        group: "features",
        order: 6,
      },
      { name: "Music Control", value: "Yes", group: "features", order: 7 },
      { name: "Voice Assistant", value: "Yes", group: "features", order: 8 },

      // Earbuds Specifications
      {
        name: "Earbuds Type",
        value: "True Wireless Stereo (TWS)",
        group: "earbuds",
        order: 1,
      },
      {
        name: "Earbuds Battery",
        value: "40mAh per earbud",
        group: "earbuds",
        order: 2,
      },
      { name: "Playback Time", value: "4-5 hours", group: "earbuds", order: 3 },
      {
        name: "Noise Cancellation",
        value: "Passive",
        group: "earbuds",
        order: 4,
      },

      // Physical Specifications
      {
        name: "Case Material",
        value: "Zinc Alloy + ABS",
        group: "physical",
        order: 1,
      },
      {
        name: "Strap Material",
        value: "Silicone",
        group: "physical",
        order: 2,
      },
      {
        name: "Weight",
        value: "52g (with strap)",
        group: "physical",
        order: 3,
      },
      {
        name: "Dimensions",
        value: "45 x 38 x 12 mm",
        group: "physical",
        order: 4,
      },
      { name: "Strap Width", value: "22mm", group: "physical", order: 5 },

      // Compatibility
      {
        name: "Compatible OS",
        value: "Android 5.0+, iOS 9.0+",
        group: "compatibility",
        order: 1,
      },
      {
        name: "App Required",
        value: "Yes - FitPro",
        group: "compatibility",
        order: 2,
      },

      // Package Contents
      {
        name: "In The Box",
        value: "Smart Watch, TWS Earbuds, USB Charging Cable, User Manual",
        group: "package",
        order: 1,
      },
      {
        name: "Warranty",
        value: "1 Year Manufacturer Warranty",
        group: "package",
        order: 2,
      },
    ];

    console.log("Adding attributes for Smart Watch...");
    for (const attr of smartWatchAttributes) {
      await db.query(
        `
        INSERT INTO product_attributes (product_id, attribute_name, attribute_value, attribute_group, display_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id, attribute_name) DO UPDATE 
        SET attribute_value = EXCLUDED.attribute_value,
            attribute_group = EXCLUDED.attribute_group,
            display_order = EXCLUDED.display_order
      `,
        [product1Id, attr.name, attr.value, attr.group, attr.order]
      );
    }
    console.log(
      `✅ Added ${smartWatchAttributes.length} attributes for Smart Watch`
    );

    // Product 2: Water Bottle
    const product2Id = "4f5e8511-f3ac-52e5-b825-557766551001";

    const waterBottleAttributes = [
      // Material & Construction
      {
        name: "Main Material",
        value: "Stainless Steel 18/8",
        group: "material",
        order: 1,
      },
      {
        name: "Insulation Type",
        value: "Double-Wall Vacuum",
        group: "material",
        order: 2,
      },
      { name: "BPA Free", value: "Yes", group: "material", order: 3 },
      { name: "Food Grade", value: "Yes", group: "material", order: 4 },

      // Performance
      {
        name: "Cold Retention",
        value: "24 hours",
        group: "performance",
        order: 1,
      },
      {
        name: "Hot Retention",
        value: "12 hours",
        group: "performance",
        order: 2,
      },
      { name: "Leak Proof", value: "Yes", group: "performance", order: 3 },
      { name: "Sweat Proof", value: "Yes", group: "performance", order: 4 },

      // Dimensions
      {
        name: "Capacity",
        value: "32oz (946ml)",
        group: "dimensions",
        order: 1,
      },
      {
        name: "Height",
        value: "10.5 inches (26.7cm)",
        group: "dimensions",
        order: 2,
      },
      {
        name: "Diameter",
        value: "3.5 inches (8.9cm)",
        group: "dimensions",
        order: 3,
      },
      { name: "Weight", value: "15.2oz (431g)", group: "dimensions", order: 4 },
      {
        name: "Mouth Opening",
        value: "2.2 inches (5.6cm)",
        group: "dimensions",
        order: 5,
      },

      // Features
      {
        name: "Dishwasher Safe",
        value: "No - Hand wash recommended",
        group: "features",
        order: 1,
      },
      { name: "Carrying Handle", value: "Yes", group: "features", order: 2 },
      {
        name: "Fits Cup Holder",
        value: "Yes - Standard car cup holders",
        group: "features",
        order: 3,
      },
      { name: "Eco-Friendly", value: "Yes", group: "features", order: 4 },

      // Usage
      {
        name: "Suitable For",
        value: "Hot & Cold Beverages",
        group: "usage",
        order: 1,
      },
      {
        name: "Ideal For",
        value: "Gym, Office, Travel, Outdoor Activities",
        group: "usage",
        order: 2,
      },
      {
        name: "Warranty",
        value: "1 Year Manufacturer Warranty",
        group: "usage",
        order: 3,
      },
    ];

    console.log("Adding attributes for Water Bottle...");
    for (const attr of waterBottleAttributes) {
      await db.query(
        `
        INSERT INTO product_attributes (product_id, attribute_name, attribute_value, attribute_group, display_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id, attribute_name) DO UPDATE 
        SET attribute_value = EXCLUDED.attribute_value
      `,
        [product2Id, attr.name, attr.value, attr.group, attr.order]
      );
    }
    console.log(
      `✅ Added ${waterBottleAttributes.length} attributes for Water Bottle`
    );

    // Product 3: Wireless Headphones
    const product3Id = "5a6f9622-a4bd-63f6-c936-668877662002";

    const headphonesAttributes = [
      // Audio Specifications
      { name: "Driver Size", value: "40mm", group: "audio", order: 1 },
      {
        name: "Frequency Response",
        value: "20Hz - 20kHz",
        group: "audio",
        order: 2,
      },
      { name: "Impedance", value: "32 Ohm", group: "audio", order: 3 },
      { name: "Sensitivity", value: "110dB", group: "audio", order: 4 },

      // Noise Cancellation
      {
        name: "Noise Control Mode",
        value: "Active Noise Cancellation",
        group: "anc",
        order: 1,
      },
      { name: "ANC Technology", value: "Hybrid ANC", group: "anc", order: 2 },
      { name: "Noise Reduction", value: "Up to 35dB", group: "anc", order: 3 },
      {
        name: "Ambient Mode",
        value: "Yes - Transparency mode",
        group: "anc",
        order: 4,
      },

      // Connectivity
      {
        name: "Bluetooth Version",
        value: "Bluetooth 5.3",
        group: "connectivity",
        order: 1,
      },
      {
        name: "Wireless Range",
        value: "Up to 33ft (10m)",
        group: "connectivity",
        order: 2,
      },
      {
        name: "Multi-Point Connection",
        value: "Yes - Connect 2 devices",
        group: "connectivity",
        order: 3,
      },
      {
        name: "Wired Option",
        value: "Yes - 3.5mm aux cable included",
        group: "connectivity",
        order: 4,
      },

      // Battery
      { name: "Battery Capacity", value: "500mAh", group: "battery", order: 1 },
      {
        name: "Playback Time (ANC On)",
        value: "30 hours",
        group: "battery",
        order: 2,
      },
      {
        name: "Playback Time (ANC Off)",
        value: "40 hours",
        group: "battery",
        order: 3,
      },
      { name: "Charging Time", value: "2-3 hours", group: "battery", order: 4 },
      {
        name: "Fast Charge",
        value: "Yes - 5 min = 3 hours playback",
        group: "battery",
        order: 5,
      },
      { name: "Charging Port", value: "USB-C", group: "battery", order: 6 },

      // Physical Design
      {
        name: "Material",
        value: "Plastic + Memory Foam",
        group: "design",
        order: 1,
      },
      { name: "Weight", value: "250g", group: "design", order: 2 },
      { name: "Foldable", value: "Yes", group: "design", order: 3 },
      {
        name: "Ear Cushion Type",
        value: "Over-Ear",
        group: "design",
        order: 4,
      },
      {
        name: "Headband",
        value: "Adjustable padded",
        group: "design",
        order: 5,
      },

      // Features
      {
        name: "Built-in Microphone",
        value: "Yes - Dual mic with CVC 8.0",
        group: "features",
        order: 1,
      },
      {
        name: "Voice Assistant",
        value: "Siri, Google Assistant",
        group: "features",
        order: 2,
      },
      {
        name: "Controls",
        value: "Touch controls + physical buttons",
        group: "features",
        order: 3,
      },
      {
        name: "Auto Pause",
        value: "Yes - When removed",
        group: "features",
        order: 4,
      },

      // Compatibility
      {
        name: "Compatible OS",
        value: "iOS, Android, Windows, Mac",
        group: "compatibility",
        order: 1,
      },
      {
        name: "App Support",
        value: "Yes - SoundMax app for customization",
        group: "compatibility",
        order: 2,
      },

      // Package Contents
      {
        name: "In The Box",
        value:
          "Headphones, USB-C Cable, 3.5mm Aux Cable, Carrying Case, User Manual",
        group: "package",
        order: 1,
      },
      {
        name: "Warranty",
        value: "2 Year Manufacturer Warranty",
        group: "package",
        order: 2,
      },
    ];

    console.log("Adding attributes for Headphones...");
    for (const attr of headphonesAttributes) {
      await db.query(
        `
        INSERT INTO product_attributes (product_id, attribute_name, attribute_value, attribute_group, display_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id, attribute_name) DO UPDATE 
        SET attribute_value = EXCLUDED.attribute_value
      `,
        [product3Id, attr.name, attr.value, attr.group, attr.order]
      );
    }
    console.log(
      `✅ Added ${headphonesAttributes.length} attributes for Headphones`
    );

    console.log("\n✅ All product attributes seeded successfully!");

    // Verify
    const count = await db.query("SELECT COUNT(*) FROM product_attributes");
    console.log(`📊 Total product attributes: ${count.rows[0].count}`);

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seedProductsWithAttributes();
