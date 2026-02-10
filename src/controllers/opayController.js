// src/controllers/opayController.js
const axios = require("axios");
const db = require("../config/database");
const crypto = require("crypto");

/**
 * OPay Payment Controller
 * Handles OPay payment processing for Nigerian transactions
 */

class OPayController {
  constructor() {
    // OPay API configuration
    this.merchantId = process.env.OPAY_MERCHANT_ID || "256621122019002";
    this.publicKey =
      process.env.OPAY_PUBLIC_KEY || "OPAYPUB16771278384150.7493278378903517";
    this.privateKey =
      process.env.OPAY_PRIVATE_KEY || "OPAYPRV16771278384170.7906293353394614";
    this.baseURL =
      process.env.OPAY_BASE_URL || "https://sandboxapi.opayweb.com";

    this.opayAPI = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
        MerchantId: this.merchantId,
      },
    });
  }

  /**
   * Generate signature for OPay API requests
   */
  generateSignature(data) {
    const sortedKeys = Object.keys(data).sort();
    const signatureString =
      sortedKeys.map((key) => `${key}=${data[key]}`).join("&") +
      `&${this.privateKey}`;

    return crypto.createHash("sha512").update(signatureString).digest("hex");
  }

  /**
   * Initialize OPay payment
   * @route POST /api/payments/opay/initialize
   */
  async initializePayment(req, res) {
    const client = await db.pool.connect();
    try {
      const { email, amount, order_id, phone, metadata } = req.body;
      const user_id = req.user?.id;

      // Validate required fields
      if (!amount || !order_id) {
        return res.status(400).json({
          success: false,
          message: "Amount and order_id are required",
        });
      }

      // Generate unique reference
      const reference = `OPAY-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      // Prepare OPay payment request
      const paymentData = {
        reference: reference,
        mchShortName: this.merchantId,
        productName: metadata?.items?.[0]?.name || "Order Payment",
        productDesc: `Payment for order ${order_id}`,
        userPhone: phone || "+234",
        userRequestIp: req.ip,
        amount: Math.round(amount * 100), // Convert to kobo
        currency: "NGN",
        payMethods: [
          "account",
          "qrcode",
          "bankCard",
          "bankTransfer",
          "bankUSSD",
        ],
        payTypes: ["BalancePayment", "BonusPayment"],
        callbackUrl: `${process.env.API_URL}/api/payments/opay/callback`,
        returnUrl: `${process.env.FRONTEND_URL}/order-success`,
        expireAt: Date.now() + 1800000, // 30 minutes
      };

      // Generate signature
      paymentData.signature = this.generateSignature({
        reference: paymentData.reference,
        amount: paymentData.amount,
        currency: paymentData.currency,
      });

      // Initialize payment with OPay
      const response = await this.opayAPI.post(
        "/api/v3/cashier/initialize",
        paymentData,
        {
          headers: {
            Authorization: `Bearer ${this.publicKey}`,
          },
        },
      );

      // Save transaction to database
      await client.query(
        `INSERT INTO transactions 
        (reference, user_id, order_id, email, amount, status, payment_method, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          reference,
          user_id,
          order_id,
          email || `opay_${user_id}@customer.ahia.com`,
          amount,
          "pending",
          "opay",
          JSON.stringify({ ...metadata, opay_response: response.data }),
        ],
      );

      console.log("✅ OPay payment initialized:", reference);

      return res.status(200).json({
        success: true,
        message: "Payment initialized successfully",
        data: {
          reference,
          cashierUrl: response.data.data?.cashierUrl,
          orderNo: response.data.data?.orderNo,
        },
      });
    } catch (error) {
      console.error(
        "OPay initialization error:",
        error.response?.data || error.message,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to initialize payment",
        error: error.response?.data?.message || error.message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Verify OPay payment
   * @route GET /api/payments/opay/verify/:reference
   */
  async verifyPayment(req, res) {
    const client = await db.pool.connect();
    try {
      const { reference } = req.params;
      const user_id = req.user?.id;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Transaction reference is required",
        });
      }

      // Query OPay for transaction status
      const queryData = {
        reference: reference,
        orderNo: reference,
      };

      queryData.signature = this.generateSignature({
        reference: queryData.reference,
      });

      const response = await this.opayAPI.post(
        "/api/v3/cashier/status",
        queryData,
        {
          headers: {
            Authorization: `Bearer ${this.publicKey}`,
          },
        },
      );

      const opayData = response.data.data;

      // Update transaction in database
      await client.query("BEGIN");

      const updateResult = await client.query(
        `UPDATE transactions 
         SET status = $1, 
             verified_at = NOW(),
             paystack_response = $2
         WHERE reference = $3
         RETURNING *`,
        [
          opayData.status === "SUCCESS"
            ? "success"
            : opayData.status.toLowerCase(),
          JSON.stringify(opayData),
          reference,
        ],
      );

      if (updateResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Transaction not found in database",
        });
      }

      const transaction = updateResult.rows[0];

      // If payment successful, update order status
      if (opayData.status === "SUCCESS" && transaction.order_id) {
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

      console.log("✅ OPay payment verified:", reference);

      return res.status(200).json({
        success: true,
        message:
          opayData.status === "SUCCESS"
            ? "Payment verified successfully"
            : "Payment verification completed",
        data: {
          status: opayData.status,
          amount: opayData.amount / 100,
          reference,
          transaction_time: opayData.transactionTime,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        "OPay verification error:",
        error.response?.data || error.message,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to verify payment",
        error: error.response?.data?.message || error.message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Handle OPay callback
   * @route POST /api/payments/opay/callback
   */
  async handleCallback(req, res) {
    const client = await db.pool.connect();
    try {
      const callbackData = req.body;

      // Verify signature
      const receivedSignature = callbackData.signature;
      delete callbackData.signature;

      const calculatedSignature = this.generateSignature(callbackData);

      if (receivedSignature !== calculatedSignature) {
        return res.status(401).json({
          success: false,
          message: "Invalid signature",
        });
      }

      await client.query("BEGIN");

      // Log callback
      await client.query(
        `INSERT INTO webhook_logs 
        (event_type, reference, payload, received_at)
        VALUES ($1, $2, $3, NOW())`,
        ["opay_callback", callbackData.reference, JSON.stringify(callbackData)],
      );

      // Update transaction
      const status = callbackData.status === "SUCCESS" ? "success" : "failed";

      await client.query(
        `UPDATE transactions 
         SET status = $1,
             verified_at = NOW(),
             paystack_response = $2
         WHERE reference = $3`,
        [status, JSON.stringify(callbackData), callbackData.reference],
      );

      // Update order if payment successful
      if (status === "success") {
        const txResult = await client.query(
          "SELECT order_id FROM transactions WHERE reference = $1",
          [callbackData.reference],
        );

        if (txResult.rows[0]?.order_id) {
          await client.query(
            `UPDATE orders 
             SET payment_status = 'paid', 
                 status = 'processing'
             WHERE id = $1`,
            [txResult.rows[0].order_id],
          );
        }
      }

      await client.query("COMMIT");

      console.log("✅ OPay callback processed:", callbackData.reference);

      return res.status(200).json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("OPay callback error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Callback processing failed",
      });
    } finally {
      client.release();
    }
  }

  /**
   * Get OPay transaction details
   * @route GET /api/payments/opay/transaction/:reference
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
      console.error("Get OPay transaction error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transaction",
        error: error.message,
      });
    }
  }

  /**
   * Get user's OPay transactions
   * @route GET /api/payments/opay/transactions
   */
  async getUserTransactions(req, res) {
    try {
      const user_id = req.user?.id;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const result = await db.query(
        `SELECT id, reference, order_id, amount, status, payment_method, 
                created_at, verified_at
         FROM transactions
         WHERE user_id = $1 AND payment_method = 'opay'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [user_id, limit, offset],
      );

      const countResult = await db.query(
        "SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND payment_method = 'opay'",
        [user_id],
      );

      return res.status(200).json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
        },
      });
    } catch (error) {
      console.error("Get OPay transactions error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
      });
    }
  }

  /**
   * Cancel OPay transaction
   * @route POST /api/payments/opay/cancel/:reference
   */
  async cancelTransaction(req, res) {
    const client = await db.pool.connect();
    try {
      const { reference } = req.params;
      const user_id = req.user?.id;

      // Get transaction
      const txResult = await client.query(
        "SELECT * FROM transactions WHERE reference = $1 AND user_id = $2",
        [reference, user_id],
      );

      if (txResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      const transaction = txResult.rows[0];

      if (transaction.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Can only cancel pending transactions",
        });
      }

      // Update transaction status
      await client.query(
        "UPDATE transactions SET status = 'cancelled' WHERE reference = $1",
        [reference],
      );

      console.log("✅ OPay transaction cancelled:", reference);

      return res.status(200).json({
        success: true,
        message: "Transaction cancelled successfully",
      });
    } catch (error) {
      console.error("Cancel OPay transaction error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to cancel transaction",
        error: error.message,
      });
    } finally {
      client.release();
    }
  }
}

module.exports = new OPayController();
