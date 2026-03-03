// scripts/seed.js
// Run: node scripts/seed.js
// Or:  node scripts/seed.js --clean   (drops and recreates all data)

require("dotenv").config();
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

const isRailway = process.env.DATABASE_URL?.includes("railway.app");
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction || isRailway ? { rejectUnauthorized: false } : false,
  max: 5,
  connectionTimeoutMillis: 10000,
});

const db = { query: (text, params) => pool.query(text, params) };
const CLEAN = process.argv.includes("--clean");

const USERS = [
  {
    name: "Amara Okonkwo",
    email: "amara@example.com",
    phone: "+2348011111111",
  },
  { name: "Chidi Eze", email: "chidi@example.com", phone: "+2348022222222" },
  {
    name: "Fatima Bello",
    email: "fatima@example.com",
    phone: "+2348033333333",
  },
  { name: "Emeka Nwosu", email: "emeka@example.com", phone: "+2348044444444" },
  {
    name: "Ngozi Adeyemi",
    email: "ngozi@example.com",
    phone: "+2348055555555",
  },
];

const PRODUCTS = [
  {
    name: "Portable Monitor 15.6 Inch 1080P USB-C",
    category: "Electronics",
    description: "Full HD portable display with USB-C and HDMI connectivity.",
    variants: [
      { color: "Black", size: null, base_price: 98837, discount_percentage: 0 },
      {
        color: "Silver",
        size: null,
        base_price: 104500,
        discount_percentage: 5,
      },
    ],
  },
  {
    name: "Wireless Noise-Cancelling Headphones",
    category: "Electronics",
    description:
      "30-hour battery life, active noise cancellation, foldable design.",
    variants: [
      {
        color: "Black",
        size: null,
        base_price: 55000,
        discount_percentage: 10,
      },
      {
        color: "White",
        size: null,
        base_price: 55000,
        discount_percentage: 10,
      },
    ],
  },
  {
    name: "Men's Slim-Fit Ankara Shirt",
    category: "Fashion",
    description: "Premium hand-dyed Ankara fabric, slim fit, long sleeve.",
    variants: [
      {
        color: "Blue/Orange",
        size: "S",
        base_price: 12500,
        discount_percentage: 0,
      },
      {
        color: "Blue/Orange",
        size: "M",
        base_price: 12500,
        discount_percentage: 0,
      },
      {
        color: "Blue/Orange",
        size: "L",
        base_price: 12500,
        discount_percentage: 0,
      },
      {
        color: "Red/Gold",
        size: "M",
        base_price: 13000,
        discount_percentage: 5,
      },
    ],
  },
  {
    name: "Non-stick Granite Cookware Set (5-piece)",
    category: "Home & Kitchen",
    description: "Granite-coated pots and pans, induction-compatible.",
    variants: [
      { color: "Grey", size: null, base_price: 34900, discount_percentage: 15 },
      {
        color: "Copper",
        size: null,
        base_price: 37500,
        discount_percentage: 10,
      },
    ],
  },
  {
    name: "Kids' Educational Tablet 7 Inch",
    category: "Electronics",
    description:
      "Android 11, parental controls, 32 GB storage, shockproof case.",
    variants: [
      { color: "Pink", size: null, base_price: 41000, discount_percentage: 0 },
      { color: "Blue", size: null, base_price: 41000, discount_percentage: 0 },
      { color: "Green", size: null, base_price: 41000, discount_percentage: 5 },
    ],
  },
  {
    name: "Luxury Perfume Gift Set",
    category: "Beauty",
    description: "Set of 3 x 50 ml Eau de Parfum with presentation box.",
    variants: [
      {
        color: "Gold Edition",
        size: null,
        base_price: 28000,
        discount_percentage: 0,
      },
      {
        color: "Silver Edition",
        size: null,
        base_price: 24500,
        discount_percentage: 10,
      },
    ],
  },
];

const RETURN_REASONS = [
  "wrong_item",
  "damaged",
  "not_as_described",
  "changed_mind",
  "missing_item",
  "other",
];
const RETURN_METHODS = ["original_payment", "store_credit", "bank_transfer"];
const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randN = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000);
function log(msg) {
  console.log("  \u2713 " + msg);
}
function warn(msg) {
  console.warn("  \u26a0 " + msg);
}
function section(title) {
  console.log("\n" + "-".repeat(50) + "\n  " + title + "\n" + "-".repeat(50));
}

async function createSchema() {
  section("Creating / verifying schema");

  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT, email TEXT UNIQUE NOT NULL, phone_number TEXT,
    password_hash TEXT, role TEXT NOT NULL DEFAULT 'customer',
    is_verified BOOLEAN DEFAULT true, signup_method TEXT DEFAULT 'phone',
    profile_image TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("users");

  await db.query(`CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, category TEXT NOT NULL, description TEXT,
    price NUMERIC(12,2) NOT NULL DEFAULT 0, original_price NUMERIC(12,2),
    discount_percentage NUMERIC(5,2) DEFAULT 0, stock_quantity INT DEFAULT 0,
    rating NUMERIC(3,1) DEFAULT 0, brand TEXT, tags TEXT[] DEFAULT '{}',
    images JSONB DEFAULT '[]'::jsonb, seller_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("products");

  await db.query(`CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    color TEXT, size TEXT, base_price NUMERIC(12,2) NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0, stock_quantity INT DEFAULT 100,
    sku TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("product_variants");

  await db.query(`CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_amount NUMERIC(12,2) NOT NULL, discount_amount NUMERIC(12,2) DEFAULT 0,
    delivery_address JSONB, status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT NOT NULL DEFAULT 'card', payment_status TEXT NOT NULL DEFAULT 'paid',
    estimated_delivery TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("orders");

  await db.query(`CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INT NOT NULL DEFAULT 1, unit_price NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("order_items");

  await db.query(`CREATE TABLE IF NOT EXISTS order_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL, details TEXT, status TEXT NOT NULL DEFAULT 'pending',
    refund_method TEXT NOT NULL DEFAULT 'original_payment', refund_amount NUMERIC(12,2),
    admin_note TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(), resolved_at TIMESTAMPTZ
  )`);
  log("order_returns");

  await db.query(`CREATE TABLE IF NOT EXISTS carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INT DEFAULT 1, is_selected BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("carts");

  await db.query(`CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, discount_percentage NUMERIC(5,2) NOT NULL,
    expiry_date TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("promotions");

  await db.query(`CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL DEFAULT '',
    status TEXT DEFAULT 'pending', points_awarded INT DEFAULT 0,
    completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  log("referrals");
}

async function cleanData() {
  section("Cleaning existing seed data");
  const tables = [
    "order_returns",
    "order_items",
    "carts",
    "orders",
    "product_variants",
    "products",
    "referrals",
    "promotions",
    "users",
  ];
  for (const t of tables) {
    await db.query("DELETE FROM " + t);
    log("cleared " + t);
  }
}

async function seedUsers() {
  section("Seeding users");
  const hash = await bcrypt.hash("Password123!", 10);
  const ids = [];
  for (const u of USERS) {
    const res = await db.query(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role)
       VALUES ($1,$2,$3,$4,'customer')
       ON CONFLICT (email) DO UPDATE
         SET full_name=EXCLUDED.full_name, phone_number=EXCLUDED.phone_number, password_hash=EXCLUDED.password_hash
       RETURNING id`,
      [u.name, u.email, u.phone, hash],
    );
    ids.push(res.rows[0].id);
    log("user: " + u.name + " <" + u.email + ">");
  }
  await db.query(
    `INSERT INTO users (full_name, email, phone_number, password_hash, role)
     VALUES ('Admin User','admin@ahia.ng','+2348099999999',$1,'admin')
     ON CONFLICT (email) DO UPDATE SET role='admin', password_hash=EXCLUDED.password_hash`,
    [hash],
  );
  log("user: Admin User <admin@ahia.ng>");
  return ids;
}

async function seedProducts() {
  section("Seeding products & variants");
  const variantIds = [];
  for (const p of PRODUCTS) {
    const minPrice = Math.min(
      ...p.variants.map(
        (v) => v.base_price - v.base_price * (v.discount_percentage / 100),
      ),
    );
    const maxPrice = Math.max(...p.variants.map((v) => v.base_price));
    const avgDisc =
      p.variants.reduce((s, v) => s + v.discount_percentage, 0) /
      p.variants.length;
    const prodRes = await db.query(
      `INSERT INTO products (name,category,description,images,price,original_price,discount_percentage,stock_quantity,rating,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING id`,
      [
        p.name,
        p.category,
        p.description,
        JSON.stringify(["/placeholder.png"]),
        minPrice.toFixed(2),
        maxPrice.toFixed(2),
        avgDisc.toFixed(2),
        randN(20, 200),
        (3.5 + Math.random() * 1.5).toFixed(1),
      ],
    );
    const productId = prodRes.rows[0].id;
    log("product: " + p.name);
    for (const v of p.variants) {
      const sku =
        p.category.slice(0, 3).toUpperCase() +
        "-" +
        uuidv4().slice(0, 6).toUpperCase();
      const varRes = await db.query(
        `INSERT INTO product_variants (product_id,color,size,base_price,discount_percentage,stock_quantity,sku)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          productId,
          v.color,
          v.size,
          v.base_price,
          v.discount_percentage,
          randN(10, 100),
          sku,
        ],
      );
      variantIds.push({ id: varRes.rows[0].id, ...v });
      log(
        "  variant: " +
          (v.color || "") +
          (v.size ? " / " + v.size : "") +
          " - N" +
          v.base_price.toLocaleString(),
      );
    }
  }
  return variantIds;
}

async function seedPromotions() {
  section("Seeding promotions");
  const promos = [
    {
      code: "WELCOME10",
      discount_percentage: 10,
      expiry_date: daysFromNow(90),
    },
    { code: "AHIA20", discount_percentage: 20, expiry_date: daysFromNow(30) },
    {
      code: "FESTIVE15",
      discount_percentage: 15,
      expiry_date: daysFromNow(14),
    },
    { code: "EXPIRED5", discount_percentage: 5, expiry_date: daysAgo(10) },
  ];
  for (const p of promos) {
    await db.query(
      `INSERT INTO promotions (code,discount_percentage,expiry_date) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
      [p.code, p.discount_percentage, p.expiry_date],
    );
    log("promo: " + p.code);
  }
}

async function seedOrders(userIds, variants) {
  section("Seeding orders & order items");
  const deliveredOrders = [];
  const addresses = [
    {
      street: "14 Adeola Odeku St",
      city: "Victoria Island",
      state: "Lagos",
      country: "Nigeria",
    },
    {
      street: "22 Wuse Zone 5",
      city: "Abuja",
      state: "FCT",
      country: "Nigeria",
    },
    {
      street: "5 Ogui Road",
      city: "Enugu",
      state: "Enugu",
      country: "Nigeria",
    },
    {
      street: "10 Trans Amadi",
      city: "Port Harcourt",
      state: "Rivers",
      country: "Nigeria",
    },
    {
      street: "31 Ahmadu Bello Way",
      city: "Kano",
      state: "Kano",
      country: "Nigeria",
    },
  ];
  for (const userId of userIds) {
    for (let i = 0; i < 4; i++) {
      const orderId = uuidv4();
      const status = rand(ORDER_STATUSES);
      const createdAt = daysAgo(randN(5, 60));
      const estimatedDelivery = daysFromNow(randN(2, 7));
      const paymentMethod = rand(["card", "bank_transfer", "ussd", "wallet"]);
      const address = rand(addresses);
      const chosen = [...variants]
        .sort(() => Math.random() - 0.5)
        .slice(0, randN(1, 3));
      let total = 0,
        discount = 0;
      const lineItems = chosen.map((v) => {
        const disc = v.base_price * (v.discount_percentage / 100);
        const unit = v.base_price - disc;
        const qty = randN(1, 2);
        const sub = unit * qty;
        total += sub;
        discount += disc * qty;
        return { variantId: v.id, qty, unit, sub };
      });
      if (Math.random() < 0.3) {
        const x = total * 0.1;
        discount += x;
        total -= x;
      }
      await db.query(
        `INSERT INTO orders (id,user_id,total_amount,discount_amount,delivery_address,status,payment_method,payment_status,estimated_delivery,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'paid',$8,$9,$9)`,
        [
          orderId,
          userId,
          total.toFixed(2),
          discount.toFixed(2),
          JSON.stringify(address),
          status,
          paymentMethod,
          estimatedDelivery,
          createdAt,
        ],
      );
      for (const li of lineItems) {
        await db.query(
          `INSERT INTO order_items (id,order_id,product_variant_id,quantity,unit_price,subtotal,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            uuidv4(),
            orderId,
            li.variantId,
            li.qty,
            li.unit.toFixed(2),
            li.sub.toFixed(2),
            createdAt,
          ],
        );
      }
      if (status === "delivered" || status === "return_requested") {
        deliveredOrders.push({
          orderId,
          userId,
          totalAmount: total,
          createdAt,
        });
      }
      log(
        "order " +
          orderId.slice(0, 8) +
          "... [" +
          status +
          "] N" +
          total.toFixed(0),
      );
    }
  }
  return deliveredOrders;
}

async function seedReturns(deliveredOrders) {
  section("Seeding return requests");
  if (!deliveredOrders.length) {
    warn("No delivered orders - skipping");
    return;
  }
  for (const { orderId, userId, totalAmount, createdAt } of deliveredOrders) {
    if (Math.random() > 0.7) continue;
    const returnId = uuidv4();
    const reason = rand(RETURN_REASONS);
    const method = rand(RETURN_METHODS);
    const status = rand(["pending", "approved", "rejected", "completed"]);
    const returnedAt = new Date(
      new Date(createdAt).getTime() + randN(1, 15) * 86_400_000,
    );
    const resolvedAt = ["rejected", "completed"].includes(status)
      ? new Date(returnedAt.getTime() + randN(2, 5) * 86_400_000)
      : null;
    const adminNote = {
      rejected: "Return did not meet policy.",
      completed: "Refund processed.",
      approved: null,
      pending: null,
    }[status];
    const details =
      reason === "damaged"
        ? "Product arrived with cracked screen."
        : reason === "wrong_item"
          ? "Received wrong variant."
          : null;
    await db.query(
      `INSERT INTO order_returns (id,order_id,user_id,reason,details,status,refund_method,refund_amount,admin_note,created_at,updated_at,resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)`,
      [
        returnId,
        orderId,
        userId,
        reason,
        details,
        status,
        method,
        totalAmount.toFixed(2),
        adminNote,
        returnedAt,
        resolvedAt,
      ],
    );
    log("return " + returnId.slice(0, 8) + "... [" + status + "] " + reason);
  }
}

async function seedCarts(userIds, variants) {
  section("Seeding carts");
  for (const userId of userIds.slice(0, 2)) {
    const picks = [...variants]
      .sort(() => Math.random() - 0.5)
      .slice(0, randN(1, 3));
    for (const v of picks) {
      await db.query(
        `INSERT INTO carts (user_id,product_variant_id,quantity,is_selected) VALUES ($1,$2,$3,true) ON CONFLICT DO NOTHING`,
        [userId, v.id, randN(1, 2)],
      );
      log("cart: " + userId.slice(0, 8) + "... -> " + v.id.slice(0, 8) + "...");
    }
  }
}

async function seedReferrals(userIds) {
  section("Seeding referrals");
  for (let i = 1; i <= 2; i++) {
    const code = "AHIA-" + uuidv4().slice(0, 8).toUpperCase();
    await db.query(
      `INSERT INTO referrals (referrer_id,referred_user_id,referral_code,status,points_awarded,completed_at)
       VALUES ($1,$2,$3,'completed',500,NOW())`,
      [userIds[0], userIds[i], code],
    );
    log("referral: user[0] -> user[" + i + "] (" + code + ")");
  }
}

async function printSummary() {
  section("Seed summary");
  for (const t of [
    "users",
    "products",
    "product_variants",
    "orders",
    "order_items",
    "order_returns",
    "carts",
    "promotions",
  ]) {
    const res = await db.query("SELECT COUNT(*) FROM " + t);
    log(t + ": " + res.rows[0].count + " rows");
  }
  console.log(
    "\n  Test credentials (password: Password123!)\n  amara@example.com / admin@ahia.ng\n",
  );
}

async function main() {
  console.log("\n Ahia DB Seeder");
  console.log("   Mode: " + (CLEAN ? "CLEAN" : "UPSERT"));
  console.log(
    "   DB  : " +
      (process.env.DATABASE_URL || "").replace(/:[^:@]+@/, ":***@") +
      "\n",
  );
  try {
    await createSchema();
    if (CLEAN) await cleanData();
    const userIds = await seedUsers();
    const variants = await seedProducts();
    await seedPromotions();
    const delivered = await seedOrders(userIds, variants);
    await seedReturns(delivered);
    await seedCarts(userIds, variants);
    await seedReferrals(userIds);
    await printSummary();
    console.log("\n Seeding complete!\n");
  } catch (err) {
    console.error("\n Seeding failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
