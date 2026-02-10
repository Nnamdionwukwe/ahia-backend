const Order = require("../controllers/orderController");
const Payment = require("../controllers/paymentController");
const crypto = require("crypto");

/**
 * Bank Transfer Payment Controller
 * Handles bank transfer payment flow similar to Paystack
 */

// Generate unique reference for bank transfer
const generateBankTransferReference = () => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  return `BT-${timestamp}-${random}`.toUpperCase();
};

// Generate unique beneficiary name for tracking
const generateBeneficiaryName = (orderId) => {
  // Create a unique code from order ID
  const hash = crypto
    .createHash("md5")
    .update(orderId.toString())
    .digest("hex");
  const code = hash.substring(0, 8).toUpperCase();

  // Format: E3X-TEMU-NG2 style
  return `${code.substring(0, 3)}-${code.substring(3, 7)}-${code.substring(7, 10)}`.toUpperCase();
};

/**
 * Initialize bank transfer payment
 * POST /api/payments/bank-transfer/initialize
 */
exports.initializeBankTransfer = async (req, res) => {
  try {
    const { order_id, amount } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!order_id || !amount) {
      return res.status(400).json({
        success: false,
        message: "Order ID and amount are required",
      });
    }

    // Verify order exists and belongs to user
    const order = await Order.findOne({
      _id: order_id,
      user_id: userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order already has a pending/successful payment
    const existingPayment = await Payment.findOne({
      order_id: order_id,
      status: { $in: ["pending", "success"] },
    });

    if (existingPayment && existingPayment.status === "success") {
      return res.status(400).json({
        success: false,
        message: "Order has already been paid",
      });
    }

    // Generate reference and beneficiary name
    const reference = generateBankTransferReference();
    const beneficiaryName = generateBeneficiaryName(order_id);

    // Bank transfer details (You should configure these in your environment variables)
    const bankDetails = {
      account_number: process.env.BANK_ACCOUNT_NUMBER || "9967461687",
      bank_name: process.env.BANK_NAME || "Paystack-Titan",
      beneficiary_name: beneficiaryName,
      account_name: process.env.BANK_ACCOUNT_NAME || "Ahia Marketplace",
    };

    // Calculate expiry time (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create or update payment record
    let payment;
    if (existingPayment && existingPayment.status === "pending") {
      // Update existing pending payment
      payment = await Payment.findByIdAndUpdate(
        existingPayment._id,
        {
          reference: reference,
          amount: amount,
          payment_method: "bank_transfer",
          status: "pending",
          metadata: {
            bank_details: bankDetails,
            expires_at: expiresAt,
            user_id: userId,
            order_id: order_id,
          },
          updated_at: new Date(),
        },
        { new: true },
      );
    } else {
      // Create new payment record
      payment = await Payment.create({
        user_id: userId,
        order_id: order_id,
        reference: reference,
        amount: amount,
        payment_method: "bank_transfer",
        status: "pending",
        metadata: {
          bank_details: bankDetails,
          expires_at: expiresAt,
          user_id: userId,
          order_id: order_id,
        },
      });
    }

    // Update order status to pending_payment
    await Order.findByIdAndUpdate(order_id, {
      payment_status: "pending",
      payment_method: "bank_transfer",
      updated_at: new Date(),
    });

    // Return bank transfer details
    return res.status(200).json({
      success: true,
      message: "Bank transfer initialized successfully",
      data: {
        reference: reference,
        order_id: order_id,
        amount: amount,
        bank_details: {
          account_number: bankDetails.account_number,
          bank_name: bankDetails.bank_name,
          beneficiary_name: bankDetails.beneficiary_name,
          account_name: bankDetails.account_name,
        },
        expires_at: expiresAt,
        expires_in_hours: 24,
      },
    });
  } catch (error) {
    console.error("Bank transfer initialization error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize bank transfer",
      error: error.message,
    });
  }
};

/**
 * Verify bank transfer payment (manual verification or webhook)
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

    // Find payment record
    const payment = await Payment.findOne({ reference });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Verify user owns this payment
    if (payment.user_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to payment",
      });
    }

    // Check if payment has expired
    const expiresAt = new Date(payment.metadata.expires_at);
    if (new Date() > expiresAt) {
      await Payment.findByIdAndUpdate(payment._id, {
        status: "failed",
        updated_at: new Date(),
      });

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
        bank_details: payment.metadata.bank_details,
        expires_at: payment.metadata.expires_at,
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
  try {
    const { reference } = req.body;
    const userId = req.user.id;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    // Find payment record
    const payment = await Payment.findOne({ reference });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Verify user owns this payment
    if (payment.user_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to payment",
      });
    }

    // Update payment status to processing
    await Payment.findByIdAndUpdate(payment._id, {
      status: "processing",
      metadata: {
        ...payment.metadata,
        confirmed_at: new Date(),
      },
      updated_at: new Date(),
    });

    // Update order status
    await Order.findByIdAndUpdate(payment.order_id, {
      payment_status: "processing",
      updated_at: new Date(),
    });

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
    console.error("Bank transfer confirmation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to confirm bank transfer",
      error: error.message,
    });
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
    const payment = await Payment.findOne({ reference });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Verify user owns this payment
    if (payment.user_id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to payment",
      });
    }

    // Get order details
    const order = await Order.findById(payment.order_id);

    // Calculate time remaining
    const expiresAt = new Date(payment.metadata.expires_at);
    const now = new Date();
    const timeRemaining = Math.max(0, expiresAt - now);
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
    );
    const secondsRemaining = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    return res.status(200).json({
      success: true,
      data: {
        reference: payment.reference,
        order_id: payment.order_id,
        amount: payment.amount,
        status: payment.status,
        bank_details: {
          account_number: payment.metadata.bank_details.account_number,
          bank_name: payment.metadata.bank_details.bank_name,
          beneficiary_name: payment.metadata.bank_details.beneficiary_name,
          account_name: payment.metadata.bank_details.account_name,
        },
        time_remaining: {
          hours: hoursRemaining,
          minutes: minutesRemaining,
          seconds: secondsRemaining,
          formatted: `${hoursRemaining}:${minutesRemaining.toString().padStart(2, "0")}:${secondsRemaining.toString().padStart(2, "0")}`,
        },
        expires_at: payment.metadata.expires_at,
        created_at: payment.created_at,
        order: {
          id: order._id,
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

module.exports = {
  initializeBankTransfer,
  verifyBankTransfer,
  confirmBankTransfer,
  getBankTransferDetails,
};
