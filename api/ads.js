import { connectDB, User, Settings, Transaction } from './db.js';

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
    const adRewardDoc = await Settings.findOne({ key: 'adReward' });
    const reward = adRewardDoc?.value ?? 2;

    const user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.balance    += reward;
    user.adsWatched  = (user.adsWatched || 0) + 1;
    user.totalEarned = (user.totalEarned || 0) + reward;
    user.points      = (user.points || 0) + 1; // 1 point per ad
    await user.save();

    await Transaction.create({
      telegramId: String(telegramId),
      type: 'ad', amount: reward,
      description: `Ad watched — ৳${reward} earned`
    });

    return res.json({ success: true, newBalance: user.balance, reward, newPoints: user.points });
  } catch (err) {
    console.error('[Ads Error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
