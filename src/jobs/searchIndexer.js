// src/jobs/searchIndexer.js
const cron = require("node-cron");
const db = require("../config/database");
const { Client } = require("@elastic/elasticsearch");

// UPDATED: Use API key authentication
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  auth: {
    apiKey: process.env.ELASTICSEARCH_API_KEY || process.env.ES_PASSWORD,
  },
});

const PRODUCTS_INDEX = "products";

// Index a single product
async function indexProduct(productId) {
  try {
    const product = await db.query(
      `SELECT p.*, s.store_name, s.rating as seller_rating
       FROM products p
       LEFT JOIN sellers s ON p.seller_id = s.id
       WHERE p.id = $1`,
      [productId]
    );

    if (product.rows.length === 0) {
      console.log(`Product ${productId} not found, skipping index`);
      return;
    }

    const doc = product.rows[0];

    await esClient.index({
      index: PRODUCTS_INDEX,
      id: productId,
      body: {
        name: doc.name,
        description: doc.description,
        category: doc.category,
        price: parseFloat(doc.price),
        original_price: parseFloat(doc.original_price || doc.price),
        discount_percentage: parseFloat(doc.discount_percentage || 0),
        brand: doc.brand,
        tags: doc.tags || [],
        rating: parseFloat(doc.rating || 0),
        total_reviews: parseInt(doc.total_reviews || 0),
        stock_quantity: parseInt(doc.stock_quantity || 0),
        images: doc.images,
        store_name: doc.store_name,
        seller_rating: parseFloat(doc.seller_rating || 0),
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      },
    });

    console.log(`✅ Indexed product: ${productId}`);
  } catch (error) {
    console.error(`❌ Failed to index product ${productId}:`, error.message);
  }
}

// Delete a product from index
async function deleteFromIndex(productId) {
  try {
    await esClient.delete({
      index: PRODUCTS_INDEX,
      id: productId,
    });
    console.log(`🗑️  Deleted product from index: ${productId}`);
  } catch (error) {
    if (error.meta?.statusCode !== 404) {
      console.error(`Failed to delete product ${productId}:`, error.message);
    }
  }
}

// Index updated products (every 5 minutes)
cron.schedule("*/5 * * * *", async () => {
  try {
    console.log("🔍 Indexing updated products...");

    // Get products updated in last 5 minutes
    const updated = await db.query(
      `SELECT id FROM products 
       WHERE updated_at > NOW() - INTERVAL '5 minutes'
       AND stock_quantity >= 0`
    );

    if (updated.rows.length === 0) {
      console.log("No updated products to index");
      return;
    }

    let indexed = 0;
    for (const product of updated.rows) {
      await indexProduct(product.id);
      indexed++;
    }

    console.log(`✅ Indexed ${indexed} updated products`);
  } catch (error) {
    console.error("Search indexer error:", error);
  }
});

// Bulk reindex all products (daily at 1 AM)
cron.schedule("0 1 * * *", async () => {
  try {
    console.log("🔄 Starting daily full reindex...");

    const products = await db.query(
      `SELECT p.*, s.store_name, s.rating as seller_rating
       FROM products p
       LEFT JOIN sellers s ON p.seller_id = s.id
       WHERE p.stock_quantity >= 0
       ORDER BY p.updated_at DESC`
    );

    if (products.rows.length === 0) {
      console.log("No products to index");
      return;
    }

    // Bulk index in batches of 500
    const batchSize = 500;
    let totalIndexed = 0;

    for (let i = 0; i < products.rows.length; i += batchSize) {
      const batch = products.rows.slice(i, i + batchSize);
      const operations = batch.flatMap((doc) => [
        { index: { _index: PRODUCTS_INDEX, _id: doc.id } },
        {
          name: doc.name,
          description: doc.description,
          category: doc.category,
          price: parseFloat(doc.price),
          original_price: parseFloat(doc.original_price || doc.price),
          discount_percentage: parseFloat(doc.discount_percentage || 0),
          brand: doc.brand,
          tags: doc.tags || [],
          rating: parseFloat(doc.rating || 0),
          total_reviews: parseInt(doc.total_reviews || 0),
          stock_quantity: parseInt(doc.stock_quantity || 0),
          images: doc.images,
          store_name: doc.store_name,
          seller_rating: parseFloat(doc.seller_rating || 0),
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        },
      ]);

      await esClient.bulk({ operations });
      totalIndexed += batch.length;
      console.log(
        `Indexed ${totalIndexed}/${products.rows.length} products...`
      );
    }

    console.log(`✅ Full reindex complete: ${totalIndexed} products`);
  } catch (error) {
    console.error("Full reindex error:", error);
  }
});

// Clean up deleted products from index (daily at 2 AM)
cron.schedule("0 2 * * *", async () => {
  try {
    console.log("🧹 Cleaning up deleted products from index...");

    // Get all product IDs from Elasticsearch
    const esProducts = await esClient.search({
      index: PRODUCTS_INDEX,
      size: 10000,
      _source: false,
      body: {
        query: { match_all: {} },
      },
    });

    const esProductIds = esProducts.hits.hits.map((hit) => hit._id);

    // Get all product IDs from database
    const dbProducts = await db.query("SELECT id FROM products");
    const dbProductIds = new Set(dbProducts.rows.map((p) => p.id));

    // Find products in ES but not in DB (deleted products)
    const toDelete = esProductIds.filter((id) => !dbProductIds.has(id));

    if (toDelete.length === 0) {
      console.log("No deleted products to clean up");
      return;
    }

    // Delete from index
    for (const productId of toDelete) {
      await deleteFromIndex(productId);
    }

    console.log(`✅ Cleaned up ${toDelete.length} deleted products from index`);
  } catch (error) {
    console.error("Index cleanup error:", error);
  }
});

// Health check - ensure Elasticsearch is available
async function checkElasticsearchHealth() {
  try {
    const health = await esClient.cluster.health();
    console.log(`📊 Elasticsearch health: ${health.status}`);

    // Check if index exists
    const indexExists = await esClient.indices.exists({
      index: PRODUCTS_INDEX,
    });

    if (!indexExists) {
      console.log(`⚠️  Index "${PRODUCTS_INDEX}" does not exist. Creating...`);
      await createIndex();
    } else {
      console.log(`✅ Index "${PRODUCTS_INDEX}" exists`);
    }
  } catch (error) {
    console.error("❌ Elasticsearch health check failed:", error.message);
    console.log("⚠️  Search functionality may not work properly");
  }
}

// Create index with proper mappings
async function createIndex() {
  try {
    await esClient.indices.create({
      index: PRODUCTS_INDEX,
      body: {
        settings: {
          analysis: {
            analyzer: {
              ngram_analyzer: {
                type: "custom",
                tokenizer: "ngram_tokenizer",
                filter: ["lowercase"],
              },
            },
            tokenizer: {
              ngram_tokenizer: {
                type: "ngram",
                min_gram: 2,
                max_gram: 3,
                token_chars: ["letter", "digit"],
              },
            },
          },
        },
        mappings: {
          properties: {
            name: {
              type: "text",
              analyzer: "standard",
              fields: {
                ngram: {
                  type: "text",
                  analyzer: "ngram_analyzer",
                },
                keyword: {
                  type: "keyword",
                },
              },
            },
            description: { type: "text" },
            category: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            price: { type: "float" },
            original_price: { type: "float" },
            discount_percentage: { type: "float" },
            rating: { type: "float" },
            total_reviews: { type: "integer" },
            stock_quantity: { type: "integer" },
            brand: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            tags: { type: "keyword" },
            store_name: { type: "text" },
            seller_rating: { type: "float" },
            created_at: { type: "date" },
            updated_at: { type: "date" },
          },
        },
      },
    });

    console.log(`✅ Created index "${PRODUCTS_INDEX}"`);
  } catch (error) {
    console.error("Failed to create index:", error.message);
  }
}

// Initialize on startup
(async () => {
  console.log("🚀 Search indexer initialized");
  await checkElasticsearchHealth();
})();

// Export functions for manual use
module.exports = {
  indexProduct,
  deleteFromIndex,
  checkElasticsearchHealth,
  createIndex,
};
