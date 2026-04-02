import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, token, type } = req.body;

  if (!email) return res.status(400).json({ access: false, reason: 'No email provided' });

  const normalizedEmail = email.toLowerCase().trim();

  if (type === 'onetime' && token) {
    // Check if token is valid and belongs to this email
    const tokenEmail = await kv.get(`token:${token}`);
    if (tokenEmail && tokenEmail.toLowerCase() === normalizedEmail) {
      // Delete the token so it can only be used once
      await kv.del(`token:${token}`);
      await kv.del(`onetime:${normalizedEmail}`);
      return res.status(200).json({ access: true, type: 'onetime' });
    }
    return res.status(200).json({ access: false, reason: 'Invalid or expired token' });
  }

  if (type === 'subscription') {
    // Check if email has an active subscription
    const status = await kv.get(`sub:${normalizedEmail}`);
    if (status === 'active') {
      return res.status(200).json({ access: true, type: 'subscription' });
    }
    return res.status(200).json({ access: false, reason: 'No active subscription found' });
  }

  // Check either — used when returning from Stripe
  const subStatus = await kv.get(`sub:${normalizedEmail}`);
  if (subStatus === 'active') {
    return res.status(200).json({ access: true, type: 'subscription' });
  }

  const onetimeToken = await kv.get(`onetime:${normalizedEmail}`);
  if (onetimeToken) {
    return res.status(200).json({ access: true, type: 'onetime', token: onetimeToken });
  }

  return res.status(200).json({ access: false, reason: 'No payment found for this email' });
}
