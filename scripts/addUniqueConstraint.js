// addUniqueConstraint.js
const { Client } = require("pg");
require("dotenv").config(); // Load environment variables from .env file

// Configure your database connection using environment variables
const client = new Client({
  connectionString: process.env.DATABASE_URL, // Use your DATABASE_URL from .env
});

// Function to add the unique constraint
const addUniqueConstraint = async () => {
  try {
    await client.connect(); // Connect to the database
    console.log("Connected to the database");

    // SQL query to add unique constraint
    const query = `
            ALTER TABLE carts 
            ADD CONSTRAINT unique_user_product UNIQUE (user_id, product_variant_id);
        `;

    await client.query(query);
    console.log("Unique constraint added: unique_user_product");
  } catch (error) {
    console.error("Error adding unique constraint:", error);
  } finally {
    await client.end(); // Close the database connection
    console.log("Database connection closed");
  }
};

// Run the function to add the unique constraint
addUniqueConstraint();
