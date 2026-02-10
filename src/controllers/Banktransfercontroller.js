const db = require("../config/database");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

// Generate unique reference for bank transfer
const generateBankTransferReference = () => {
  const timestamp = Date.now();
  // Random bytes and ensure hex
  const randomBytes = crypto.randomBytes(4).toString("hex").substring(0, 8);
  return `BT-${timestamp}-${randomBytes}`.toUpperCase();
};

// Generate unique beneficiary name for tracking
const generateBeneficiaryName = (orderId) => {
  // Create a hash from order ID
  const hash = crypto
    .createHash("md5")
    .update(orderId.toString())
    .digest("hex");
  const code = hash.substring(0, 8).toUpperCase();

  // Format: E3X-TEMU-NG2 style
  return `${code.substring(0, 3)}-${code.substring(3, 7)}-${code.substring(7, 10)}`;
};

/**
 * Initialize bank transfer payment
 * POST /api/payments/bank-transfer/initialize
 */
exports.initializeBankTransfer = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { order_id, amount } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!order_id || !amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Order ID and amount are required",
      });
    }

    await client.query("BEGIN");

    // 1. Verify order exists and belongs to user (SQL)
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [order_id, userId],
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    // 2. Check if order already has a pending/successful payment (SQL)
    const existingPaymentResult = await client.query(
      `SELECT * FROM payments WHERE order_id = $1 AND status IN ('pending', 'success')`,
      [order_id],
    );

    if (existingPaymentResult.rows.length > 0) {
      const existing = existingPaymentResult.rows[0];
      if (existing.status === "success") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Order has already been paid",
        });
      }
      // If pending, update the existing one
      const reference = generateBankTransferReference();
      const beneficiaryName = generateBeneficiaryName(order_id);

      const bankDetails = {
        account_number: process.env.BANK_ACCOUNT_NUMBER || "9967461687",
        bank_name: process.env.BANK_NAME || "Titan Bank",
        beneficiary_name: beneficiaryName,
        account_name: process.env.BANK_ACCOUNT_NAME || "Ahia Marketplace",
      };

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await client.query(
        `UPDATE payments 
         SET reference = $1, amount = $2, metadata = $3, updated_at = NOW()
         WHERE id = $4`,
        [
          reference,
          amount,
          JSON.stringify({ bank_details: bankDetails, expires_at: expiresAt }),
          existingPayment.id,
        ],
      );

      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "Bank transfer initialized successfully (Updated)",
        data: {
          reference: reference,
          order_id: order_id,
          amount: amount,
          bank_details: bankDetails,
          expires_at: expiresAt,
        },
      });
    }

    // 3. Generate new payment data
    const reference = generateBankTransferReference();
    const beneficiaryName = generateBeneficiaryName(order_id);

    const bankDetails = {
      account_number: process.env.BANK_ACCOUNT_NUMBER || "9967461687",
      bank_name: process.env.BANK_NAME || "Titan Bank",
      beneficiary_name: beneficiaryName,
      account_name: process.env.BANK_ACCOUNT_NAME || "Ahia Marketplace",
    };

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // 4. Create new payment record (SQL)
    const paymentId = uuidv4();
    await client.query(
      `INSERT INTO payments 
       (id, user_id, order_id, reference, amount, payment_method, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        paymentId,
        userId,
        order_id,
        reference,
        amount,
        "bank_transfer",
        "pending",
        JSON.stringify({
          bank_details: bankDetails,
          expires_at: expiresAt,
        }),
      ],
    );

    // 5. Update order status to pending_payment
    await client.query(
      `UPDATE orders 
       SET payment_status = 'pending', updated_at = NOW() 
       WHERE id = $1`,
      [order_id],
    );

    await client.query("COMMIT");

    // Return bank transfer details
    return res.status(200).json({
      success: true,
      message: "Bank transfer initialized successfully",
      data: {
        reference: reference,
        order_id: order_id,
        amount: amount,
        bank_details: bankDetails,
        expires_at: expiresAt,
        expires_in_hours: 24,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Bank transfer initialization error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize bank transfer",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Verify bank transfer payment (manual verification)
 * POST /api/payments/bank-transfer/verify
 */
exports.verifyBankTransfer = async (req, res) => {
  try {
    const { reference } = req.body;
    const userId = req.user.id;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    // Find payment record (SQL)
    const paymentResult = await db.query(
      `SELECT * FROM payments WHERE reference = $1`,
      [reference],
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // Verify user owns this payment
    if (payment.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to payment",
      });
    }

    // Check if payment has expired
    const expiresAt = new Date(JSON.parse(payment.metadata).expires_at);
    if (new Date() > expiresAt) {
      // Update status to failed
      await db.query(
        `UPDATE payments SET status = 'failed', updated_at = NOW() WHERE reference = $1`,
        [reference],
      );

      return res.status(400).json({
        success: false,
        message: "Payment has expired",
      });
    }

    // Return payment status
    return res.status(200).json({
      success: true,
      data: {
        reference: payment.reference,
        order_id: payment.order_id,
        amount: payment.amount,
        status: payment.status,
        bank_details: JSON.parse(payment.metadata).bank_details,
        expires_at: JSON.parse(payment.metadata).expires_at,
        created_at: payment.created_at,
      },
    });
  } catch (error) {
    console.error("Bank transfer verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify bank transfer",
      error: error.message,
    });
  }
};

/**
 * Confirm bank transfer payment (called after customer makes transfer)
 * POST /api/payments/bank-transfer/confirm
 */
exports.confirmBankTransfer = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { reference } = req.body;
    const userId = req.user.id;

    if (!reference) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    await client.query("BEGIN");

    // Find payment record
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE reference = $1`,
      [reference],
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // Verify user owns this payment
    if (payment.user_id !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to payment",
      });
    }

    // FIX: Safe Metadata Parsing
    // We must ensure metadata is a valid JSON string before parsing it.
    let existingMetadata = {};
    try {
      if (typeof payment.metadata === "string") {
        existingMetadata = JSON.parse(payment.metadata);
      } else if (
        typeof payment.metadata === "object" &&
        payment.metadata !== null
      ) {
        // Handle case where DB driver returns object directly
        existingMetadata = payment.metadata;
      }
      // If null/undefined, default to {}
    } catch (e) {
      console.error("⚠️  Failed to parse existing metadata, resetting:", e);
      existingMetadata = {};
      // We don't return 500 error here to prevent cascading, just reset to safe default
    }

    // Update payment status to processing
    await client.query(
      `UPDATE payments 
       SET status = 'processing', metadata = $1, updated_at = NOW() 
       WHERE id = $2`,
      [
        JSON.stringify({ ...existingMetadata, confirmed_at: new Date() }),
        payment.id,
      ],
    );

    // Update order status
    await client.query(
      `UPDATE orders 
       SET payment_status = 'processing', updated_at = NOW() 
       WHERE id = $1`,
      [payment.order_id],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message:
        "Payment confirmation received. We will verify your transfer shortly.",
      data: {
        reference: payment.reference,
        status: "processing",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Bank transfer confirmation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to confirm bank transfer",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Get bank transfer details
 * GET /api/payments/bank-transfer/:reference
 */
exports.getBankTransferDetails = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    // Find payment record
    const paymentResult = await db.query(
      `SELECT * FROM payments WHERE reference = $1`,
      [reference],
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // Verify user owns this payment
    if (payment.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to payment",
      });
    }

    // FIX: Safe JSON parsing logic
    let parsedMetadata;
    if (typeof payment.metadata === "string") {
      try {
        // Try to parse if it's a string
        parsedMetadata = JSON.parse(payment.metadata);
      } catch (e) {
        console.error("❌ Failed to parse metadata JSON:", e);
        return res.status(500).json({
          success: false,
          message: "Invalid payment metadata configuration",
          error: "Database metadata is malformed",
        });
      }
    } else if (payment.metadata && typeof payment.metadata === "object") {
      // Use directly if Postgres already parsed it (pg driver often does this)
      parsedMetadata = payment.metadata;
    } else {
      console.error(
        "❌ Metadata is missing or invalid type:",
        typeof payment.metadata,
      );
      return res.status(500).json({
        success: false,
        message: "Payment metadata missing",
      });
    }

    // Get order details
    const orderResult = await db.query(`SELECT * FROM orders WHERE id = $1`, [
      payment.order_id,
    ]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Associated order not found",
      });
    }

    const order = orderResult.rows[0];

    // Calculate time remaining
    const expiresAt = new Date(parsedMetadata.expires_at);
    const now = new Date();
    const timeRemaining = Math.max(0, expiresAt - now);
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
    );
    const secondsRemaining = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    // Extract bank details from metadata
    const bankDetails = parsedMetadata.bank_details || {};

    return res.status(200).json({
      success: true,
      data: {
        reference: payment.reference,
        order_id: payment.order_id,
        amount: payment.amount,
        status: payment.status,
        bank_details: {
          account_number: bankDetails.account_number || "N/A",
          bank_name: bankDetails.bank_name || "N/A",
          beneficiary_name: bankDetails.beneficiary_name || "AHIA Marketplace",
          account_name: bankDetails.account_name || "N/A",
        },
        time_remaining: {
          hours: hoursRemaining,
          minutes: minutesRemaining,
          seconds: secondsRemaining,
          formatted: `${hoursRemaining}:${minutesRemaining.toString().padStart(2, "0")}:${secondsRemaining.toString().padStart(2, "0")}`,
        },
        expires_at: parsedMetadata.expires_at,
        created_at: payment.created_at,
        order: {
          id: order.id,
          total_amount: order.total_amount,
          items_count: order.items ? order.items.length : 0,
        },
      },
    });
  } catch (error) {
    console.error("Get bank transfer details error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get bank transfer details",
      error: error.message,
    });
  }
};
