// addToWishlist.js
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

// User and product information
const userId = "75fc5026-802b-4a84-8279-6b2aa5fba94c"; // Existing user ID
const productId = "3e4d07d2-3f26-4b51-b174-a23690148798"; // Existing product ID

async function addToWishlist() {
  try {
    await client.connect();

    // Check if user exists
    const userCheck = await client.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    if (userCheck.rowCount === 0) {
      throw new Error("User does not exist");
    }

    // Check if product exists
    const productCheck = await client.query(
      "SELECT * FROM products WHERE id = $1",
      [productId]
    );
    if (productCheck.rowCount === 0) {
      throw new Error("Product does not exist");
    }

    // SQL query to insert a new wishlist entry
    const query = `
      INSERT INTO wishlist (user_id, product_id, added_at)
      VALUES ($1, $2, NOW());
    `;

    await client.query(query, [userId, productId]);
    console.log("Product added to wishlist successfully.");
  } catch (err) {
    console.error("Error adding to wishlist:", err);
  } finally {
    await client.end();
  }
}

// Run the function
addToWishlist();
