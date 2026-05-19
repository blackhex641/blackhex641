import mongoose from 'mongoose';

let cached = global.mongoose || { conn: null, promise: null };
global.mongoose = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ── Schemas ──
const UserSchema = new mongoose.Schema({
  telegramId:    { type: String, required: true, unique: true, index: true },
  username:      { type: String, default: '' },
  balance:       { type: Number, default: 0 },
  points:        { type: Number, default: 0 },
  proxiesBought: { type: Number, default: 0 },
  adsWatched:    { type: Number, default: 0 },
  totalEarned:   { type: Number, default: 0 },
  lastClaim:     { type: String, default: null },
  claimHistory:  { type: [String], default: [] },
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
  type:        { type: String, enum: ['proxy', 'ad', 'deposit', 'deduct', 'adjust', 'claim', 'spin'] },
  amount:      { type: Number, required: true },
  description: { type: String, default: '' },
  proxyDetails:{ type: String, default: '' },
  depositId:   { type: String, default: '' },
}, { timestamps: true });

const DepositSchema = new mongoose.Schema({
  telegramId:    { type: String, required: true, index: true },
  username:      { type: String, default: '' },
  method:        { type: String, required: true },
  amount:        { type: Number, required: true },
  txId:          { type: String, required: true },
  status:        { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  rejectNote:    { type: String, default: '' },
  adminNote:     { type: String, default: '' },
}, { timestamps: true });

const PaymentMethodSchema = new mongoose.Schema({
  method:   { type: String, required: true, unique: true },
  number:   { type: String, required: true },
  enabled:  { type: Boolean, default: true },
  label:    { type: String, default: '' },
}, { timestamps: true });

export const User          = mongoose.models.User          || mongoose.model('User',          UserSchema);
export const Proxy         = mongoose.models.Proxy         || mongoose.model('Proxy',         ProxySchema);
export const Settings      = mongoose.models.Settings      || mongoose.model('Settings',      SettingsSchema);
export const Transaction   = mongoose.models.Transaction   || mongoose.model('Transaction',   TransactionSchema);
export const Deposit       = mongoose.models.Deposit       || mongoose.model('Deposit',       DepositSchema);
export const PaymentMethod = mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', PaymentMethodSchema);

// ── Admin Token Check ──
function verifyAdmin(req) {
  const auth = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  return auth === process.env.ADMIN_TOKEN;
}

// ── Today's date string ──
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();
  const action = req.query?.action || req.body?.action;

  try {

    // ════════════════════════════════
    // PUBLIC ACTIONS
    // ════════════════════════════════

    if (action === 'getUser') {
      const { telegramId } = req.query;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ user });
    }

    if (action === 'createUser') {
      const { telegramId, username } = req.body;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
      let user = await User.findOne({ telegramId });
      if (user) return res.json({ user });
      user = await User.create({ telegramId, username: username || '', balance: 0, points: 0 });
      return res.status(201).json({ user });
    }

    if (action === 'getSettings') {
      const [adR, bkash] = await Promise.all([
        Settings.findOne({ key: 'adReward' }),
        Settings.findOne({ key: 'bkashNumber' }),
      ]);
      return res.json({ settings: { adReward: adR?.value ?? 2, bkashNumber: bkash?.value ?? 'N/A' } });
    }

    if (action === 'getPaymentMethods') {
      const methods = await PaymentMethod.find({ enabled: true });
      return res.json({ methods });
    }

    if (action === 'getHistory') {
      const { telegramId } = req.query;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
      const history = await Transaction.find({ telegramId }).sort({ createdAt: -1 }).limit(100);
      return res.json({ history });
    }

    if (action === 'getDeposits') {
      const { telegramId } = req.query;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });
      const deposits = await Deposit.find({ telegramId }).sort({ createdAt: -1 }).limit(50);
      return res.json({ deposits });
    }

    if (action === 'submitDeposit') {
      const { telegramId, username, method, amount, txId } = req.body;
      if (!telegramId || !method || !amount || !txId)
        return res.status(400).json({ error: 'All fields required' });

      const existing = await Deposit.findOne({ txId, telegramId });
      if (existing) return res.status(400).json({ error: 'Transaction ID already submitted' });

      const deposit = await Deposit.create({ telegramId, username, method, amount, txId, status: 'pending' });
      return res.status(201).json({ deposit });
    }

    if (action === 'leaderboard') {
      const users = await User.find({ adsWatched: { $gt: 0 } })
        .sort({ totalEarned: -1 })
        .limit(20)
        .select('telegramId username totalEarned adsWatched balance');
      return res.json({ leaderboard: users });
    }

    if (action === 'claimDaily') {
      const { telegramId } = req.body;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });

      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const today = todayStr();
      if (user.lastClaim === today) {
        return res.status(400).json({ error: 'Already claimed today', claimed: true });
      }

      user.balance += 1;
      user.totalEarned = (user.totalEarned || 0) + 1;
      user.lastClaim = today;
      if (!user.claimHistory.includes(today)) user.claimHistory.push(today);
      await user.save();

      await Transaction.create({
        telegramId, type: 'claim', amount: 1, description: 'Daily ৳1 claim'
      });

      return res.json({ success: true, newBalance: user.balance, claimHistory: user.claimHistory });
    }

    if (action === 'getClaimStatus') {
      const { telegramId } = req.query;
      const user = await User.findOne({ telegramId }).select('lastClaim claimHistory');
      if (!user) return res.status(404).json({ error: 'Not found' });
      return res.json({ lastClaim: user.lastClaim, claimHistory: user.claimHistory || [] });
    }

    if (action === 'spin') {
      const { telegramId } = req.body;
      if (!telegramId) return res.status(400).json({ error: 'telegramId required' });

      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if ((user.points || 0) < 2) return res.status(400).json({ error: 'Not enough points (need 2)' });

      // 80% chance: 1–3 points, 20% chance: 4–10 points
      let prize;
      const rand = Math.random();
      if (rand < 0.80) {
        prize = Math.floor(Math.random() * 3) + 1; // 1,2,3
      } else {
        prize = Math.floor(Math.random() * 7) + 4; // 4..10
      }

      // Determine if it's "Better Luck" (only when prize=1 in the 80%)
      const isBetterLuck = (prize === 1 && rand < 0.80);

      user.points -= 2;
      if (!isBetterLuck) {
        user.balance += prize;
        user.totalEarned = (user.totalEarned || 0) + prize;
      }
      await user.save();

      if (!isBetterLuck) {
        await Transaction.create({
          telegramId, type: 'spin', amount: prize,
          description: `Spinner win: ৳${prize}`
        });
      }

      return res.json({
        success: true,
        prize,
        betterLuck: isBetterLuck,
        newBalance: user.balance,
        newPoints: user.points
      });
    }

    // ════════════════════════════════
    // ADMIN ACTIONS
    // ════════════════════════════════

    if (!verifyAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'stats') {
      const [totalUsers, availableProxies, soldProxies, pendingDeposits] = await Promise.all([
        User.countDocuments(),
        Proxy.countDocuments({ status: 'available' }),
        Proxy.countDocuments({ status: 'sold' }),
        Deposit.countDocuments({ status: 'pending' }),
      ]);
      return res.json({ totalUsers, availableProxies, soldProxies, pendingDeposits });
    }

    if (action === 'users') {
      const users = await User.find().sort({ createdAt: -1 }).limit(200);
      return res.json({ users });
    }

    if (action === 'proxies') {
      const proxies = await Proxy.find().sort({ createdAt: -1 }).limit(500);
      return res.json({ proxies });
    }

    if (action === 'addProxy') {
      const { proxyDetails } = req.body;
      if (!proxyDetails) return res.status(400).json({ error: 'proxyDetails required' });
      const proxy = await Proxy.create({ proxyDetails, status: 'available' });
      return res.status(201).json({ proxy });
    }

    if (action === 'deleteProxy') {
      const { proxyId } = req.body;
      await Proxy.findByIdAndDelete(proxyId);
      return res.json({ success: true });
    }

    if (action === 'saveSettings') {
      const { adReward, bkashNumber } = req.body;
      await Settings.findOneAndUpdate({ key: 'adReward' }, { key: 'adReward', value: adReward }, { upsert: true });
      await Settings.findOneAndUpdate({ key: 'bkashNumber' }, { key: 'bkashNumber', value: bkashNumber }, { upsert: true });
      return res.json({ success: true });
    }

    if (action === 'adjustBalance') {
      const { telegramId, amount } = req.body;
      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ error: 'User not found' });
      user.balance = Math.max(0, user.balance + Number(amount));
      await user.save();
      await Transaction.create({ telegramId, type: 'adjust', amount: Number(amount), description: 'Admin balance adjustment' });
      return res.json({ success: true, newBalance: user.balance });
    }

    if (action === 'allDeposits') {
      const deposits = await Deposit.find().sort({ createdAt: -1 }).limit(200);
      return res.json({ deposits });
    }

    if (action === 'approveDeposit') {
      const { depositId } = req.body;
      const deposit = await Deposit.findById(depositId);
      if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
      if (deposit.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

      deposit.status = 'approved';
      await deposit.save();

      const user = await User.findOne({ telegramId: deposit.telegramId });
      if (user) {
        user.balance += deposit.amount;
        user.totalEarned = (user.totalEarned || 0) + deposit.amount;
        await user.save();
      }

      await Transaction.create({
        telegramId: deposit.telegramId,
        type: 'deposit',
        amount: deposit.amount,
        description: `Deposit approved via ${deposit.method} — TxID: ${deposit.txId}`,
        depositId: String(depositId)
      });

      return res.json({ success: true });
    }

    if (action === 'rejectDeposit') {
      const { depositId, rejectNote } = req.body;
      const deposit = await Deposit.findById(depositId);
      if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
      if (deposit.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

      deposit.status = 'rejected';
      deposit.rejectNote = rejectNote || 'Rejected by admin';
      await deposit.save();

      return res.json({ success: true });
    }

    if (action === 'getPaymentMethodsAdmin') {
      const methods = await PaymentMethod.find();
      return res.json({ methods });
    }

    if (action === 'savePaymentMethod') {
      const { method, number, enabled, label } = req.body;
      await PaymentMethod.findOneAndUpdate(
        { method },
        { method, number, enabled, label },
        { upsert: true, new: true }
      );
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('[DB Error]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
