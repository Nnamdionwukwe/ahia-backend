const jwt = require("jsonwebtoken");
const db = require("../config/database");

// Authenticate JWT token
exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user details with role
    const user = await db.query(
      `SELECT u.id, u.phone_number, u.full_name, u.role, u.is_verified,
                    s.id as seller_id, s.store_name
            FROM users u
            LEFT JOIN sellers s ON u.id = s.user_id
            WHERE u.id = $1`,
      [decoded.userId]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Attach user to request
    req.user = {
      id: user.rows[0].id,
      phoneNumber: user.rows[0].phone_number,
      fullName: user.rows[0].full_name,
      role: user.rows[0].role || "customer",
      isVerified: user.rows[0].is_verified,
      sellerId: user.rows[0].seller_id,
      storeName: user.rows[0].store_name,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    // Log the error for debugging in production
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

// Require specific role(s)
exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRole = req.user.role;

    // Admin has access to everything
    if (userRole === "admin") {
      return next();
    }

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: "Access denied",
        required: allowedRoles,
        current: userRole,
      });
    }

    next();
  };
};

// Require seller verification
exports.requireSeller = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Admin can access seller routes
    if (req.user.role === "admin") {
      return next();
    }

    // Check if user is a seller
    if (!req.user.sellerId) {
      return res.status(403).json({
        error: "Seller account required",
        message: "You need to register as a seller to access this resource",
      });
    }

    // Verify seller is active
    const seller = await db.query(
      "SELECT id, verified, status FROM sellers WHERE id = $1",
      [req.user.sellerId]
    );

    if (seller.rows.length === 0) {
      return res.status(403).json({ error: "Seller account not found" });
    }

    const sellerData = seller.rows[0];

    if (sellerData.status !== "active") {
      return res.status(403).json({
        error: "Seller account inactive",
        status: sellerData.status,
      });
    }

    // Attach seller info to request
    req.seller = {
      id: sellerData.id,
      verified: sellerData.verified,
      status: sellerData.status,
    };

    next();
  } catch (error) {
    console.error("Seller verification error:", error);
    res.status(500).json({ error: "Seller verification failed" });
  }
};

// Account verification check
exports.requireVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      error: "Account verification required",
      message: "Please verify your account to access this resource",
    });
  }

  next();
};

// Optional authentication (attach user if token present, but don't fail)
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return next(); // No token, continue as guest
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.query(
      `SELECT u.id, u.phone_number, u.full_name, u.role, u.is_verified,
                    s.id as seller_id
            FROM users u
            LEFT JOIN sellers s ON u.id = s.user_id
            WHERE u.id = $1`,
      [decoded.userId]
    );

    if (user.rows.length > 0) {
      req.user = {
        id: user.rows[0].id,
        phoneNumber: user.rows[0].phone_number,
        fullName: user.rows[0].full_name,
        role: user.rows[0].role || "customer",
        isVerified: user.rows[0].is_verified,
        sellerId: user.rows[0].seller_id,
      };
    }

    next();
  } catch (error) {
    // Token invalid, continue as guest
    next();
  }
};

// Check permissions for specific resources
exports.checkResourcePermission = (resourceType) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Admin has access to all resources
      if (req.user.role === "admin") {
        return next();
      }

      const resourceId =
        req.params.id || req.params.productId || req.params.orderId;

      switch (resourceType) {
        case "product":
          // Check if user owns the product (is the seller)
          const product = await db.query(
            `SELECT p.seller_id, s.user_id
                         FROM products p
                         JOIN sellers s ON p.seller_id = s.id
                         WHERE p.id = $1`,
            [resourceId]
          );

          if (product.rows.length === 0) {
            return res.status(404).json({ error: "Product not found" });
          }

          if (product.rows[0].user_id !== req.user.id) {
            return res
              .status(403)
              .json({ error: "Access denied to this product" });
          }
          break;

        case "order":
          // Check if user owns the order or is the seller
          const order = await db.query(
            `SELECT o.user_id,
                                array_agg(DISTINCT s.user_id) as seller_user_ids
                         FROM orders o
                         LEFT JOIN order_items oi ON o.id = oi.order_id
                         LEFT JOIN products p ON oi.product_id = p.id
                         LEFT JOIN sellers s ON p.seller_id = s.id
                         WHERE o.id = $1
                         GROUP BY o.id, o.user_id`,
            [resourceId]
          );

          if (order.rows.length === 0) {
            return res.status(404).json({ error: "Order not found" });
          }

          const isOwner = order.rows[0].user_id === req.user.id;
          const isSeller = order.rows[0].seller_user_ids?.includes(req.user.id);
          if (!isOwner && !isSeller) {
            return res
              .status(403)
              .json({ error: "Access denied to this order" });
          }
          break;

        case "seller":
          // Check if user is the seller
          const seller = await db.query(
            "SELECT user_id FROM sellers WHERE id = $1",
            [resourceId]
          );

          if (seller.rows.length === 0) {
            return res.status(404).json({ error: "Seller not found" });
          }

          if (seller.rows[0].user_id !== req.user.id) {
            return res
              .status(403)
              .json({ error: "Access denied to this seller account" });
          }
          break;

        default:
          return res.status(400).json({ error: "Unknown resource type" });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ error: "Permission check failed" });
    }
  };
};

// Rate limiting by user
exports.userRateLimit = (maxRequests, windowMs) => {
  const requests = new Map();

  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    if (requests.has(userId)) {
      const userRequests = requests
        .get(userId)
        .filter((time) => time > windowStart);
      requests.set(userId, userRequests);

      if (userRequests.length >= maxRequests) {
        return res.status(429).json({
          error: "Too many requests",
          retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
        });
      }

      userRequests.push(now);
    } else {
      requests.set(userId, [now]);
    }

    next();
  };
};

// Export for backward compatibility
exports.authenticateUser = exports.authenticateToken;
