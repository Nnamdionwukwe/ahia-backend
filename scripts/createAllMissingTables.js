const db = require("../src/config/database");

/**
 * Fix fraud_checks and create notification_preferences table
 */

async function fixRemainingTables() {
  const client = await db.pool.connect();

  try {
    console.log("🚀 Fixing remaining tables...\n");

    await client.query("BEGIN");

    // Check user_id type
    const usersTable = await client.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);

    const userIdType =
      usersTable.rows[0].data_type === "uuid" ? "UUID" : "INTEGER";
    console.log(`✅ User ID type: ${userIdType}\n`);

    // Fix 1: Drop and recreate fraud_checks table with correct types
    console.log("📋 Dropping existing fraud_checks table (if exists)...");
    await client.query(`DROP TABLE IF EXISTS fraud_checks CASCADE`);

    console.log("📋 Creating fraud_checks table with correct UUID types...");
    await client.query(`
      CREATE TABLE fraud_checks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id ${userIdType} REFERENCES users(id) ON DELETE SET NULL,
        order_id UUID,
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
        reviewed_by ${userIdType},
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(
      `CREATE INDEX idx_fraud_checks_user_id ON fraud_checks(user_id)`,
    );
    await client.query(
      `CREATE INDEX idx_fraud_checks_order_id ON fraud_checks(order_id)`,
    );
    await client.query(
      `CREATE INDEX idx_fraud_checks_created_at ON fraud_checks(created_at DESC)`,
    );
    await client.query(
      `CREATE INDEX idx_fraud_checks_risk_level ON fraud_checks(risk_level)`,
    );
    console.log("✅ fraud_checks table recreated with UUID support");

    // Fix 2: Update user_risk_profiles to use UUID for id
    console.log("\n📋 Checking user_risk_profiles table...");
    const riskProfilesExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_risk_profiles'
      )
    `);

    if (riskProfilesExists.rows[0].exists) {
      console.log("   Dropping and recreating user_risk_profiles...");
      await client.query(`DROP TABLE IF EXISTS user_risk_profiles CASCADE`);
    }

    await client.query(`
      CREATE TABLE user_risk_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id ${userIdType} UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        current_risk_score INTEGER DEFAULT 0,
        total_fraud_checks INTEGER DEFAULT 0,
        is_whitelisted BOOLEAN DEFAULT false,
        is_blacklisted BOOLEAN DEFAULT false,
        last_check_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX idx_user_risk_profiles_user_id ON user_risk_profiles(user_id)`,
    );
    console.log("✅ user_risk_profiles table recreated");

    // Fix 3: Create notification_preferences table
    console.log("\n📋 Creating notification_preferences table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_id ${userIdType} UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        email_notifications BOOLEAN DEFAULT true,
        push_notifications BOOLEAN DEFAULT true,
        sms_notifications BOOLEAN DEFAULT false,
        order_updates BOOLEAN DEFAULT true,
        marketing_emails BOOLEAN DEFAULT true,
        price_drop_alerts BOOLEAN DEFAULT true,
        restock_alerts BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id 
      ON notification_preferences(user_id)
    `);
    console.log("✅ notification_preferences table created");

    // Fix 4: Update loyalty_transactions to use UUID for id
    console.log("\n📋 Checking loyalty_transactions table...");
    const loyaltyTransExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'loyalty_transactions'
      )
    `);

    if (loyaltyTransExists.rows[0].exists) {
      console.log("   Dropping and recreating loyalty_transactions...");
      await client.query(`DROP TABLE IF EXISTS loyalty_transactions CASCADE`);
    }

    await client.query(`
      CREATE TABLE loyalty_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id ${userIdType} REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER,
        points_amount INTEGER NOT NULL,
        points_used INTEGER DEFAULT 0,
        transaction_type VARCHAR(50) NOT NULL,
        description TEXT,
        reference_id VARCHAR(255),
        order_id UUID,
        expires_at TIMESTAMP,
        expiry_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX idx_loyalty_trans_user_id ON loyalty_transactions(user_id)`,
    );
    await client.query(
      `CREATE INDEX idx_loyalty_trans_created_at ON loyalty_transactions(created_at DESC)`,
    );
    console.log("✅ loyalty_transactions table recreated");

    // Fix 5: Update loyalty_accounts to use UUID for id
    console.log("\n📋 Checking loyalty_accounts table...");
    const loyaltyAccExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'loyalty_accounts'
      )
    `);

    if (loyaltyAccExists.rows[0].exists) {
      console.log("   Dropping and recreating loyalty_accounts...");
      await client.query(`DROP TABLE IF EXISTS loyalty_accounts CASCADE`);
    }

    await client.query(`
      CREATE TABLE loyalty_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id ${userIdType} UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        points_balance INTEGER DEFAULT 0,
        lifetime_points INTEGER DEFAULT 0,
        tier VARCHAR(50) DEFAULT 'bronze',
        tier_expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX idx_loyalty_accounts_user_id ON loyalty_accounts(user_id)`,
    );
    console.log("✅ loyalty_accounts table recreated");

    await client.query("COMMIT");

    console.log("\n🎉 All tables fixed successfully!\n");

    // Verification
    console.log("📊 Verification:");
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'fraud_checks',
        'user_risk_profiles', 
        'notification_preferences',
        'loyalty_transactions',
        'loyalty_accounts'
      )
      ORDER BY table_name
    `);

    tables.rows.forEach((row) => {
      console.log(`  ✓ ${row.table_name}`);
    });

    console.log("\n✨ Your system is now fully configured!\n");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Error fixing tables:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  fixRemainingTables()
    .then(() => {
      console.log("Setup complete. Exiting...");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
}

module.exports = { fixRemainingTables };
