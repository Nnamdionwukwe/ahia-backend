const db = require("../src/config/database");

/**
 * Create fraud_checks table for fraud detection system
 * Run this script to enable fraud detection functionality
 */

async function createFraudChecksTable() {
  const client = await db.pool.connect();

  try {
    console.log("🚀 Creating fraud_checks table...\n");

    await client.query("BEGIN");

    // Check if users table exists
    console.log("🔍 Checking users table...");
    const usersTable = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);

    const hasUsersTable = usersTable.rows.length > 0;
    if (hasUsersTable) {
      console.log(
        `✅ Found users.id column (${usersTable.rows[0].data_type})\n`,
      );
    } else {
      console.log("⚠️  Warning: users table not found");
      console.log("   Creating fraud_checks table WITHOUT foreign key\n");
    }

    // Create fraud_checks table
    console.log("📋 Creating fraud_checks table...");

    // Determine the correct data type for user_id based on users table
    const userIdType =
      usersTable.rows[0]?.data_type === "uuid" ? "UUID" : "INTEGER";
    console.log(`   Using ${userIdType} for user_id to match users table\n`);

    let createTableSQL = `
      CREATE TABLE IF NOT EXISTS fraud_checks (
        id SERIAL PRIMARY KEY,
        user_id ${userIdType},
        order_id VARCHAR(255),
        risk_score INTEGER DEFAULT 0,
        risk_level VARCHAR(50),
        risk_factors JSONB,
        action VARCHAR(50) DEFAULT 'approve',
        action_taken VARCHAR(50),
        reason TEXT,
        ip_address VARCHAR(100),
        user_agent TEXT,
        device_fingerprint TEXT,
        metadata JSONB,
        manual_review_decision VARCHAR(50),
        manual_review_notes TEXT,
        manual_review_at TIMESTAMP,
        reviewed_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
    `;

    // Add foreign key constraint only if users table exists
    if (hasUsersTable) {
      createTableSQL += `,
        CONSTRAINT fraud_checks_user_id_fkey 
          FOREIGN KEY (user_id) 
          REFERENCES users(id) 
          ON DELETE SET NULL`;
    }

    createTableSQL += `
      )`;

    await client.query(createTableSQL);
    console.log("✅ fraud_checks table created successfully");

    // Create indexes
    console.log("📋 Creating indexes for fraud_checks table...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_checks_user_id ON fraud_checks(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_checks_order_id ON fraud_checks(order_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_checks_created_at ON fraud_checks(created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_checks_action ON fraud_checks(action)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fraud_checks_risk_score ON fraud_checks(risk_score DESC)
    `);
    console.log("✅ Indexes created successfully");

    // Add comment
    await client.query(`
      COMMENT ON TABLE fraud_checks IS 'Stores fraud detection analysis results for orders'
    `);

    await client.query("COMMIT");

    console.log("\n🎉 fraud_checks table setup completed successfully!\n");

    // Verify table
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'fraud_checks'
      )
    `);

    if (tableCheck.rows[0].exists) {
      console.log("✅ Verification: fraud_checks table exists\n");

      // Show table structure
      console.log("📊 Table Structure:");
      const columns = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = 'fraud_checks'
        ORDER BY ordinal_position
      `);

      columns.rows.forEach((row) => {
        const nullable = row.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const defaultVal = row.column_default
          ? ` DEFAULT ${row.column_default}`
          : "";
        console.log(
          `  - ${row.column_name.padEnd(20)} ${row.data_type.padEnd(20)} ${nullable}${defaultVal}`,
        );
      });

      // Show indexes
      console.log("\n📑 Indexes:");
      const indexes = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'fraud_checks'
        ORDER BY indexname
      `);

      indexes.rows.forEach((row) => {
        console.log(`  ✓ ${row.indexname}`);
      });
    }

    console.log("\n✨ Fraud detection system is now ready to use!\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error creating fraud_checks table:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  createFraudChecksTable()
    .then(() => {
      console.log("Setup complete. Exiting...");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
}

module.exports = { createFraudChecksTable };
