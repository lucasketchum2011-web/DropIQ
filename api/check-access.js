const ADMIN_EMAILS = ['lucas.ketchum2011@gmail.com'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, token, type } = req.body;

  if (!email) return res.status(400).json({ access: false, reason: 'No email provided' });

  const normalizedEmail = email.toLowerCase().trim();

  // Admin bypass — full unlimited access, no payment needed
  if (ADMIN_EMAILS.includes(normalizedEmail)) {
    return res.status(200).json({ access: true, type: 'subscription' });
  }

  try {
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    const redisToken = process.env.KV_REST_API_TOKEN;
    const redisApiUrl = process.env.KV_REST_API_URL;

    async function kvGet(key) {
      const url = `${redisApiUrl}/get/${encodeURIComponent(key)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${redisToken}` } });
      const d = await r.json();
      return d.result;
    }

    async function kvDel(key) {
      const url = `${redisApiUrl}/del/${encodeURIComponent(key)}`;
      await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${redisToken}` } });
    }

    if (type === 'onetime' && token) {
      const tokenEmail = await kvGet(`token:${token}`);
      if (tokenEmail && tokenEmail.toLowerCase() === normalizedEmail) {
        await kvDel(`token:${token}`);
        await kvDel(`onetime:${normalizedEmail}`);
        return res.status(200).json({ access: true, type: 'onetime' });
      }
      return res.status(200).json({ access: false, reason: 'Invalid or expired token' });
    }

    if (type === 'subscription') {
      const status = await kvGet(`sub:${normalizedEmail}`);
      if (status === 'active') {
        return res.status(200).json({ access: true, type: 'subscription' });
      }
      return res.status(200).json({ access: false, reason: 'No active subscription found' });
    }

    const subStatus = await kvGet(`sub:${normalizedEmail}`);
    if (subStatus === 'active') {
      return res.status(200).json({ access: true, type: 'subscription' });
    }

    const onetimeToken = await kvGet(`onetime:${normalizedEmail}`);
    if (onetimeToken) {
      return res.status(200).json({ access: true, type: 'onetime', token: onetimeToken });
    }

    return res.status(200).json({ access: false, reason: 'No payment found for this email' });

  } catch (err) {
    console.error('check-access error:', err);
    return res.status(500).json({ access: false, reason: 'Server error' });
  }
}
