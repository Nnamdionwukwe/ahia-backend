// src/routes/loyalty.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const loyaltyController = require("../controllers/loyaltyController");

// =============================================
// LOYALTY ACCOUNT ROUTES
// =============================================

/**
 * @route   GET /api/loyalty/account
 * @desc    Get user's loyalty account details
 * @access  Private
 */
router.get("/account", authenticateToken, loyaltyController.getLoyaltyAccount);

/**
 * @route   GET /api/loyalty/transactions
 * @desc    Get loyalty transaction history
 * @access  Private
 */
router.get(
  "/transactions",
  authenticateToken,
  loyaltyController.getTransactionHistory
);

// =============================================
// REWARDS ROUTES
// =============================================

/**
 * @route   GET /api/loyalty/rewards
 * @desc    Get available rewards catalog
 * @access  Private
 */
router.get(
  "/rewards",
  authenticateToken,
  loyaltyController.getAvailableRewards
);

/**
 * @route   POST /api/loyalty/rewards/:rewardId/redeem
 * @desc    Redeem a reward with loyalty points
 * @access  Private
 */
router.post(
  "/rewards/:rewardId/redeem",
  authenticateToken,
  loyaltyController.redeemReward
);

/**
 * @route   GET /api/loyalty/user-rewards
 * @desc    Get user's redeemed rewards (vouchers/coupons)
 * @access  Private
 */
router.get(
  "/user-rewards",
  authenticateToken,
  loyaltyController.getUserRewards
);

/**
 * @route   POST /api/loyalty/apply-reward
 * @desc    Apply reward code to an order
 * @access  Private
 */
router.post(
  "/apply-reward",
  authenticateToken,
  loyaltyController.applyRewardToOrder
);

// =============================================
// REFERRAL ROUTES
// =============================================

/**
 * @route   GET /api/loyalty/referral-code
 * @desc    Get or generate user's referral code
 * @access  Private
 */
router.get(
  "/referral-code",
  authenticateToken,
  loyaltyController.generateReferralCode
);

/**
 * @route   GET /api/loyalty/referrals
 * @desc    Get user's referral statistics
 * @access  Private
 */
router.get("/referrals", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = require("../config/database");

    // Get referral statistics
    const stats = await db.query(
      `SELECT 
         COUNT(*) as total_referrals,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_referrals,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_referrals,
         SUM(CASE WHEN status = 'completed' THEN points_awarded ELSE 0 END) as total_points_earned
       FROM referrals
       WHERE referrer_id = $1`,
      [userId]
    );

    // Get recent referrals
    const recent = await db.query(
      `SELECT 
         r.id,
         u.full_name as referred_user_name,
         r.status,
         r.points_awarded,
         r.created_at,
         r.completed_at
       FROM referrals r
       JOIN users u ON r.referred_user_id = u.id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      stats: stats.rows[0],
      recentReferrals: recent.rows,
    });
  } catch (error) {
    console.error("Get referrals error:", error);
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
});

// =============================================
// PUBLIC INFORMATION ROUTES
// =============================================

/**
 * @route   GET /api/loyalty/tiers
 * @desc    Get information about loyalty tiers
 * @access  Public
 */
router.get("/tiers", (req, res) => {
  res.json({
    tiers: [
      {
        name: "Bronze",
        minPoints: 0,
        multiplier: 1,
        color: "#CD7F32",
        benefits: [
          "Standard points earning",
          "Access to rewards catalog",
          "Birthday bonus points",
        ],
      },
      {
        name: "Silver",
        minPoints: 1000,
        multiplier: 1.25,
        color: "#C0C0C0",
        benefits: [
          "1.25x points multiplier",
          "Priority customer support",
          "Exclusive member sales",
          "Birthday bonus points",
        ],
      },
      {
        name: "Gold",
        minPoints: 5000,
        multiplier: 1.5,
        color: "#FFD700",
        benefits: [
          "1.5x points multiplier",
          "Free shipping on all orders",
          "Early access to sales",
          "Exclusive rewards",
          "Personal shopping assistance",
        ],
      },
      {
        name: "Platinum",
        minPoints: 15000,
        multiplier: 2,
        color: "#E5E4E2",
        benefits: [
          "2x points multiplier",
          "VIP support line",
          "Dedicated personal shopper",
          "Premium exclusive deals",
          "Partner perks and discounts",
          "Priority event access",
        ],
      },
    ],
  });
});

/**
 * @route   GET /api/loyalty/points-rules
 * @desc    Get information about how to earn points
 * @access  Public
 */
router.get("/points-rules", (req, res) => {
  try {
    const { POINTS_RULES } = require("../controllers/loyaltyController");

    res.json({
      rules: [
        {
          action: "Purchase",
          points: `${POINTS_RULES.purchase} points per $1 spent`,
          multipliedByTier: true,
          icon: "🛍️",
          example:
            "Spend $100 = 1,000 points (Bronze) or 2,000 points (Platinum)",
        },
        {
          action: "Write Review",
          points: `${POINTS_RULES.review} points`,
          multipliedByTier: true,
          icon: "⭐",
          example: "50 points (Bronze) or 100 points (Platinum) per review",
        },
        {
          action: "Successful Referral",
          points: `${POINTS_RULES.referral} points`,
          multipliedByTier: false,
          icon: "👥",
          example:
            "Both you and your friend get 500 points when they make their first purchase",
        },
        {
          action: "Daily Login",
          points: `${POINTS_RULES.daily_login} points`,
          multipliedByTier: true,
          icon: "📅",
          example: "5 points (Bronze) or 10 points (Platinum) per day",
        },
        {
          action: "Social Share",
          points: `${POINTS_RULES.social_share} points`,
          multipliedByTier: true,
          icon: "📱",
          example: "Share products to earn points",
        },
        {
          action: "Birthday Bonus",
          points: `${POINTS_RULES.birthday_bonus} points`,
          multipliedByTier: false,
          icon: "🎂",
          example: "Special birthday gift - 200 points",
        },
      ],
      note: 'Points marked with "multipliedByTier: true" are multiplied by your tier multiplier',
      tierMultipliers: {
        Bronze: "1x",
        Silver: "1.25x",
        Gold: "1.5x",
        Platinum: "2x",
      },
    });
  } catch (error) {
    // Fallback if controller not available
    res.json({
      rules: [
        {
          action: "Purchase",
          points: "10 points per $1",
          multipliedByTier: true,
        },
        { action: "Write Review", points: "50 points", multipliedByTier: true },
        { action: "Referral", points: "500 points", multipliedByTier: false },
        { action: "Daily Login", points: "5 points", multipliedByTier: true },
        { action: "Social Share", points: "20 points", multipliedByTier: true },
        { action: "Birthday", points: "200 points", multipliedByTier: false },
      ],
    });
  }
});

/**
 * @route   GET /api/loyalty/faq
 * @desc    Get frequently asked questions about loyalty program
 * @access  Public
 */
router.get("/faq", (req, res) => {
  res.json({
    faqs: [
      {
        question: "How do I earn loyalty points?",
        answer:
          "You earn points through purchases (10 points per $1), writing reviews (50 points), referring friends (500 points), daily logins (5 points), and more. Higher tiers earn more points through multipliers.",
      },
      {
        question: "Do my points expire?",
        answer:
          "Yes, points expire 1 year after they are earned. You will receive notifications when points are about to expire.",
      },
      {
        question: "How do I redeem my points?",
        answer:
          "Browse the rewards catalog in your loyalty account and select rewards to redeem. Rewards include discounts, free shipping, and exclusive products.",
      },
      {
        question: "How do I move up to the next tier?",
        answer:
          "Tiers are based on lifetime points earned: Silver (1,000), Gold (5,000), Platinum (15,000). Keep earning points through purchases and activities.",
      },
      {
        question: "Can I share my rewards with others?",
        answer:
          "Reward codes are linked to your account and cannot be transferred. However, you can refer friends to earn bonus points for both of you!",
      },
      {
        question: "What happens to my points if I return a purchase?",
        answer:
          "Points earned from returned purchases will be deducted from your account balance.",
      },
    ],
  });
});

module.exports = router;
