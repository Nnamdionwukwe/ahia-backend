// src/controllers/applePayController.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

/**
 * Apple Pay Controller
 * Handles Apple Pay payment processing
 */

class ApplePayController {
  constructor() {
    // Apple Pay merchant configuration
    this.merchantId = process.env.APPLE_PAY_MERCHANT_ID || "merchant.com.ahia";
    this.merchantDomain = process.env.APPLE_PAY_DOMAIN || "ahia.com";
    this.displayName = process.env.APPLE_PAY_DISPLAY_NAME || "Ahia Store";
    this.countryCode = "NG"; // Nigeria
    this.currencyCode = "NGN";
  }

  /**
   * Create Apple Pay session
   * @route POST /api/payments/apple-pay/session
   */
  async createSession(req, res) {
    try {
      const { validationUrl } = req.body;
      const user_id = req.user?.id;

      if (!validationUrl) {
        return res.status(400).json({
          success: false,
          message: "Validation URL is required",
        });
      }

      // In production, you would validate with Apple's servers
      // For now, we'll return a mock session
      const session = {
        epochTimestamp: Date.now(),
        expiresAt: Date.now() + 300000, // 5 minutes
        merchantSessionIdentifier: uuidv4(),
        nonce: crypto.randomBytes(16).toString("hex"),
        merchantIdentifier: this.merchantId,
        domainName: this.merchantDomain,
        displayName: this.displayName,
        signature: crypto.randomBytes(32).toString("base64"),
      };

      console.log("✅ Apple Pay session created for user:", user_id);

      return res.status(200).json({
        success: true,
        session,
      });
    } catch (error) {
      console.error("Apple Pay session creation error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create Apple Pay session",
        error: error.message,
      });
    }
  }

  /**
   * Initialize Apple Pay payment
   * @route POST /api/payments/apple-pay/initialize
   */
  async initializePayment(req, res) {
    const client = await db.pool.connect();
    try {
      const { amount, order_id, email, metadata } = req.body;
      const user_id = req.user?.id;

      // Validate required fields
      if (!amount || !order_id) {
        return res.status(400).json({
          success: false,
          message: "Amount and order_id are required",
        });
      }

      // Generate unique reference
      const reference = `APPLE-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      // Create payment request object
      const paymentRequest = {
        countryCode: this.countryCode,
        currencyCode: this.currencyCode,
        merchantCapabilities: [
          "supports3DS",
          "supportsDebit",
          "supportsCredit",
        ],
        supportedNetworks: ["visa", "masterCard", "amex", "discover"],
        total: {
          label: this.displayName,
          amount: amount.toString(),
          type: "final",
        },
        lineItems:
          metadata?.items?.map((item) => ({
            label: item.name,
            amount: (item.price * item.quantity).toString(),
          })) || [],
      };

      // Save transaction to database
      await client.query(
        `INSERT INTO transactions 
        (reference, user_id, order_id, email, amount, status, payment_method, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          reference,
          user_id,
          order_id,
          email || `apple_${user_id}@customer.ahia.com`,
          amount,
          "pending",
          "apple_pay",
          JSON.stringify({ ...metadata, payment_request: paymentRequest }),
        ],
      );

      console.log("✅ Apple Pay payment initialized:", reference);

      return res.status(200).json({
        success: true,
        message: "Payment initialized successfully",
        data: {
          reference,
          payment_request: paymentRequest,
        },
      });
    } catch (error) {
      console.error("Apple Pay initialization error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to initialize payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Process Apple Pay payment token
   * @route POST /api/payments/apple-pay/process
   */
  async processPayment(req, res) {
    const client = await db.pool.connect();
    try {
      const { reference, payment_token } = req.body;
      const user_id = req.user?.id;

      if (!reference || !payment_token) {
        return res.status(400).json({
          success: false,
          message: "Reference and payment token are required",
        });
      }

      await client.query("BEGIN");

      // Get transaction
      const txResult = await client.query(
        "SELECT * FROM transactions WHERE reference = $1 AND user_id = $2",
        [reference, user_id],
      );

      if (txResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      const transaction = txResult.rows[0];

      // In production, you would:
      // 1. Decrypt the payment token using your merchant certificate
      // 2. Process the payment with your payment processor
      // 3. Verify the payment status

      // For now, we'll simulate successful processing
      const paymentResult = {
        success: true,
        transactionId: crypto.randomBytes(16).toString("hex"),
        status: "success",
        processedAt: new Date().toISOString(),
      };

      // Update transaction
      await client.query(
        `UPDATE transactions 
         SET status = $1, 
             verified_at = NOW(),
             paystack_response = $2
         WHERE reference = $3`,
        ["success", JSON.stringify(paymentResult), reference],
      );

      // Update order status
      if (transaction.order_id) {
        await client.query(
          `UPDATE orders 
           SET payment_status = 'paid', 
               status = 'processing',
               updated_at = NOW()
           WHERE id = $1`,
          [transaction.order_id],
        );
      }

      await client.query("COMMIT");

      console.log("✅ Apple Pay payment processed:", reference);

      return res.status(200).json({
        success: true,
        message: "Payment processed successfully",
        data: {
          reference,
          status: "success",
          transaction_id: paymentResult.transactionId,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Apple Pay processing error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to process payment",
        error: error.message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Verify Apple Pay payment
   * @route GET /api/payments/apple-pay/verify/:reference
   */
  async verifyPayment(req, res) {
    try {
      const { reference } = req.params;
      const user_id = req.user?.id;

      const result = await db.query(
        `SELECT * FROM transactions 
         WHERE reference = $1 AND user_id = $2`,
        [reference, user_id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      const transaction = result.rows[0];

      return res.status(200).json({
        success: true,
        message: "Payment verification completed",
        data: {
          reference: transaction.reference,
          status: transaction.status,
          amount: transaction.amount,
          order_id: transaction.order_id,
          verified_at: transaction.verified_at,
        },
      });
    } catch (error) {
      console.error("Apple Pay verification error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to verify payment",
        error: error.message,
      });
    }
  }

  /**
   * Get Apple Pay transaction details
   * @route GET /api/payments/apple-pay/transaction/:reference
   */
  async getTransaction(req, res) {
    try {
      const { reference } = req.params;
      const user_id = req.user?.id;

      const result = await db.query(
        `SELECT id, reference, order_id, amount, status, payment_method, 
                created_at, verified_at
         FROM transactions 
         WHERE reference = $1 AND user_id = $2`,
        [reference, user_id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Get Apple Pay transaction error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transaction",
        error: error.message,
      });
    }
  }
}

module.exports = new ApplePayController();
