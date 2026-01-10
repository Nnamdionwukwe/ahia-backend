// src/config/redis.js
const Redis = require("ioredis");
require("dotenv").config();

let redis;

try {
  // Use REDIS_URL if available (Railway provides this)
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("❌ Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 50, 2000);
      },
      lazyConnect: true,
    });
  } else {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 50, 2000);
      },
      lazyConnect: true,
    });
  }

  // Connect
  redis.connect().catch((err) => {
    console.error("❌ Redis connection error:", err.message);
  });

  redis.on("connect", () => console.log("✅ Redis connected"));
  redis.on("error", (err) => console.error("Redis error:", err.message));
  redis.on("ready", () => console.log("✅ Redis ready"));
} catch (error) {
  console.error("❌ Redis initialization failed:", error.message);

  // Create mock redis for graceful degradation
  redis = {
    get: async () => null,
    set: async () => "OK",
    setEx: async () => "OK",
    del: async () => 1,
    incr: async () => 1,
    expire: async () => 1,
    sAdd: async () => 1,
    sIsMember: async () => false,
    sRem: async () => 1,
    zAdd: async () => 1,
    zIncrBy: async () => 1,
    zRevRange: async () => [],
    hSet: async () => 1,
    multi: () => ({
      del: () => {},
      zAdd: () => {},
      exec: async () => [],
    }),
    duplicate: () => redis,
    connect: async () => {},
    subscribe: async () => {},
    publish: async () => 0,
    unsubscribe: async () => {},
    quit: async () => {},
    isOpen: false,
  };
}

module.exports = redis;
