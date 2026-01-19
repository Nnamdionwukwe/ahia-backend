// createTable.js
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

async function createWishlistTable() {
  try {
    // Connect to the database
    await client.connect();

    // SQL query to create the wishlist table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS wishlist (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        product_id UUID NOT NULL,
        added_at TIMESTAMP DEFAULT NOW()
      );
    `;

    // Execute the query
    await client.query(createTableQuery);
    console.log("Wishlist table created successfully (if it did not exist).");
  } catch (error) {
    console.error("Error creating wishlist table:", error);
  } finally {
    // Close the database connection
    await client.end();
  }
}

// Run the function
createWishlistTable();
