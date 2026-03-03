// src/routes/orders.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const orderController = require("../controllers/orderController");
const { authenticateUser } = require("../middleware/auth");

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/returns/");
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `return-${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const allowedVideos = ["video/mp4", "video/quicktime", "video/webm"];
  if ([...allowedImages, ...allowedVideos].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only images (JPEG, PNG, WEBP, GIF) and videos (MP4, MOV, WEBM) are allowed",
      ),
      false,
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    files: 5, // max 5 files per request
  },
});

// Multer error handler middleware
const handleUpload = (req, res, next) => {
  upload.array("media", 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Each file must be under 50 MB" });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ error: "Maximum 5 files allowed" });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/checkout", authenticateUser, orderController.checkout);
router.get("/", authenticateUser, orderController.getOrders);
router.get("/returns", authenticateUser, orderController.getMyReturns);
router.get(
  "/returns/:returnId",
  authenticateUser,
  orderController.getReturnDetails,
);
router.get("/:id", authenticateUser, orderController.getOrderDetails);
router.put("/:id/cancel", authenticateUser, orderController.cancelOrder);

// Return with optional media upload (images/videos of damaged product)
router.post(
  "/:id/return",
  authenticateUser,
  handleUpload,
  orderController.returnOrder,
);

module.exports = router;
