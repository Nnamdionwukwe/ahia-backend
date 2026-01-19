// server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();

// Middleware FIRST - before any imports that might fail
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false, // Allow Google OAuth embedding
  })
);

// CORS Configuration
const allowedOrigins = [
  "https://ahia-frontend.vercel.app",
  "https://ahia-backend-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:3001",
  "http://localhost:5001",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else if (
        origin.includes("vercel.app") &&
        origin.includes("ahia-frontend")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 600,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.options("*", cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Basic health check FIRST - no dependencies
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API documentation
app.get("/api", (req, res) => {
  res.json({
    message: "E-commerce API - Phase 5",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      products: "/api/products",
      cart: "/api/cart",
      reviews: "/api/reviews",
      orders: "/api/orders",
      wishlist: "/api/wishlist",
      search: "/api/search",
      chat: "/api/chat",
      loyalty: "/api/loyalty",
      notifications: "/api/notifications",
      analytics: "/api/analytics",
      flashSales: "/api/flash-sales",
      seasonalSales: "/api/seasonal-sales",
    },
  });
});

// Try to load database and redis (with error handling)
let db, redis;
try {
  db = require("./src/config/database");
  redis = require("./src/config/redis");
  console.log("✅ Database and Redis configs loaded");
} catch (error) {
  console.error("⚠️  Database/Redis config failed:", error.message);
}

// Enhanced health check with DB/Redis if available
app.get("/health/full", async (req, res) => {
  try {
    let dbStatus = "not available";
    let redisStatus = "not available";
    let elasticsearchStatus = "not configured";

    if (db) {
      try {
        await db.query("SELECT NOW()");
        dbStatus = "connected";
      } catch (e) {
        dbStatus = "error: " + e.message;
      }
    }

    if (redis) {
      redisStatus = redis.isOpen ? "connected" : "disconnected";
    }

    if (process.env.ELASTICSEARCH_URL) {
      try {
        const { Client } = require("@elastic/elasticsearch");
        const esClient = new Client({
          node: process.env.ELASTICSEARCH_URL,
        });
        await esClient.ping();
        elasticsearchStatus = "connected";
      } catch (e) {
        elasticsearchStatus = "error: " + e.message;
      }
    }

    res.json({
      status: "healthy",
      database: dbStatus,
      redis: redisStatus,
      elasticsearch: elasticsearchStatus,
      timestamp: new Date().toISOString(),
      phase: 5,
      version: "1.0.0",
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

// Load routes with error handling
let routes = {};
const routeFiles = [
  { path: "/api/auth", file: "./src/routes/auth", name: "auth" },
  { path: "/api/products", file: "./src/routes/products", name: "products" },
  { path: "/api/cart", file: "./src/routes/cart", name: "cart" },
  { path: "/api/reviews", file: "./src/routes/reviews", name: "reviews" },
  { path: "/api/orders", file: "./src/routes/orders", name: "orders" },
  { path: "/api/wishlist", file: "./src/routes/wishlist", name: "wishlist" },
  {
    path: "/api/flash-sales",
    file: "./src/routes/flashSales",
    name: "flashSales",
  },
  {
    path: "/api/seasonal-sales",
    file: "./src/routes/seasonalSales",
    name: "seasonalSales",
  },
  { path: "/api/search", file: "./src/routes/search", name: "search" },
  { path: "/api/chat", file: "./src/routes/chat", name: "chat" },
  { path: "/api/loyalty", file: "./src/routes/loyalty", name: "loyalty" },
  { path: "/api/fraud", file: "./src/routes/fraud", name: "fraud" },
  {
    path: "/api/notifications",
    file: "./src/routes/notifications",
    name: "notifications",
  },
  {
    path: "/api/analytics",
    file: "./src/routes/analytics",
    name: "analytics",
  },
];

routeFiles.forEach(({ path, file, name }) => {
  try {
    const route = require(file);
    app.use(path, route);
    routes[name] = "loaded";
    console.log(`✅ ${name} routes loaded`);
  } catch (error) {
    routes[name] = "failed: " + error.message;
    console.error(`❌ Failed to load ${name} routes:`, error.message);
  }
});
// Background jobs (only if not in test mode)
if (process.env.NODE_ENV !== "test") {
  try {
    require("./src/jobs/scheduler");
    console.log("✅ Background jobs initialized");
  } catch (error) {
    console.warn("⚠️  Background jobs not available:", error.message);
  }

  if (process.env.ELASTICSEARCH_URL) {
    try {
      require("./src/jobs/searchIndexer");
      console.log("✅ Search indexer initialized");
    } catch (error) {
      console.warn("⚠️  Search indexer not available:", error.message);
    }
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    method: req.method,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

  res.status(err.status || 500).json({
    error: message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("\n🚀 E-commerce API Server");
  console.log("━".repeat(50));
  console.log(`📍 Server:        http://0.0.0.0:${PORT}`);
  console.log(`🏥 Health Check:  http://0.0.0.0:${PORT}/health`);
  console.log(`📚 API Docs:      http://0.0.0.0:${PORT}/api`);
  console.log("━".repeat(50));
  console.log(`🌍 Environment:   ${process.env.NODE_ENV || "development"}`);
  console.log(`🔌 Port:          ${PORT}`);
  console.log("━".repeat(50));
  console.log("\n📦 Loaded Routes:");
  Object.entries(routes).forEach(([name, status]) => {
    console.log(`   ${status === "loaded" ? "✅" : "❌"} ${name}: ${status}`);
  });
  console.log("\n");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n🛑 SIGTERM signal received");

  server.close(() => {
    console.log("✅ HTTP server closed");
  });

  if (db && db.pool) {
    try {
      await db.pool.end();
      console.log("✅ Database connections closed");
    } catch (e) {
      console.error("Error closing database:", e.message);
    }
  }

  if (redis) {
    try {
      await redis.quit();
      console.log("✅ Redis connection closed");
    } catch (e) {
      console.error("Error closing Redis:", e.message);
    }
  }

  process.exit(0);
});

// Catch uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

module.exports = app;
