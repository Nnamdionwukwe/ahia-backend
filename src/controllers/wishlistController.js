const db = require("../config/database");
const redis = require("../config/redis");
const { v4: uuidv4 } = require("uuid");

const wishlistController = {
  // Add to wishlist
  addToWishlist: async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;
    try {
      const result = await db.query(
        `INSERT INTO wishlist (id, user_id, product_id, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, product_id) DO NOTHING
         RETURNING *`,
        [uuidv4(), userId, productId]
      );

      // Clear cache
      await redis.del(`wishlist:${userId}`);

      res.json({ success: true, wishlisted: result.rows.length > 0 });
    } catch (error) {
      console.error("Add to wishlist error:", error);
      res.status(500).json({ error: "Failed to add to wishlist" });
    }
  },

  // Check if product is in wishlist
  checkWishlist: async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;
    try {
      const result = await db.query(
        "SELECT id FROM wishlist WHERE user_id = $1 AND product_id = $2",
        [userId, productId]
      );

      res.json({ inWishlist: result.rows.length > 0 });
    } catch (error) {
      console.error("Check wishlist error:", error);
      res.status(500).json({ error: "Failed to check wishlist" });
    }
  },

  // Remove from wishlist
  removeFromWishlist: async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;

    try {
      await db.query(
        "DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2",
        [userId, productId]
      );

      // Clear cache
      await redis.del(`wishlist:${userId}`);

      res.json({ success: true });
    } catch (error) {
      console.error("Remove from wishlist error:", error);
      res.status(500).json({ error: "Failed to remove from wishlist" });
    }
  },

  // Get wishlist
  getWishlist: async (req, res) => {
    const userId = req.user.id;

    try {
      // Check cache
      const cached = await redis.get(`wishlist:${userId}`);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const wishlist = await db.query(
        `SELECT p.id, p.name, p.price, p.discount_percentage, p.images, p.rating, p.total_reviews, p.original_price
         FROM wishlist w
         JOIN products p ON w.product_id = p.id
         WHERE w.user_id = $1
         ORDER BY w.created_at DESC`,
        [userId]
      );

      const result = { items: wishlist.rows, count: wishlist.rows.length };

      // Cache for 1 hour
      await redis.setex(`wishlist:${userId}`, 3600, JSON.stringify(result));

      res.json(result);
    } catch (error) {
      console.error("Get wishlist error:", error);
      res.status(500).json({ error: "Failed to fetch wishlist" });
    }
  },
};

module.exports = wishlistController;
