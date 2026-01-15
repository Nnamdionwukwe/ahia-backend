require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const createUsersTable = async () => {
  const client = await pool.connect();

  try {
    console.log("🚀 Creating users table...\n");

    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        phone VARCHAR(50),
        role VARCHAR(50) DEFAULT 'customer',
        is_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    await client.query("COMMIT");
    console.log("✅ Users table created successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to create users table:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

createUsersTable()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
