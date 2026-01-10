// scripts/checkDatabase.js
require("dotenv").config();
const db = require("../src/config/database");

async function checkDatabase() {
  try {
    // Get database connection info
    const result = await db.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        inet_server_addr() as host,
        inet_server_port() as port
    `);

    console.log("\n🔍 DATABASE CONNECTION INFO:");
    console.log("================================");
    console.log(result.rows[0]);
    console.log("\n📝 DATABASE_URL from .env:");
    console.log(process.env.DATABASE_URL);

    // Count products
    const count = await db.query("SELECT COUNT(*) FROM products");
    console.log(`\n📦 Products in this database: ${count.rows[0].count}`);

    // List all products
    const products = await db.query("SELECT id, name, price FROM products");
    if (products.rows.length > 0) {
      console.log("\n📋 Products found:");
      products.rows.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} - $${p.price}`);
      });
    } else {
      console.log("\n⚠️  No products found in this database");
    }

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkDatabase();
