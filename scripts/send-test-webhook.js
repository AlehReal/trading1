/**
 * Script to send a signed `checkout.session.completed` webhook to local server.
 * Usage: set env STRIPE_WEBHOOK_SECRET to the same value the server is started with.
 * Example:
 *   STRIPE_WEBHOOK_SECRET=whsec_test node scripts/send-test-webhook.js
 */

const axios = require('axios');
const Stripe = require('stripe');

const payload = {
  id: 'evt_test_checkout_completed',
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_12345',
      object: 'checkout.session',
      amount_total: 1000,
      currency: 'usd',
      customer_details: { email: 'test@example.com', name: 'Test User' },
      metadata: { user_email: 'test@example.com' }
    }
  }
};

async function main() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Please set STRIPE_WEBHOOK_SECRET in env to match the server (e.g. whsec_test)');
    process.exit(1);
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
  const payloadStr = JSON.stringify(payload);
  // Use stripe SDK helper to generate a test header
  const header = stripe.webhooks.generateTestHeaderString({ payload: payloadStr, secret });

  try {
    const res = await axios.post('http://localhost:8080/webhook', payloadStr, {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': header
      },
      timeout: 10000
    });
    console.log('Server response:', res.status, res.data);
  } catch (err) {
    if (err.response) console.error('Server error:', err.response.status, err.response.data);
    else console.error('Error sending webhook:', err.message);
  }
}

main();
