// addCreatedAtColumn.js
require("dotenv").config(); // Load environment variables
const { Client } = require("pg");

// Use the DATABASE_URL from the env file
const client = new Client({
  connectionString: process.env.DATABASE_URL, // Using the DATABASE_URL directly
});

async function addCreatedAtColumn() {
  try {
    // Connect to the database
    await client.connect();

    // SQL command to add the created_at column
    const addColumnQuery = `
      ALTER TABLE wishlist 
      ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    `;

    // Execute the query
    await client.query(addColumnQuery);
    console.log("Column 'created_at' added successfully to 'wishlist' table.");
  } catch (error) {
    console.error("Error adding column:", error);
  } finally {
    // Close the database connection
    await client.end();
  }
}

// Run the function
addCreatedAtColumn();
