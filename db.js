// ============================================================
// BLACKHEX — MongoDB Connection + Models + Admin API Handler
// ============================================================

import mongoose from 'mongoose';

// ── Connection Cache (Vercel serverless warm reuse) ──
let cached = global.mongoose || { conn: null, promise: null };
global.mongoose = cached;

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
    }).then(m => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// ── Schemas ──
const UserSchema = new mongoose.Schema({
  telegramId:    { type: String, required: true, unique: true, index: true },
  username:      { type: String, default: '' },
  balance:       { type: Number, default: 0 },
  proxiesBought: { type: Number, default: 0 },
  adsWatched:    { type: Number, default: 0 },
}, { timestamps: true });

const ProxySchema = new mongoose.Schema({
  proxyDetails: { type: String, required: true },
  status:       { type: String, default: 'available', enum: ['available', 'sold'] },
}, { timestamps: true });

const SettingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  telegramId:  { type: String, required: true, index: true },
  type:        { type: String, enum: ['proxy', 'ad', 'deposit', 'deduct', 'adjust'] },
  amount:      { type: Number, required: true },
  description: { type: String, default: '' },
}, { timestamps: true });

// ── Model Registration (prevent recompile on hot reload) ──
const User        = mongoose.models.User        || mongoose.model('User',        UserSchema);
const Proxy       = mongoose.models.Proxy       || mongoose.model('Proxy',       ProxySchema);
const Settings    = mongoose.models.Settings    || mongoose.model('Settings',    SettingsSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

export { connectDB, User, Proxy, Settings, Transaction };

// ── Admin Token Verification ──
function verifyAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  return token === process.env.ADMIN_TOKEN;
}

// ── Serverless Handler ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  const action = req.query?.action || req.body?.action;

  try {
    // ── PUBLIC ACTIONS ──

    if (action === 'getUser') {
      const { telegramId } = req.query;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ user });
    }

    if (action === 'createUser') {
      const { telegramId, username } = req.body;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });

      let user = await User.findOne({ telegramId });
      if (user) return res.status(200).json({ user }); // Already exists

      user = new User({ telegramId, username: username || '', balance: 0 });
      await user.save();
      return res.status(201).json({ user });
    }

    if (action === 'getSettings') {
      const adRewardDoc    = await Settings.findOne({ key: 'adReward' });
      const bkashNumberDoc = await Settings.findOne({ key: 'bkashNumber' });
      return res.status(200).json({
        settings: {
          adReward:    adRewardDoc?.value ?? 2,
          bkashNumber: bkashNumberDoc?.value ?? 'N/A',
        }
      });
    }

    if (action === 'getHistory') {
      const { telegramId } = req.query;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
      const history = await Transaction.find({ telegramId }).sort({ createdAt: -1 }).limit(50);
      return res.status(200).json({ history });
    }

    // ── ADMIN-ONLY ACTIONS ──

    if (!verifyAdmin(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (action === 'stats') {
      const [totalUsers, availableProxies, soldProxies] = await Promise.all([
        User.countDocuments(),
        Proxy.countDocuments({ status: 'available' }),
        Proxy.countDocuments({ status: 'sold' }),
      ]);
      return res.status(200).json({ totalUsers, availableProxies, soldProxies });
    }

    if (action === 'users') {
      const users = await User.find().sort({ createdAt: -1 }).limit(200);
      return res.status(200).json({ users });
    }

    if (action === 'proxies') {
      const proxies = await Proxy.find().sort({ createdAt: -1 }).limit(500);
      return res.status(200).json({ proxies });
    }

    if (action === 'addProxy') {
      const { proxyDetails } = req.body;
      if (!proxyDetails) return res.status(400).json({ error: 'proxyDetails required' });
      const proxy = new Proxy({ proxyDetails, status: 'available' });
      await proxy.save();
      return res.status(201).json({ proxy });
    }

    if (action === 'deleteProxy') {
      const { proxyId } = req.body;
      if (!proxyId) return res.status(400).json({ error: 'proxyId required' });
      await Proxy.findByIdAndDelete(proxyId);
      return res.status(200).json({ success: true });
    }

    if (action === 'saveSettings') {
      const { adReward, bkashNumber } = req.body;

      await Settings.findOneAndUpdate(
        { key: 'adReward' },
        { key: 'adReward', value: adReward },
        { upsert: true, new: true }
      );
      await Settings.findOneAndUpdate(
        { key: 'bkashNumber' },
        { key: 'bkashNumber', value: bkashNumber },
        { upsert: true, new: true }
      );

      return res.status(200).json({ success: true });
    }

    if (action === 'adjustBalance') {
      const { telegramId, amount } = req.body;
      if (!telegramId || isNaN(amount)) return res.status(400).json({ error: 'Invalid parameters' });

      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: 'User not found' });

      user.balance = Math.max(0, user.balance + Number(amount));
      await user.save();

      // Log transaction
      await new Transaction({
        telegramId,
        type: 'adjust',
        amount: Number(amount),
        description: 'Admin balance adjustment',
      }).save();

      return res.status(200).json({ success: true, newBalance: user.balance });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[DB Handler Error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
