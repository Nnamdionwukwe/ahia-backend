// src/controllers/searchController.js
const { Client } = require("@elastic/elasticsearch");
const db = require("../config/database");
const redis = require("../config/redis");

// UPDATED: Use API key authentication instead of username/password
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  auth: {
    apiKey: process.env.ELASTICSEARCH_API_KEY || process.env.ES_PASSWORD,
  },
});

const PRODUCTS_INDEX = "products";

// Advanced search with filters and facets
exports.advancedSearch = async (req, res) => {
  try {
    const {
      q,
      category,
      minPrice,
      maxPrice,
      rating,
      inStock = true,
      sort = "relevance",
      page = 1,
      limit = 20,
    } = req.query;

    const from = (page - 1) * limit;

    // Build Elasticsearch query
    const must = [];
    const filter = [];

    // Text search with multi-field matching
    if (q) {
      must.push({
        multi_match: {
          query: q,
          fields: [
            "name^3", // Boost name matches
            "description^2",
            "category",
            "tags",
            "brand",
          ],
          type: "best_fields",
          fuzziness: "AUTO", // Handle typos
        },
      });
    }

    // Filters
    if (category) {
      filter.push({ term: { "category.keyword": category } });
    }

    if (minPrice || maxPrice) {
      const range = {};
      if (minPrice) range.gte = parseFloat(minPrice);
      if (maxPrice) range.lte = parseFloat(maxPrice);
      filter.push({ range: { price: range } });
    }

    if (rating) {
      filter.push({ range: { rating: { gte: parseFloat(rating) } } });
    }

    if (inStock === "true") {
      filter.push({ range: { stock_quantity: { gt: 0 } } });
    }

    // Sorting
    let sortOption;
    switch (sort) {
      case "price_asc":
        sortOption = [{ price: "asc" }];
        break;
      case "price_desc":
        sortOption = [{ price: "desc" }];
        break;
      case "rating":
        sortOption = [{ rating: "desc" }, { total_reviews: "desc" }];
        break;
      case "newest":
        sortOption = [{ created_at: "desc" }];
        break;
      case "popular":
        sortOption = [{ total_reviews: "desc" }, { rating: "desc" }];
        break;
      default: // relevance
        sortOption = ["_score"];
    }

    // Execute search with aggregations
    const result = await esClient.search({
      index: PRODUCTS_INDEX,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort: sortOption,
        aggs: {
          categories: {
            terms: { field: "category.keyword", size: 20 },
          },
          price_ranges: {
            range: {
              field: "price",
              ranges: [
                { to: 50, key: "Under $50" },
                { from: 50, to: 100, key: "$50 - $100" },
                { from: 100, to: 200, key: "$100 - $200" },
                { from: 200, to: 500, key: "$200 - $500" },
                { from: 500, key: "Over $500" },
              ],
            },
          },
          ratings: {
            range: {
              field: "rating",
              ranges: [
                { from: 4, key: "4★ & up" },
                { from: 3, key: "3★ & up" },
                { from: 2, key: "2★ & up" },
              ],
            },
          },
          brands: {
            terms: { field: "brand.keyword", size: 15 },
          },
          avg_price: {
            avg: { field: "price" },
          },
          min_price: {
            min: { field: "price" },
          },
          max_price: {
            max: { field: "price" },
          },
        },
        highlight: {
          fields: {
            name: {},
            description: {},
          },
        },
      },
    });

    // Format results
    const products = result.hits.hits.map((hit) => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
      highlights: hit.highlight,
    }));

    res.json({
      query: q,
      total: result.hits.total.value,
      products,
      facets: {
        categories: result.aggregations.categories.buckets,
        priceRanges: result.aggregations.price_ranges.buckets,
        ratings: result.aggregations.ratings.buckets,
        brands: result.aggregations.brands.buckets,
        priceStats: {
          avg: result.aggregations.avg_price.value,
          min: result.aggregations.min_price.value,
          max: result.aggregations.max_price.value,
        },
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.hits.total.value,
        pages: Math.ceil(result.hits.total.value / limit),
      },
    });

    // Track search for analytics
    if (q) {
      await trackSearchQuery(q, result.hits.total.value);
    }
  } catch (error) {
    console.error("Advanced search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
};

// Autocomplete suggestions
exports.autocomplete = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    // Check cache first
    const cacheKey = `autocomplete:${q.toLowerCase()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const result = await esClient.search({
      index: PRODUCTS_INDEX,
      body: {
        size: 10,
        query: {
          bool: {
            should: [
              {
                match_phrase_prefix: {
                  name: {
                    query: q,
                    boost: 3,
                  },
                },
              },
              {
                match: {
                  "name.ngram": {
                    query: q,
                    boost: 2,
                  },
                },
              },
              {
                match: {
                  category: {
                    query: q,
                    boost: 1,
                  },
                },
              },
            ],
          },
        },
        _source: ["name", "category", "price", "images"],
        aggs: {
          categories: {
            terms: { field: "category.keyword", size: 5 },
          },
        },
      },
    });

    const suggestions = {
      products: result.hits.hits.map((hit) => hit._source),
      categories: result.aggregations.categories.buckets.map((b) => b.key),
    };

    // Cache for 5 minutes
    await redis.setEx(cacheKey, 300, JSON.stringify(suggestions));

    res.json(suggestions);
  } catch (error) {
    console.error("Autocomplete error:", error);
    res.status(500).json({ error: "Autocomplete failed" });
  }
};

// Search suggestions (did you mean?)
exports.searchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;

    const result = await esClient.search({
      index: PRODUCTS_INDEX,
      body: {
        suggest: {
          product_suggestion: {
            text: q,
            term: {
              field: "name",
              suggest_mode: "popular",
              min_word_length: 3,
            },
          },
          phrase_suggestion: {
            text: q,
            phrase: {
              field: "name.trigram",
              size: 3,
              gram_size: 3,
              direct_generator: [
                {
                  field: "name.trigram",
                  suggest_mode: "always",
                },
              ],
            },
          },
        },
      },
    });

    const suggestions = new Set();

    // Collect term suggestions
    result.suggest.product_suggestion.forEach((suggestion) => {
      suggestion.options.forEach((option) => {
        suggestions.add(option.text);
      });
    });

    // Collect phrase suggestions
    result.suggest.phrase_suggestion.forEach((suggestion) => {
      suggestion.options.forEach((option) => {
        suggestions.add(option.text);
      });
    });

    res.json({
      originalQuery: q,
      suggestions: Array.from(suggestions),
    });
  } catch (error) {
    console.error("Search suggestions error:", error);
    res.status(500).json({ error: "Failed to get suggestions" });
  }
};

// Similar products using More Like This
exports.findSimilarProducts = async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = req.query.limit || 10;

    // Get product details from DB first
    const product = await db.query(
      "SELECT name, description, category FROM products WHERE id = $1",
      [productId]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const result = await esClient.search({
      index: PRODUCTS_INDEX,
      body: {
        size: limit,
        query: {
          bool: {
            must: [
              {
                more_like_this: {
                  fields: ["name", "description", "category", "tags"],
                  like: [
                    {
                      _index: PRODUCTS_INDEX,
                      _id: productId,
                    },
                  ],
                  min_term_freq: 1,
                  max_query_terms: 12,
                },
              },
            ],
            must_not: [{ term: { _id: productId } }],
            filter: [{ range: { stock_quantity: { gt: 0 } } }],
          },
        },
      },
    });

    const similar = result.hits.hits.map((hit) => ({
      id: hit._id,
      ...hit._source,
      similarity_score: hit._score,
    }));

    res.json({ products: similar });
  } catch (error) {
    console.error("Find similar products error:", error);
    res.status(500).json({ error: "Failed to find similar products" });
  }
};

// Index/Reindex products
exports.indexProduct = async (productId) => {
  try {
    const product = await db.query(
      `SELECT p.*, s.store_name, s.rating as seller_rating
       FROM products p
       LEFT JOIN sellers s ON p.seller_id = s.id
       WHERE p.id = $1`,
      [productId]
    );

    if (product.rows.length === 0) {
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
      refresh: true,
    });

    console.log(`Indexed product: ${productId}`);
  } catch (error) {
    console.error("Index product error:", error);
  }
};

// Bulk reindex all products
exports.reindexAllProducts = async (req, res) => {
  try {
    // Delete existing index
    try {
      await esClient.indices.delete({ index: PRODUCTS_INDEX });
    } catch (e) {
      // Index might not exist
    }

    // Create index with custom mappings
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
            rating: { type: "float" },
            total_reviews: { type: "integer" },
            stock_quantity: { type: "integer" },
            brand: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            tags: { type: "keyword" },
            created_at: { type: "date" },
          },
        },
      },
    });

    // Get all products
    const products = await db.query(`
      SELECT p.*, s.store_name, s.rating as seller_rating
      FROM products p
      LEFT JOIN sellers s ON p.seller_id = s.id
      WHERE p.stock_quantity > 0
    `);

    // Bulk index
    const operations = products.rows.flatMap((doc) => [
      { index: { _index: PRODUCTS_INDEX, _id: doc.id } },
      {
        name: doc.name,
        description: doc.description,
        category: doc.category,
        price: parseFloat(doc.price),
        brand: doc.brand,
        tags: doc.tags || [],
        rating: parseFloat(doc.rating || 0),
        total_reviews: parseInt(doc.total_reviews || 0),
        stock_quantity: parseInt(doc.stock_quantity || 0),
        images: doc.images,
        store_name: doc.store_name,
        created_at: doc.created_at,
      },
    ]);

    if (operations.length > 0) {
      await esClient.bulk({ operations, refresh: true });
    }

    res.json({
      success: true,
      indexed: products.rows.length,
      message: "Products reindexed successfully",
    });
  } catch (error) {
    console.error("Reindex error:", error);
    res.status(500).json({ error: "Reindex failed" });
  }
};

// Helper: Track search queries
async function trackSearchQuery(query, resultCount) {
  const today = new Date().toISOString().split("T")[0];

  // Store in Redis sorted set for popular searches
  await redis.zIncrBy(`popular_searches:${today}`, 1, query.toLowerCase());

  // Track search result quality
  if (resultCount === 0) {
    await redis.sAdd("zero_result_searches", query.toLowerCase());
  }
}

module.exports = exports;
