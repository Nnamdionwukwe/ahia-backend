// scripts/migrate-addresses-table.js
/**
 * Migration Script: Add missing columns to addresses table
 * Run with: node scripts/migrate-addresses-table.js
 */

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

async function migrateAddressesTable() {
  const client = await pool.connect();

  try {
    console.log("🔍 Checking addresses table structure...");

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'addresses'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Table "addresses" does not exist. Creating it...');

      // Create table with all columns
      await client.query(`
        CREATE TABLE IF NOT EXISTS addresses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          address_line1 VARCHAR(255) NOT NULL,
          address_line2 VARCHAR(255),
          city VARCHAR(100) NOT NULL,
          state VARCHAR(100) NOT NULL,
          country VARCHAR(100) NOT NULL DEFAULT 'Nigeria',
          postal_code VARCHAR(20),
          is_default BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
      `);

      console.log("✅ Created addresses table with all columns");
      return;
    }

    console.log("✅ Table exists, checking columns...");

    // Get existing columns
    const columnsResult = await client.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'addresses';
    `);

    const existingColumns = columnsResult.rows.map((row) => row.column_name);
    console.log("📋 Existing columns:", existingColumns);

    // Define required columns
    const requiredColumns = [
      { name: "address_line1", type: "VARCHAR(255)", nullable: false },
      { name: "address_line2", type: "VARCHAR(255)", nullable: true },
      { name: "city", type: "VARCHAR(100)", nullable: false },
      { name: "state", type: "VARCHAR(100)", nullable: false },
      {
        name: "country",
        type: "VARCHAR(100)",
        nullable: false,
        default: "'Nigeria'",
      },
      { name: "postal_code", type: "VARCHAR(20)", nullable: true },
      { name: "is_default", type: "BOOLEAN", nullable: true, default: "false" },
    ];

    // Add missing columns
    for (const column of requiredColumns) {
      if (!existingColumns.includes(column.name)) {
        console.log(`➕ Adding column: ${column.name}`);

        let alterQuery = `ALTER TABLE addresses ADD COLUMN ${column.name} ${column.type}`;

        if (!column.nullable) {
          // For NOT NULL columns, first add as nullable, update data, then set NOT NULL
          alterQuery += ";";
          await client.query(alterQuery);

          // Set default value for existing rows
          if (column.default) {
            await client.query(
              `UPDATE addresses SET ${column.name} = ${column.default} WHERE ${column.name} IS NULL;`,
            );
          } else if (column.name === "address_line1") {
            await client.query(
              `UPDATE addresses SET ${column.name} = 'Not specified' WHERE ${column.name} IS NULL;`,
            );
          } else if (column.name === "city" || column.name === "state") {
            await client.query(
              `UPDATE addresses SET ${column.name} = 'Unknown' WHERE ${column.name} IS NULL;`,
            );
          }

          // Now set NOT NULL
          await client.query(
            `ALTER TABLE addresses ALTER COLUMN ${column.name} SET NOT NULL;`,
          );
          console.log(`✅ Added ${column.name} (NOT NULL)`);
        } else {
          if (column.default) {
            alterQuery += ` DEFAULT ${column.default}`;
          }
          alterQuery += ";";
          await client.query(alterQuery);
          console.log(`✅ Added ${column.name}`);
        }
      } else {
        console.log(`✓ Column ${column.name} already exists`);
      }
    }

    // Create index if it doesn't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
    `);

    console.log("\n🎉 Migration completed successfully!");
    console.log("\n📊 Final table structure:");

    const finalColumns = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'addresses'
      ORDER BY ordinal_position;
    `);

    console.table(finalColumns.rows);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrateAddressesTable()
  .then(() => {
    console.log("\n✅ All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration error:", error);
    process.exit(1);
  });
