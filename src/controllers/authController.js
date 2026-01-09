// src/controllers/authController.js
const db = require("../config/database");
const redis = require("../config/redis");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// Helper: Generate tokens
function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "60m",
  });

  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
}

// Register with phone
exports.register = async (req, res) => {
  try {
    const { phoneNumber, password, full_name } = req.body;

    if (!phoneNumber || !password || !full_name) {
      return res.status(400).json({
        error: "Phone number, password, and name are required",
      });
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid phone number format",
      });
    }

    // Check if user exists
    const existing = await db.query(
      "SELECT id FROM users WHERE phone_number = $1",
      [phoneNumber]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Phone number already registered",
      });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const user = await db.query(
      `INSERT INTO users (id, phone_number, password_hash, full_name, signup_method, is_verified, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'phone', TRUE, NOW(), NOW())
             RETURNING id, phone_number, full_name`,
      [userId, phoneNumber, password_hash, full_name]
    );

    const { accessToken, refreshToken } = generateTokens(user.rows[0].id);

    await redis.setEx(`refresh_token:${user.rows[0].id}`, 604800, refreshToken);

    res.status(201).json({
      success: true,
      user: user.rows[0],
      tokens: { accessToken, refreshToken },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
};

// Login with phone
exports.login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({
        error: "Phone number and password required",
      });
    }

    const user = await db.query("SELECT * FROM users WHERE phone_number = $1", [
      phoneNumber,
    ]);

    if (user.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid phone number or password",
      });
    }

    const userData = user.rows[0];

    if (!userData.password_hash) {
      return res.status(401).json({
        error:
          "This account was created with Google. Please sign in with Google.",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      userData.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid phone number or password",
      });
    }

    const { accessToken, refreshToken } = generateTokens(userData.id);

    await redis.setEx(`refresh_token:${userData.id}`, 604800, refreshToken);

    res.json({
      success: true,
      user: {
        id: userData.id,
        phone_number: userData.phone_number,
        full_name: userData.full_name,
      },
      tokens: { accessToken, refreshToken },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

// Google verification
exports.googleVerify = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "ID token required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const googleProfile = ticket.getPayload();
    const { sub: googleId, email, name, picture } = googleProfile;

    let oauthAccount = await db.query(
      "SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2",
      ["google", googleId]
    );

    let user;
    let isNewUser = false;

    if (oauthAccount.rows.length > 0) {
      user = await db.query("SELECT * FROM users WHERE id = $1", [
        oauthAccount.rows[0].user_id,
      ]);
    } else {
      isNewUser = true;
      const userId = uuidv4();

      const createdUser = await db.query(
        `INSERT INTO users (id, phone_number, full_name, profile_image, signup_method, is_verified, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'google', TRUE, NOW(), NOW())
                 RETURNING id, phone_number, full_name, profile_image`,
        [userId, `google_${googleId}`, name, picture]
      );

      await db.query(
        `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, provider_email, profile_data, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          uuidv4(),
          userId,
          "google",
          googleId,
          email,
          JSON.stringify(googleProfile),
        ]
      );

      user = createdUser;
    }

    const { accessToken, refreshToken } = generateTokens(user.rows[0].id);

    await redis.setEx(`refresh_token:${user.rows[0].id}`, 604800, refreshToken);

    res.json({
      success: true,
      isNewUser,
      user: {
        id: user.rows[0].id,
        phone_number: user.rows[0].phone_number,
        full_name: user.rows[0].full_name,
        profile_image: user.rows[0].profile_image,
      },
      tokens: { accessToken, refreshToken },
    });
  } catch (error) {
    console.error("Google verification error:", error);
    res.status(401).json({ error: "Token verification failed" });
  }
};

// Refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

    if (storedToken !== refreshToken) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const accessToken = jwt.sign(
      { userId: decoded.userId },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: "Token refresh failed" });
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      await redis.del(`refresh_token:${decoded.userId}`);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Logout failed" });
  }
};
