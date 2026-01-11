// scripts/fixGoogleAuth.js
require("dotenv").config();
const db = require("../src/config/database");

async function fixGoogleAuth() {
  try {
    console.log("🔧 Updating database schema for Google OAuth...");

    // Make phone_number nullable and longer
    await db.query(`
      ALTER TABLE users 
      ALTER COLUMN phone_number TYPE VARCHAR(100),
      ALTER COLUMN phone_number DROP NOT NULL;
    `);
    console.log("✅ Updated phone_number column");

    // Add email column
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    `);
    console.log("✅ Added email column");

    // Add unique constraint on email
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique 
      ON users (email) 
      WHERE email IS NOT NULL;
    `);
    console.log("✅ Added unique constraint on email");

    console.log("\n🎉 Database schema updated successfully!");

    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

fixGoogleAuth();
