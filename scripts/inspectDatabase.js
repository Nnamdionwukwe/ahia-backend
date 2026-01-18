// inspectDatabase.js
// Run this script with: node scripts/inspectDatabase.js
// This will show you ALL tables, their structures, relationships, and sample data

require("dotenv").config(); // Load .env file
const { Pool } = require("pg");

// Use your existing database configuration from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // OR use individual variables if you don't have DATABASE_URL
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function log(message, color = "white") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function box(title, color = "cyan") {
  const width = 80;
  const border = "=".repeat(width);
  console.log(`\n${colors[color]}${border}${colors.reset}`);
  console.log(
    `${colors[color]}${colors.bright}${title
      .padStart((width + title.length) / 2)
      .padEnd(width)}${colors.reset}`
  );
  console.log(`${colors[color]}${border}${colors.reset}\n`);
}

function section(title, color = "blue") {
  console.log(
    `\n${colors[color]}${colors.bright}${"▶".repeat(3)} ${title}${colors.reset}`
  );
  console.log(`${colors[color]}${"-".repeat(80)}${colors.reset}`);
}

async function inspectDatabase() {
  let client;

  try {
    // Test connection
    log("Connecting to database...", "yellow");
    client = await pool.connect();
    log("✅ Connected successfully!\n", "green");

    box("📊 DATABASE INSPECTOR", "cyan");

    // ========================================
    // 1. DATABASE OVERVIEW
    // ========================================
    section("1️⃣ DATABASE OVERVIEW", "green");

    const dbInfo = await client.query(`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as postgres_version
    `);

    log(`Database: ${dbInfo.rows[0].database_name}`, "bright");
    log(`User: ${dbInfo.rows[0].current_user}`, "bright");
    log(`PostgreSQL: ${dbInfo.rows[0].postgres_version.split(",")[0]}`, "dim");

    // ========================================
    // 2. ALL TABLES
    // ========================================
    section("2️⃣ ALL TABLES IN DATABASE", "green");

    const tables = await client.query(`
      SELECT 
        table_name,
        (SELECT COUNT(*) 
         FROM information_schema.columns 
         WHERE table_name = t.table_name 
         AND table_schema = 'public') as column_count,
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name)::regclass)) as size
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      log("❌ No tables found in database!", "red");
      return;
    }

    log(`Found ${tables.rows.length} tables:\n`, "bright");

    tables.rows.forEach((table, index) => {
      log(`   ${index + 1}. ${table.table_name}`, "cyan");
      log(`      - Columns: ${table.column_count}`, "dim");
      log(`      - Size: ${table.size}`, "dim");
    });

    // ========================================
    // 3. DETAILED TABLE STRUCTURES
    // ========================================
    section("3️⃣ DETAILED TABLE STRUCTURES", "green");

    for (const table of tables.rows) {
      console.log(
        `\n${colors.magenta}${
          colors.bright
        }┌─ ${table.table_name.toUpperCase()}${colors.reset}`
      );
      console.log(
        `${colors.magenta}└─────────────────────────────────────────${colors.reset}`
      );

      // Get columns
      const columns = await client.query(
        `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default,
          CASE 
            WHEN column_name IN (
              SELECT column_name 
              FROM information_schema.key_column_usage 
              WHERE table_name = $1
            ) THEN 'PK/FK'
            ELSE ''
          END as key_info
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `,
        [table.table_name]
      );

      log("   Columns:", "yellow");
      columns.rows.forEach((col) => {
        const nullable =
          col.is_nullable === "YES" ? "(nullable)" : "(NOT NULL)";
        const type = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type;
        const key = col.key_info ? ` [${col.key_info}]` : "";
        const defaultVal = col.column_default ? ` = ${col.column_default}` : "";

        log(
          `      • ${col.column_name}: ${type} ${nullable}${key}${defaultVal}`,
          "dim"
        );
      });

      // Get row count
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM ${table.table_name}`
      );
      log(`\n   Total Records: ${countResult.rows[0].count}`, "bright");

      // Get foreign keys
      const foreignKeys = await client.query(
        `
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_name = $1
      `,
        [table.table_name]
      );

      if (foreignKeys.rows.length > 0) {
        log("\n   Foreign Keys (Relationships):", "yellow");
        foreignKeys.rows.forEach((fk) => {
          log(
            `      • ${fk.column_name} → ${fk.foreign_table_name}(${fk.foreign_column_name})`,
            "dim"
          );
        });
      }

      // Get indexes
      const indexes = await client.query(
        `
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE tablename = $1
          AND schemaname = 'public'
      `,
        [table.table_name]
      );

      if (indexes.rows.length > 0) {
        log("\n   Indexes:", "yellow");
        indexes.rows.forEach((idx) => {
          log(`      • ${idx.indexname}`, "dim");
        });
      }
    }

    // ========================================
    // 4. SAMPLE DATA FROM EACH TABLE
    // ========================================
    section("4️⃣ SAMPLE DATA (First 3 Records)", "green");

    for (const table of tables.rows) {
      console.log(
        `\n${colors.cyan}${colors.bright}▸ ${table.table_name}:${colors.reset}`
      );

      try {
        const sampleData = await client.query(`
          SELECT * FROM ${table.table_name} 
          LIMIT 3
        `);

        if (sampleData.rows.length === 0) {
          log("   (empty table)", "dim");
        } else {
          sampleData.rows.forEach((row, index) => {
            log(`\n   Record ${index + 1}:`, "yellow");
            Object.keys(row).forEach((key) => {
              let value = row[key];

              // Format value for display
              if (value === null) {
                value = "NULL";
              } else if (typeof value === "object") {
                value = JSON.stringify(value);
              } else if (typeof value === "string" && value.length > 50) {
                value = value.substring(0, 50) + "...";
              }

              log(`      ${key}: ${value}`, "dim");
            });
          });
        }
      } catch (err) {
        log(`   Error reading data: ${err.message}`, "red");
      }
    }

    // ========================================
    // 5. TABLE RELATIONSHIPS (ER Diagram Data)
    // ========================================
    section("5️⃣ TABLE RELATIONSHIPS", "green");

    const relationships = await client.query(`
      SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, kcu.column_name
    `);

    if (relationships.rows.length === 0) {
      log("No foreign key relationships defined", "yellow");
    } else {
      log("Database Relationships:\n", "bright");
      relationships.rows.forEach((rel) => {
        log(`   ${rel.from_table}.${rel.from_column}`, "cyan");
        log(`      ↓`, "dim");
        log(`   ${rel.to_table}.${rel.to_column}`, "green");
        log("", "reset");
      });
    }

    // ========================================
    // 6. MISSING TABLES CHECK
    // ========================================
    section("6️⃣ CHECKING FOR EXPECTED TABLES", "green");

    const expectedTables = [
      "users",
      "sellers",
      "products",
      "product_variants",
      "product_attributes",
      "categories",
      "flash_sales",
      "flash_sale_products",
      "orders",
      "order_items",
      "cart",
      "cart_items",
      "wishlist",
      "reviews",
      "addresses",
      "payments",
      "notifications",
    ];

    const existingTableNames = tables.rows.map((t) => t.table_name);
    const missingTables = expectedTables.filter(
      (t) => !existingTableNames.includes(t)
    );
    const extraTables = existingTableNames.filter(
      (t) => !expectedTables.includes(t)
    );

    if (missingTables.length > 0) {
      log("\n⚠️  Missing Expected Tables:", "yellow");
      missingTables.forEach((table) => {
        log(`   ✗ ${table}`, "red");
      });
    } else {
      log("\n✅ All expected tables exist!", "green");
    }

    if (extraTables.length > 0) {
      log("\n📋 Additional Tables (not in expected list):", "cyan");
      extraTables.forEach((table) => {
        log(`   + ${table}`, "cyan");
      });
    }

    // ========================================
    // 7. FLASH SALES SPECIFIC CHECK
    // ========================================
    section("7️⃣ FLASH SALES SETUP CHECK", "green");

    const hasFlashSales = existingTableNames.includes("flash_sales");
    const hasFlashSaleProducts = existingTableNames.includes(
      "flash_sale_products"
    );

    if (hasFlashSales && hasFlashSaleProducts) {
      log("✅ Flash sales tables exist", "green");

      // Check for data
      const salesCount = await client.query(
        "SELECT COUNT(*) as count FROM flash_sales"
      );
      const productsCount = await client.query(
        "SELECT COUNT(*) as count FROM flash_sale_products"
      );

      log(`\n   Flash Sales: ${salesCount.rows[0].count}`, "bright");
      log(`   Flash Sale Products: ${productsCount.rows[0].count}`, "bright");

      if (parseInt(salesCount.rows[0].count) === 0) {
        log("\n   ⚠️  No flash sales data found", "yellow");
        log("   💡 Run: node scripts/createSampleFlashSales.js", "cyan");
      }

      // Check for active sales
      const activeSales = await client.query(`
        SELECT COUNT(*) as count 
        FROM flash_sales 
        WHERE is_active = true 
          AND end_time > NOW()
          AND start_time <= NOW()
      `);

      log(`   Active Flash Sales: ${activeSales.rows[0].count}`, "bright");
    } else {
      log("❌ Flash sales tables missing!", "red");
      log("\n   💡 Run: node scripts/createFlashSalesTables.js", "cyan");
    }

    // ========================================
    // 8. SUMMARY & RECOMMENDATIONS
    // ========================================
    box("📊 SUMMARY & RECOMMENDATIONS", "cyan");

    log("Database Status:", "bright");
    log(`   • Total Tables: ${tables.rows.length}`, "green");
    log(`   • Total Relationships: ${relationships.rows.length}`, "green");

    console.log(
      "\n" + colors.yellow + colors.bright + "Next Steps:" + colors.reset
    );

    if (missingTables.length > 0) {
      log("   1. Create missing tables:", "yellow");
      missingTables.forEach((table) => {
        log(`      - ${table}`, "dim");
      });
    }

    if (!hasFlashSales || !hasFlashSaleProducts) {
      log("   2. Set up flash sales:", "yellow");
      log("      node scripts/createFlashSalesTables.js", "cyan");
    }

    if (
      hasFlashSales &&
      parseInt(
        (await client.query("SELECT COUNT(*) FROM flash_sales")).rows[0].count
      ) === 0
    ) {
      log("   3. Add sample flash sales:", "yellow");
      log("      node scripts/createSampleFlashSales.js", "cyan");
    }

    log("\n   4. Verify data:", "yellow");
    log("      node scripts/checkFlashSales.js", "cyan");

    console.log(
      "\n" + colors.green + "✅ Inspection complete!" + colors.reset + "\n"
    );
  } catch (error) {
    console.error(
      "\n" + colors.red + "❌ Error inspecting database:" + colors.reset
    );
    console.error("Error message:", error.message);
    console.error("\nFull error:", error);

    // Helpful debugging info
    if (error.code === "28000" || error.code === "28P01") {
      console.log(
        "\n" +
          colors.yellow +
          "💡 Database authentication failed!" +
          colors.reset
      );
      console.log(
        "Check your .env file and ensure these variables are set correctly:"
      );
      console.log("   - DATABASE_URL (or)");
      console.log("   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD");
    }
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the inspection
console.log("Starting database inspection...\n");
inspectDatabase().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
