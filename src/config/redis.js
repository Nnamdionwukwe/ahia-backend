// src/config/redis.js
const redis = require("redis");
require("dotenv").config();

const client = redis.createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

client.on("error", (err) => console.error("Redis Client Error", err));
client.on("connect", () => console.log("✓ Redis connected"));

client.connect().catch(console.error);

module.exports = client;
