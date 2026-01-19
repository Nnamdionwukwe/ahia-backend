// updateCart.js
const { Client } = require("pg");
require("dotenv").config(); // Load environment variables from .env file
const { v4: uuidv4 } = require("uuid"); // Import uuid package to generate UUIDs

// Configure your database connection using environment variables
const client = new Client({
  connectionString: process.env.DATABASE_URL, // Use the DATABASE_URL from .env
});

// Function to update the cart item
const updateCartItem = async (userId, productVariantId, quantity) => {
  try {
    await client.connect(); // Connect to the database
    console.log("Connected to the database");

    // SQL query to update the cart
    const query = `
      UPDATE carts
      SET quantity = $1, updated_at = NOW()
      WHERE user_id = $2 AND product_variant_id = $3
    `;
    const values = [quantity, userId, productVariantId];

    const res = await client.query(query, values);
    console.log("Cart updated:", res.rowCount, "row(s) affected");
  } catch (error) {
    console.error("Error updating cart:", error);
  } finally {
    await client.end(); // Close the database connection
    console.log("Database connection closed");
  }
};

// Example usage:
// Replace these with actual UUIDs if your database expects UUIDs
const userId = "123e4567-e89b-12d3-a456-426614174000"; // Change to actual UUID
const productVariantId = "123e4567-e89b-12d3-a456-426614174001"; // Change to actual UUID
const quantity = 2; // Change as needed

updateCartItem(userId, productVariantId, quantity);
