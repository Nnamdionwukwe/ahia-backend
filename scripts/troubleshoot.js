// troubleshoot.js
const { Client } = require("pg");
require("dotenv").config();

// Database connection settings
const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function troubleshoot() {
  try {
    // Connect to the database
    await client.connect();

    // Check current database
    const dbRes = await client.query("SELECT current_database();");
    console.log("Current database:", dbRes.rows[0].current_database);

    // Verify the existence of the wishlist table
    const tableRes = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = 'wishlist';
    `);

    if (tableRes.rowCount > 0) {
      console.log("Wishlist table exists in the following schemas:");
      tableRes.rows.forEach((row) => {
        console.log(`Schema: ${row.table_schema}, Table: ${row.table_name}`);
      });
    } else {
      console.log("Wishlist table does not exist.");
    }
  } catch (err) {
    console.error("Error during troubleshooting:", err);
  } finally {
    // Close the database connection
    await client.end();
  }
}

// Run the function
troubleshoot();
