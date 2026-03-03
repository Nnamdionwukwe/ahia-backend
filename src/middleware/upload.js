// src/middleware/upload.js
//
// Uses multer memoryStorage → streams directly to Cloudinary.
// No local disk writes → works on Railway / any ephemeral filesystem.
//
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

// ── Multer (memory only — no disk) ────────────────────────────────────────────
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only images (JPEG, PNG, WEBP, GIF) and videos (MP4, MOV, WEBM) are allowed",
        ),
        false,
      );
    }
  },
});

// ── Stream buffer → Cloudinary ────────────────────────────────────────────────
function uploadToCloudinary(file, folder = "returns") {
  return new Promise((resolve, reject) => {
    const isVideo = file.mimetype.startsWith("video/");
    const resourceType = isVideo ? "video" : "image";

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Videos: auto quality + format; images: auto format + quality
        transformation: isVideo
          ? [{ quality: "auto" }]
          : [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          public_id: result.public_id,
          url: result.secure_url,
          mimetype: file.mimetype,
          size: file.size,
          type: isVideo ? "video" : "image",
          filename: file.originalname,
        });
      },
    );

    // Pipe the buffer into the upload stream
    const readable = new Readable();
    readable.push(file.buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

// ── Middleware: parse + upload all files to Cloudinary ────────────────────────
//
// Usage:  router.post("/route", handleReturnUpload, controller)
//
// After this middleware:
//   req.uploadedMedia = [ { public_id, url, mimetype, size, type, filename }, … ]
//
const handleReturnUpload = (req, res, next) => {
  multerUpload.array("media", 5)(req, res, async (err) => {
    // ── Multer errors ──────────────────────────────────────────────────────
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE")
        return res.status(400).json({ error: "Each file must be under 50 MB" });
      if (err.code === "LIMIT_FILE_COUNT")
        return res.status(400).json({ error: "Maximum 5 files allowed" });
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });

    // ── No files — skip Cloudinary ─────────────────────────────────────────
    if (!req.files || req.files.length === 0) {
      req.uploadedMedia = [];
      return next();
    }

    // ── Upload each file to Cloudinary in parallel ─────────────────────────
    try {
      req.uploadedMedia = await Promise.all(
        req.files.map((file) => uploadToCloudinary(file, "ahia/returns")),
      );
      next();
    } catch (uploadErr) {
      console.error("Cloudinary upload error:", uploadErr);
      return res
        .status(500)
        .json({ error: "Failed to upload media. Please try again." });
    }
  });
};

module.exports = { handleReturnUpload, uploadToCloudinary };
