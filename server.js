// server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

// Import config
const db = require("./src/config/database");
const redis = require("./src/config/redis");

// Import Phase 1-4 routes
const authRoutes = require("./src/routes/auth");
const productRoutes = require("./src/routes/products");
const cartRoutes = require("./src/routes/cart");
const reviewRoutes = require("./src/routes/reviews");
const orderRoutes = require("./src/routes/orders");
const wishlistRoutes = require("./src/routes/wishlist");
const flashSalesRoutes = require("./src/routes/flashSales");

// Import Phase 5 routes
const searchRoutes = require("./src/routes/search");
const chatRoutes = require("./src/routes/chat");
const loyaltyRoutes = require("./src/routes/loyalty");
const fraudRoutes = require("./src/routes/fraud");
const notificationsRoutes = require("./src/routes/notifications");
const analyticsRoutes = require("./src/routes/analytics");

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      "https://ahia-frontend-git-main-nnamdi-michaels-projects.vercel.app",
      "https://ahia-backend-production.up.railway.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:3001",
      "http://localhost:5001",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", async (req, res) => {
  try {
    const dbCheck = await db.query("SELECT NOW()");

    // Check Elasticsearch if available
    let elasticsearchStatus = "not configured";
    try {
      const { Client } = require("@elastic/elasticsearch");
      const esClient = new Client({
        node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
      });
      await esClient.ping();
      elasticsearchStatus = "connected";
    } catch (e) {
      elasticsearchStatus = "disconnected";
    }

    res.json({
      status: "healthy",
      database: "connected",
      redis: redis.isOpen ? "connected" : "disconnected",
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

// API documentation endpoint
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
      fraud: "/api/fraud (admin only)",
    },
    documentation: "https://your-docs-url.com",
  });
});

// =============================================
// PHASE 1-4 ROUTES
// =============================================
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/flash-sales", flashSalesRoutes);

// =============================================
// PHASE 5 ROUTES
// =============================================
app.use("/api/search", searchRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/analytics", analyticsRoutes);

// =============================================
// BACKGROUND JOBS (only in production/non-test)
// =============================================
if (process.env.NODE_ENV !== "test") {
  // Start background job schedulers
  try {
    require("./src/jobs/scheduler");
    console.log("✅ Background jobs initialized");
  } catch (error) {
    console.warn("⚠️  Background jobs not available:", error.message);
  }

  // Start Elasticsearch indexer (if configured)
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

  // Don't expose internal errors in production
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

app.listen(PORT, () => {
  console.log("\n🚀 E-commerce API Server");
  console.log("━".repeat(50));
  console.log(`📍 Server:        http://localhost:${PORT}`);
  console.log(`🏥 Health Check:  http://localhost:${PORT}/health`);
  console.log(`📚 API Docs:      http://localhost:${PORT}/api`);
  console.log("━".repeat(50));
  console.log(`🌍 Environment:   ${process.env.NODE_ENV || "development"}`);
  console.log(`📊 Database:      ${process.env.DB_HOST || "localhost"}`);
  console.log(`🔴 Redis:         ${process.env.REDIS_HOST || "localhost"}`);
  console.log(
    `🔍 Elasticsearch: ${process.env.ELASTICSEARCH_URL || "not configured"}`
  );
  console.log("━".repeat(50));
  console.log("\n✨ Phase 5 Features Active:");
  console.log("   • Advanced Search with Elasticsearch");
  console.log("   • Real-time Chat Support");
  console.log("   • Loyalty & Rewards Program");
  console.log("   • Fraud Detection System");
  console.log("   • Advanced Analytics");
  console.log("   • Real-time Notifications\n");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n🛑 SIGTERM signal received: closing HTTP server");

  // Close database connections
  await db.pool.end();
  console.log("✅ Database connections closed");

  // Close Redis connection
  await redis.quit();
  console.log("✅ Redis connection closed");

  process.exit(0);
});

module.exports = app; // For testing
