// src/config/database.js
const { Pool } = require("pg");
require("dotenv").config();

// Check if connecting to Railway
const isRailway = process.env.DATABASE_URL?.includes("railway.app");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    isProduction || isRailway
      ? {
          rejectUnauthorized: false,
        }
      : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

pool.on("connect", () => {
  console.log("✓ PostgreSQL connected");
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
