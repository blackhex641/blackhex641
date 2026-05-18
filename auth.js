// ============================================================
// BLACKHEX — Admin Authentication Endpoint
// ============================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD;
  const adminToken    = process.env.ADMIN_TOKEN;

  if (!validPassword || !adminToken) {
    console.error('ADMIN_PASSWORD or ADMIN_TOKEN env vars not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (username === validUsername && password === validPassword) {
    return res.status(200).json({ token: adminToken, message: 'Authentication successful' });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
}
