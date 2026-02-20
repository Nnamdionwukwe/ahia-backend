// run-loyalty-migration.js
// Run from your project root: node run-loyalty-migration.js

const db = require("../src/config/database");

const migration = `
-- 1. Loyalty Accounts
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_balance  INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier            VARCHAR(20) NOT NULL DEFAULT 'bronze'
                  CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 2. Loyalty Transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('earn', 'redeem')),
  points_amount    INTEGER NOT NULL,
  points_used      INTEGER NOT NULL DEFAULT 0,
  description      TEXT,
  reference_id     UUID,
  expiry_date      TIMESTAMP WITH TIME ZONE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Loyalty Rewards
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  reward_type    VARCHAR(30) NOT NULL
                 CHECK (reward_type IN ('discount_percentage','discount_fixed','free_shipping','product','voucher')),
  value          NUMERIC(10,2),
  points_cost    INTEGER NOT NULL,
  stock_quantity INTEGER,
  image_url      TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  times_redeemed INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Rewards
CREATE TABLE IF NOT EXISTS user_rewards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id   UUID NOT NULL REFERENCES loyalty_rewards(id),
  code        VARCHAR(20) NOT NULL UNIQUE,
  status      VARCHAR(10) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'used', 'expired')),
  valid_until TIMESTAMP WITH TIME ZONE,
  used_at     TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Referral Codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 6. Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           VARCHAR(10) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'failed')),
  points_awarded   INTEGER DEFAULT 0,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at     TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_user_id    ON loyalty_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_tier       ON loyalty_accounts(tier);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user   ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type   ON loyalty_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expiry ON loyalty_transactions(expiry_date);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active      ON loyalty_rewards(is_active);
CREATE INDEX IF NOT EXISTS idx_user_rewards_user           ON user_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_code           ON user_rewards(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer          ON referrals(referrer_id);

-- Seed rewards
INSERT INTO loyalty_rewards (title, description, reward_type, value, points_cost, is_active)
VALUES
  ('10% Off Next Order',  'Get 10% off your next purchase',        'discount_percentage', 10,   500,  true),
  ('₦500 Off',            '₦500 discount on any order',            'discount_fixed',      500,  1000, true),
  ('Free Shipping',       'Free delivery on your next order',      'free_shipping',       NULL, 750,  true),
  ('20% Off Next Order',  'Get 20% off your next purchase',        'discount_percentage', 20,   1500, true),
  ('₦2000 Off',           '₦2000 discount on orders over ₦10,000', 'discount_fixed',      2000, 3000, true)
ON CONFLICT DO NOTHING;
`;

async function run() {
  console.log("🚀 Running loyalty migration...\n");

  const steps = [
    "loyalty_accounts",
    "loyalty_transactions",
    "loyalty_rewards",
    "user_rewards",
    "referral_codes",
    "referrals",
    "indexes",
    "seed rewards",
  ];

  try {
    await db.query(migration);
    console.log("✅ All tables created successfully\n");

    // Verify each table exists
    const tables = [
      "loyalty_accounts",
      "loyalty_transactions",
      "loyalty_rewards",
      "user_rewards",
      "referral_codes",
      "referrals",
    ];

    console.log("📋 Verifying tables:");
    for (const table of tables) {
      const result = await db.query(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const exists = parseInt(result.rows[0].count) > 0;
      console.log(`   ${exists ? "✅" : "❌"} ${table}`);
    }

    // Check seed data
    const rewards = await db.query(
      "SELECT COUNT(*) as count FROM loyalty_rewards",
    );
    console.log(`\n🎁 Rewards in catalog: ${rewards.rows[0].count}`);

    console.log("\n✅ Migration complete! You can now restart your server.\n");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  } finally {
    if (db.pool) await db.pool.end();
    process.exit(0);
  }
}

run();
