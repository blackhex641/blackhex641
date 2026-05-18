// ============================================================
// BLACKHEX — Proxy Purchase Endpoint
// ============================================================

import { connectDB, User, Proxy, Transaction } from './db.js';

const PROXY_COST = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { telegramId } = req.body || {};

  if (!telegramId) {
    return res.status(400).json({ error: 'telegramId is required' });
  }

  try {
    await connectDB();

    // ── Find user ──
    const user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please restart the app.' });
    }

    // ── Balance check ──
    if (user.balance < PROXY_COST) {
      const needed = (PROXY_COST - user.balance).toFixed(2);
      return res.status(402).json({
        error: `Insufficient balance. You need ৳${needed} more.`,
        currentBalance: user.balance,
        needed: Number(needed),
      });
    }

    // ── Find available proxy ──
    const proxy = await Proxy.findOneAndUpdate(
      { status: 'available' },
      { $set: { status: 'sold' } },
      { new: true }
    );

    if (!proxy) {
      return res.status(503).json({ error: 'No proxies available right now. Please contact admin.' });
    }

    // ── Deduct balance ──
    user.balance       -= PROXY_COST;
    user.proxiesBought  = (user.proxiesBought || 0) + 1;
    await user.save();

    // ── Log transaction ──
    await new Transaction({
      telegramId: String(telegramId),
      type: 'proxy',
      amount: -PROXY_COST,
      description: `Proxy purchased — ৳${PROXY_COST} deducted`,
    }).save();

    return res.status(200).json({
      success: true,
      proxyDetails: proxy.proxyDetails,
      newBalance: user.balance,
      cost: PROXY_COST,
    });

  } catch (err) {
    console.error('[Proxy Error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
