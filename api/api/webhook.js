import Stripe from 'stripe';
import { kv } from '@vercel/kv';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const session = event.data.object;
  const email = session.customer_details?.email || session.customer_email;

  if (!email) return res.status(200).json({ received: true });

  if (event.type === 'checkout.session.completed') {
    const mode = session.mode;

    if (mode === 'payment') {
      // One-time payment — store a single use token
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await kv.set(`onetime:${email}`, token, { ex: 86400 }); // expires in 24 hours
      await kv.set(`token:${token}`, email, { ex: 86400 });
      console.log(`One-time token created for ${email}`);
    }

    if (mode === 'subscription') {
      // Subscription — mark email as active subscriber
      await kv.set(`sub:${email}`, 'active');
      console.log(`Subscription activated for ${email}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    // Subscription cancelled — remove access
    const customer = await stripe.customers.retrieve(session.customer);
    const subEmail = customer.email;
    if (subEmail) {
      await kv.del(`sub:${subEmail}`);
      console.log(`Subscription cancelled for ${subEmail}`);
    }
  }

  return res.status(200).json({ received: true });
}
