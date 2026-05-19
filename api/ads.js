// ============================================================
// BLACKHEX — Ad Reward Endpoint
// ============================================================

import { connectDB, User, Settings, Transaction } from './db.js';

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

    // ── Fetch dynamic ad reward from settings ──
    const adRewardSetting = await Settings.findOne({ key: 'adReward' });
    const rewardAmount = adRewardSetting?.value ?? 2;

    // ── Find user ──
    const user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please restart the app.' });
    }

    // ── Credit reward ──
    user.balance    += rewardAmount;
    user.adsWatched  = (user.adsWatched || 0) + 1;
    await user.save();

    // ── Log transaction ──
    await new Transaction({
      telegramId: String(telegramId),
      type: 'ad',
      amount: rewardAmount,
      description: `Ad watched — reward ৳${rewardAmount}`,
    }).save();

    return res.status(200).json({
      success: true,
      newBalance: user.balance,
      reward: rewardAmount,
      adsWatched: user.adsWatched,
    });

  } catch (err) {
    console.error('[Ads Error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
