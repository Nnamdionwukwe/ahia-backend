// scripts/migrations/fix-notification-preferences-id-type.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log(
      "🔄 Starting migration: Fix notification_preferences ID column...\n",
    );

    await client.query("BEGIN");

    // Check current column type
    const columnInfo = await client.query(`
      SELECT data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'notification_preferences' 
      AND column_name = 'id'
    `);

    console.log("📋 Current ID column info:");
    console.log("  Type:", columnInfo.rows[0]?.data_type);
    console.log("  Default:", columnInfo.rows[0]?.column_default);

    if (columnInfo.rows[0]?.data_type === "integer") {
      console.log(
        "\n⚠️  ID column is INTEGER (SERIAL) - needs conversion to UUID\n",
      );

      // Step 1: Check if table has any data
      const countResult = await client.query(
        "SELECT COUNT(*) as count FROM notification_preferences",
      );
      const rowCount = parseInt(countResult.rows[0].count);
      console.log(`📊 Table has ${rowCount} rows`);

      if (rowCount > 0) {
        console.log("\n⚠️  WARNING: Table has existing data!");
        console.log("   This migration will:");
        console.log("   1. Backup existing data");
        console.log("   2. Drop and recreate table with UUID");
        console.log("   3. Restore data with new UUIDs\n");

        // Backup data
        console.log("💾 Backing up data...");
        const backup = await client.query(
          "SELECT user_id, order_updates, price_drops, flash_sales, restock_alerts, promotions, push_enabled, email_enabled FROM notification_preferences",
        );
        console.log(`✅ Backed up ${backup.rows.length} rows`);

        // Drop table
        console.log("\n🗑️  Dropping old table...");
        await client.query("DROP TABLE notification_preferences CASCADE");
        console.log("✅ Table dropped");

        // Recreate with UUID
        console.log("\n📋 Creating new table with UUID...");
        await client.query(`
          CREATE TABLE notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            order_updates BOOLEAN DEFAULT true,
            price_drops BOOLEAN DEFAULT true,
            flash_sales BOOLEAN DEFAULT true,
            restock_alerts BOOLEAN DEFAULT true,
            promotions BOOLEAN DEFAULT true,
            push_enabled BOOLEAN DEFAULT true,
            email_enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id)
          );
        `);
        console.log("✅ Table recreated with UUID");

        // Restore data
        console.log("\n♻️  Restoring data...");
        for (const row of backup.rows) {
          await client.query(
            `
            INSERT INTO notification_preferences 
            (user_id, order_updates, price_drops, flash_sales, restock_alerts, promotions, push_enabled, email_enabled)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
            [
              row.user_id,
              row.order_updates,
              row.price_drops,
              row.flash_sales,
              row.restock_alerts,
              row.promotions,
              row.push_enabled,
              row.email_enabled,
            ],
          );
        }
        console.log(`✅ Restored ${backup.rows.length} rows`);
      } else {
        console.log("\n📋 Table is empty - safe to recreate\n");

        // Drop and recreate
        await client.query("DROP TABLE notification_preferences CASCADE");
        console.log("✅ Old table dropped");

        await client.query(`
          CREATE TABLE notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            order_updates BOOLEAN DEFAULT true,
            price_drops BOOLEAN DEFAULT true,
            flash_sales BOOLEAN DEFAULT true,
            restock_alerts BOOLEAN DEFAULT true,
            promotions BOOLEAN DEFAULT true,
            push_enabled BOOLEAN DEFAULT true,
            email_enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id)
          );
        `);
        console.log("✅ New table created with UUID");
      }

      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id 
        ON notification_preferences(user_id);
      `);
      console.log("✅ Index created");
    } else if (columnInfo.rows[0]?.data_type === "uuid") {
      console.log("\n✅ ID column is already UUID - no changes needed\n");

      // But let's make sure all columns exist
      const columnsResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'notification_preferences'
      `);

      const existingColumns = columnsResult.rows.map((row) => row.column_name);

      const requiredColumns = {
        order_updates: "BOOLEAN DEFAULT true",
        price_drops: "BOOLEAN DEFAULT true",
        flash_sales: "BOOLEAN DEFAULT true",
        restock_alerts: "BOOLEAN DEFAULT true",
        promotions: "BOOLEAN DEFAULT true",
        push_enabled: "BOOLEAN DEFAULT true",
        email_enabled: "BOOLEAN DEFAULT false",
      };

      console.log("🔍 Checking for missing columns...");
      let missingCount = 0;

      for (const [columnName, columnDef] of Object.entries(requiredColumns)) {
        if (!existingColumns.includes(columnName)) {
          console.log(`➕ Adding column: ${columnName}`);
          await client.query(`
            ALTER TABLE notification_preferences 
            ADD COLUMN ${columnName} ${columnDef};
          `);
          missingCount++;
        }
      }

      if (missingCount > 0) {
        console.log(`✅ Added ${missingCount} missing columns`);
      } else {
        console.log("✅ All required columns present");
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ Migration completed successfully!\n");

    // Show final schema
    const finalSchema = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'notification_preferences'
      ORDER BY ordinal_position;
    `);

    console.log("📋 Final table schema:");
    console.table(finalSchema.rows);

    // Show row count
    const finalCount = await client.query(
      "SELECT COUNT(*) as count FROM notification_preferences",
    );
    console.log(`\n📊 Total rows: ${finalCount.rows[0].count}\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log("✅ Migration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Migration script failed:", error);
    process.exit(1);
  });
