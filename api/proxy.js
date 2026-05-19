import { connectDB, User, Proxy, Transaction } from './db.js';

const PROXY_COST = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { telegramId } = req.body || {};
  if (!telegramId) return res.status(400).json({ error: 'telegramId required' });

  try {
    await connectDB();
    const user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.balance < PROXY_COST) {
      const needed = (PROXY_COST - user.balance).toFixed(2);
      return res.status(402).json({ error: `Insufficient balance. You need ৳${needed} more.`, needed: Number(needed) });
    }

    const proxy = await Proxy.findOneAndUpdate(
      { status: 'available' },
      { $set: { status: 'sold' } },
      { new: true }
    );
    if (!proxy) return res.status(503).json({ error: 'No proxies available. Contact admin.' });

    user.balance -= PROXY_COST;
    user.proxiesBought = (user.proxiesBought || 0) + 1;
    user.points = (user.points || 0) + 1; // 1 point per proxy buy
    await user.save();

    await Transaction.create({
      telegramId: String(telegramId),
      type: 'proxy',
      amount: -PROXY_COST,
      description: `Proxy purchased`,
      proxyDetails: proxy.proxyDetails,
    });

    return res.json({ success: true, proxyDetails: proxy.proxyDetails, newBalance: user.balance, newPoints: user.points });
  } catch (err) {
    console.error('[Proxy Error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
