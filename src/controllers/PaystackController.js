// src/controllers/paystackController.js
const axios = require("axios");
const db = require("../config/database");

/**
 * Paystack Payment Controller
 * Integrated with PostgreSQL database for transaction tracking
 */

class PaystackController {
  constructor() {
    this.secretKey =
      process.env.PAYSTACK_SECRET_KEY ||
      "sk_test_3b69b63e894d9fb3d02d55811c9851bfb5d80dd5";
    this.publicKey =
      process.env.PAYSTACK_PUBLIC_KEY ||
      "pk_test_4e10038792017cd67e2aecf9233f68bd6fe07d6d";
    this.baseURL = "https://api.paystack.co";

    this.paystackAPI = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Initialize a payment transaction
   */
  async initializePayment(req, res) {
    const client = await db.pool.connect();
    try {
      const { email, amount, order_id, metadata } = req.body;
      const user_id = req.user?.id; // From auth middleware

      // Validate required fields
      if (!email || !amount) {
        return res.status(400).json({
          success: false,
          message: "Email and amount are required fields",
        });
      }

      // Generate unique reference
      const reference = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Prepare payment data
      const paymentData = {
        email,
        amount: Math.round(amount * 100), // Convert to kobo
        reference,
        callback_url: `${process.env.API_URL}/api/payments/callback`,
        metadata: {
          ...metadata,
          order_id,
          user_id,
          custom_fields: [
            {
              display_name: "Order ID",
              variable_name: "order_id",
              value: order_id || "N/A",
            },
          ],
        },
      };

      // Initialize payment with Paystack
      const response = await this.paystackAPI.post(
        "/transaction/initialize",
        paymentData,
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
          email,
          amount,
          "pending",
          "paystack",
          JSON.stringify(metadata || {}),
        ],
      );

      return res.status(200).json({
        success: true,
        message: "Payment initialized successfully",
        data: {
          authorization_url: response.data.data.authorization_url,
          access_code: response.data.data.access_code,
          reference: response.data.data.reference,
        },
      });
    } catch (error) {
      console.error(
        "Payment initialization error:",
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
   * Verify a payment transaction
   */
  // In paystackController.js
  async verifyPayment(req, res) {
    const client = await db.pool.connect();
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Transaction reference is required",
        });
      }

      // Verify with Paystack
      const response = await this.paystackAPI.get(
        `/transaction/verify/${reference}`,
      );
      const paystackData = response.data.data;

      // Update transaction in database
      await client.query("BEGIN");

      const updateResult = await client.query(
        `UPDATE transactions 
       SET status = $1, 
           verified_at = NOW(),
           paystack_response = $2,
           authorization_code = $3
       WHERE reference = $4
       RETURNING *`,
        [
          paystackData.status,
          JSON.stringify(paystackData),
          paystackData.authorization?.authorization_code,
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

      console.log("=== TRANSACTION FOUND ===");
      console.log("Transaction order_id:", transaction.order_id);

      // If payment successful, update order status
      if (paystackData.status === "success" && transaction.order_id) {
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

      return res.status(200).json({
        success: true,
        message:
          paystackData.status === "success"
            ? "Payment verified successfully"
            : "Payment verification completed",
        data: {
          status: paystackData.status,
          amount: paystackData.amount / 100,
          reference,
          order_id: transaction.order_id, // CRITICAL: Include this
          customer: paystackData.customer,
          paid_at: paystackData.paid_at,
          channel: paystackData.channel,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(
        "Payment verification error:",
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
   * Handle Paystack webhook
   */
  async handleWebhook(req, res) {
    const client = await db.pool.connect();
    try {
      // Verify webhook signature
      const hash = require("crypto")
        .createHmac("sha512", this.secretKey)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(401).json({
          success: false,
          message: "Invalid signature",
        });
      }

      const event = req.body;
      const eventData = event.data;

      await client.query("BEGIN");

      // Log webhook event
      await client.query(
        `INSERT INTO webhook_logs 
        (event_type, reference, payload, received_at)
        VALUES ($1, $2, $3, NOW())`,
        [event.event, eventData.reference, JSON.stringify(event)],
      );

      // Handle different event types
      switch (event.event) {
        case "charge.success":
          await client.query(
            `UPDATE transactions 
             SET status = 'success',
                 verified_at = NOW(),
                 paystack_response = $1
             WHERE reference = $2`,
            [JSON.stringify(eventData), eventData.reference],
          );

          // Update order if exists
          const txResult = await client.query(
            "SELECT order_id FROM transactions WHERE reference = $1",
            [eventData.reference],
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
          break;

        case "charge.failed":
          await client.query(
            `UPDATE transactions 
             SET status = 'failed',
                 paystack_response = $1
             WHERE reference = $2`,
            [JSON.stringify(eventData), eventData.reference],
          );
          break;

        default:
          console.log("Unhandled webhook event:", event.event);
      }

      await client.query("COMMIT");

      return res.status(200).json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Webhook error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Webhook processing failed",
      });
    } finally {
      client.release();
    }
  }

  /**
   * Get transaction history for a user
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
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [user_id, limit, offset],
      );

      const countResult = await db.query(
        "SELECT COUNT(*) FROM transactions WHERE user_id = $1",
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
      console.error("Get transactions error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
      });
    }
  }

  /**
   * Get single transaction details
   */
  async getTransaction(req, res) {
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

      return res.status(200).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Get transaction error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch transaction",
      });
    }
  }

  /**
   * Charge authorization (recurring payments)
   */
  async chargeAuthorization(req, res) {
    const client = await db.pool.connect();
    try {
      const { email, amount, authorization_code, order_id, metadata } =
        req.body;
      const user_id = req.user?.id;

      if (!email || !amount || !authorization_code) {
        return res.status(400).json({
          success: false,
          message: "Email, amount, and authorization_code are required",
        });
      }

      const reference = `REC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Charge with Paystack
      const response = await this.paystackAPI.post(
        "/transaction/charge_authorization",
        {
          email,
          amount: Math.round(amount * 100),
          authorization_code,
          reference,
        },
      );

      // Save to database
      await client.query(
        `INSERT INTO transactions 
        (reference, user_id, order_id, email, amount, status, payment_method, 
         authorization_code, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          reference,
          user_id,
          order_id,
          email,
          amount,
          response.data.data.status,
          "paystack_recurring",
          authorization_code,
          JSON.stringify(metadata || {}),
        ],
      );

      return res.status(200).json({
        success: true,
        message: "Charge successful",
        data: response.data.data,
      });
    } catch (error) {
      console.error(
        "Charge authorization error:",
        error.response?.data || error.message,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to charge authorization",
        error: error.response?.data?.message || error.message,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Get public key for frontend
   */
  getPublicKey(req, res) {
    return res.status(200).json({
      success: true,
      public_key: this.publicKey,
    });
  }
}

module.exports = new PaystackController();
