const db = require("../src/config/database");

/**
 * Database Setup Script for Paystack Integration
 * Handles foreign key constraints properly
 */

async function createPaystackTables() {
  const client = await db.pool.connect();

  try {
    console.log("🚀 Starting Paystack database setup...\n");

    await client.query("BEGIN");

    // First, check if users table exists and has id column
    console.log("🔍 Checking users table...");
    const usersTable = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);

    if (usersTable.rows.length === 0) {
      console.log("⚠️  Warning: users table or id column not found");
      console.log("   Creating transactions table WITHOUT user_id foreign key");
      console.log("   You can add the foreign key later if needed\n");
    } else {
      console.log(
        `✅ Found users.id column (${usersTable.rows[0].data_type})\n`,
      );
    }

    // Check if orders table exists
    console.log("🔍 Checking orders table...");
    const ordersTable = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'id'
    `);

    const hasOrdersTable = ordersTable.rows.length > 0;
    if (hasOrdersTable) {
      console.log(
        `✅ Found orders.id column (${ordersTable.rows[0].data_type})\n`,
      );
    } else {
      console.log("⚠️  Warning: orders table not found\n");
    }

    // Create transactions table with conditional foreign keys
    console.log("📋 Creating transactions table...");

    let createTableSQL = `
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(100) UNIQUE NOT NULL,
        user_id INTEGER,
        order_id INTEGER,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        payment_method VARCHAR(50) DEFAULT 'paystack',
        authorization_code VARCHAR(255),
        metadata JSONB,
        paystack_response JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        verified_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
    `;

    // Add foreign key constraints only if tables exist
    if (usersTable.rows.length > 0) {
      createTableSQL += `,
        CONSTRAINT transactions_user_id_fkey 
          FOREIGN KEY (user_id) 
          REFERENCES users(id) 
          ON DELETE SET NULL`;
    }

    if (hasOrdersTable) {
      createTableSQL += `,
        CONSTRAINT transactions_order_id_fkey 
          FOREIGN KEY (order_id) 
          REFERENCES orders(id) 
          ON DELETE SET NULL`;
    }

    createTableSQL += `
      )`;

    await client.query(createTableSQL);
    console.log("✅ Transactions table created successfully");

    // Create indexes for transactions
    console.log("📋 Creating indexes for transactions table...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(order_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC)
    `);
    console.log("✅ Indexes created successfully");

    // Create webhook_logs table
    console.log("📋 Creating webhook_logs table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        reference VARCHAR(100),
        payload JSONB NOT NULL,
        received_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Webhook_logs table created successfully");

    // Create indexes for webhook_logs
    console.log("📋 Creating indexes for webhook_logs table...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_reference ON webhook_logs(reference)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON webhook_logs(received_at DESC)
    `);
    console.log("✅ Indexes created successfully");

    // Create trigger function for updated_at
    console.log("📋 Creating trigger for updated_at...");
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions
    `);

    await client.query(`
      CREATE TRIGGER update_transactions_updated_at 
        BEFORE UPDATE ON transactions 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log("✅ Trigger created successfully");

    // Add comments to tables
    await client.query(`
      COMMENT ON TABLE transactions IS 'Stores all payment transactions processed through Paystack'
    `);
    await client.query(`
      COMMENT ON TABLE webhook_logs IS 'Logs all webhook events received from Paystack'
    `);

    await client.query("COMMIT");

    console.log("\n🎉 Paystack database setup completed successfully!\n");
    console.log("Tables created:");
    console.log("  ✓ transactions");
    console.log("  ✓ webhook_logs\n");

    // Verify tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('transactions', 'webhook_logs')
      ORDER BY table_name
    `);

    console.log("Verification:");
    tablesResult.rows.forEach((row) => {
      console.log(`  ✓ ${row.table_name} exists`);
    });

    // Show table structure
    console.log("\n📊 Transactions Table Structure:");
    const columnsResult = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'transactions'
      ORDER BY ordinal_position
    `);

    columnsResult.rows.forEach((row) => {
      const nullable = row.is_nullable === "YES" ? "NULL" : "NOT NULL";
      const defaultVal = row.column_default
        ? ` DEFAULT ${row.column_default}`
        : "";
      console.log(
        `  - ${row.column_name.padEnd(20)} ${row.data_type.padEnd(20)} ${nullable}${defaultVal}`,
      );
    });

    // Show foreign key constraints
    console.log("\n🔗 Foreign Key Constraints:");
    const constraints = await client.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'transactions' 
        AND tc.constraint_type = 'FOREIGN KEY'
    `);

    if (constraints.rows.length > 0) {
      constraints.rows.forEach((row) => {
        console.log(
          `  ✓ ${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`,
        );
      });
    } else {
      console.log(
        "  ⚠️  No foreign key constraints (tables may not exist yet)",
      );
    }

    console.log("\n✨ You can now start processing payments!\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error creating Paystack tables:", error.message);
    console.error("Stack:", error.stack);

    // Provide helpful error messages
    if (error.message.includes("foreign key constraint")) {
      console.error("\n💡 Tip: The users or orders table may not exist yet.");
      console.error(
        "   The script will create transactions table without foreign keys.",
      );
      console.error("   You can add them later when those tables exist.");
    }

    process.exit(1);
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  createPaystackTables()
    .then(() => {
      console.log("Setup complete. Exiting...");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
}

module.exports = { createPaystackTables };
