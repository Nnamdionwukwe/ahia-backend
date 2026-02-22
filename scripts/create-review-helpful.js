/**
 * Create review_helpful table
 * Run: node scripts/create-review-helpful.js
 */

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log(
      `\n🔌 Connected to database: ${process.env.DB_NAME} @ ${process.env.DB_HOST || "localhost"}\n`,
    );

    // ── Check that dependency tables exist first ─────────────────
    console.log("🔍 Checking dependency tables...");
    for (const table of ["reviews", "users"]) {
      const { rows } = await client.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables
           WHERE table_name = $1
         ) AS exists`,
        [table],
      );
      if (!rows[0].exists) {
        console.error(
          `  ❌ Table "${table}" does not exist. Create it before running this script.`,
        );
        process.exit(1);
      }
      console.log(`  ✅ ${table} — found`);
    }

    // ── Check if review_helpful already exists ───────────────────
    const { rows: existing } = await client.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
         WHERE table_name = 'review_helpful'
       ) AS exists`,
    );

    if (existing[0].exists) {
      console.log(
        "\n⚠️  review_helpful table already exists — skipping creation.",
      );
      console.log(
        "   Run DROP TABLE review_helpful CASCADE; first if you want to recreate it.\n",
      );
    } else {
      // ── Create the table ───────────────────────────────────────
      console.log("\n🔧 Creating review_helpful table...");
      await client.query(`
        CREATE TABLE review_helpful (
          id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          review_id  UUID        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
          user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (review_id, user_id)
        )
      `);
      console.log("  ✅ review_helpful created");

      // ── Indexes for fast lookups ───────────────────────────────
      console.log("\n🔧 Creating indexes...");
      await client.query(`
        CREATE INDEX idx_review_helpful_review_id ON review_helpful (review_id)
      `);
      console.log("  ✅ idx_review_helpful_review_id");

      await client.query(`
        CREATE INDEX idx_review_helpful_user_id ON review_helpful (user_id)
      `);
      console.log("  ✅ idx_review_helpful_user_id");
    }

    // ── Verify final schema ──────────────────────────────────────
    console.log("\n📋 Final review_helpful schema:");
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'review_helpful'
      ORDER BY ordinal_position
    `);
    cols.forEach((c) =>
      console.log(
        `  ${c.column_name.padEnd(14)} ${c.data_type.padEnd(24)} nullable:${c.is_nullable}${c.column_default ? `  default: ${c.column_default}` : ""}`,
      ),
    );

    // ── Verify constraints ───────────────────────────────────────
    console.log("\n📋 Constraints:");
    const { rows: constraints } = await client.query(`
      SELECT tc.constraint_name, tc.constraint_type,
             kcu.column_name,
             ccu.table_name AS foreign_table,
             ccu.column_name AS foreign_column,
             rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'review_helpful'
      ORDER BY tc.constraint_type
    `);
    constraints.forEach((c) => {
      if (c.constraint_type === "FOREIGN KEY") {
        console.log(
          `  FK  ${c.column_name} → ${c.foreign_table}.${c.foreign_column} ON DELETE ${c.delete_rule}`,
        );
      } else if (c.constraint_type === "UNIQUE") {
        console.log(`  UNIQUE (${c.column_name})`);
      } else if (c.constraint_type === "PRIMARY KEY") {
        console.log(`  PK  ${c.column_name}`);
      }
    });

    console.log("\n🎉 Done!\n");
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
