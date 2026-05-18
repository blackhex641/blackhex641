/* ============================================================
   BLACKHEX — Frontend Application Logic
   ============================================================ */

// ── Telegram WebApp Init ──
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0a0a0f');
  tg.setBackgroundColor('#0a0a0f');
}

// ── State ──
let currentUser = null;         // { telegramId, username, balance, proxiesBought, adsWatched }
let adReward = 2;               // Default, fetched from DB
let adTimerInterval = null;
let adWatchedSuccessfully = false;
let proxyRawText = '';          // Full proxy text for copy

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

/* ============================================================
   INIT
   ============================================================ */
async function initApp() {
  const tgUser = tg?.initDataUnsafe?.user;

  if (!tgUser) {
    // Fallback for dev/browser testing
    console.warn('No Telegram user found. Using mock user.');
    const mock = { id: 123456789, first_name: 'Dev', last_name: 'User', username: 'devuser' };
    await setupUser(mock);
  } else {
    await setupUser(tgUser);
  }

  loadSettings();
}

async function setupUser(tgUser) {
  const telegramId = String(tgUser.id);
  const username = tgUser.username || tgUser.first_name || 'Anonymous';

  // Update header avatar with first letter
  const initial = (tgUser.first_name || username || 'U')[0].toUpperCase();
  document.getElementById('headerAvatar').textContent = initial;
  document.getElementById('profileAvatar').textContent = initial;

  // Update display labels
  document.getElementById('usernameDisplay').textContent = username;
  document.getElementById('tgIdDisplay').textContent = `#${telegramId}`;
  document.getElementById('profileName').textContent = (tgUser.first_name || '') + ' ' + (tgUser.last_name || '');
  document.getElementById('profileTgId').textContent = `ID: ${telegramId}`;

  // Fetch or create user from DB
  try {
    const res = await fetch(`/api/db?action=getUser&telegramId=${telegramId}`);
    const data = await res.json();

    if (res.ok && data.user) {
      currentUser = data.user;
    } else {
      // User not found — create them
      const createRes = await fetch('/api/db?action=createUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, username })
      });
      const createData = await createRes.json();
      currentUser = createData.user;
    }

    updateBalanceUI();
  } catch (err) {
    console.error('Failed to load user:', err);
    showToast('Connection error. Check network.', 'error');
  }
}

/* ============================================================
   SETTINGS (Ad Reward + bKash)
   ============================================================ */
async function loadSettings() {
  try {
    const res = await fetch('/api/db?action=getSettings');
    const data = await res.json();
    if (data.settings) {
      adReward = data.settings.adReward || 2;
      const bkash = data.settings.bkashNumber || 'N/A';

      document.getElementById('adRewardDisplay').textContent = `৳${adReward}`;
      document.getElementById('timerRewardLabel').textContent = `৳${adReward}`;

      // Set bKash numbers in both deposit areas
      if (document.getElementById('bkashNum')) {
        document.getElementById('bkashNum').textContent = bkash;
        document.getElementById('depositSection').style.display = 'block';
      }
      if (document.getElementById('depositBkashNum')) {
        document.getElementById('depositBkashNum').textContent = bkash;
      }
    }
  } catch (err) {
    console.error('Settings load failed:', err);
  }
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function updateBalanceUI() {
  if (!currentUser) return;
  const bal = currentUser.balance ?? 0;
  document.getElementById('balanceDisplay').textContent = bal.toFixed(2);
  document.getElementById('statBalance').textContent = `৳${bal.toFixed(2)}`;
  document.getElementById('statProxies').textContent = currentUser.proxiesBought || 0;
  document.getElementById('statAds').textContent = currentUser.adsWatched || 0;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.className = 'toast'; }, 3800);
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modal when tapping backdrop
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) closeModal(this.id);
  });
});

/* ============================================================
   PAGE NAVIGATION
   ============================================================ */
function switchPage(pageName, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + pageName).classList.add('active');
  if (navEl) navEl.classList.add('active');

  if (pageName === 'history') loadHistory();
}

/* ============================================================
   WATCH AD
   ============================================================ */
async function watchAd() {
  if (!currentUser) { showToast('Loading user data...', 'warning'); return; }

  const btn = document.getElementById('adBtn');
  btn.style.opacity = '0.6';
  btn.style.pointerEvents = 'none';

  // Try to show the Monitag ad
  try {
    if (typeof show_11023737 === 'function') {
      show_11023737();
    } else {
      console.warn('Ad SDK not loaded, simulating for dev.');
    }
  } catch (e) {
    console.warn('Ad SDK error:', e);
  }

  // Open timer modal
  openModal('adTimerModal');
  startAdTimer();
}

function startAdTimer() {
  let seconds = 15;
  adWatchedSuccessfully = false;
  document.getElementById('timerCount').textContent = seconds;

  clearInterval(adTimerInterval);
  adTimerInterval = setInterval(async () => {
    seconds--;
    document.getElementById('timerCount').textContent = seconds;

    if (seconds <= 0) {
      clearInterval(adTimerInterval);
      adWatchedSuccessfully = true;
      closeModal('adTimerModal');
      await creditAdReward();
      resetAdBtn();
    }
  }, 1000);
}

async function creditAdReward() {
  try {
    const res = await fetch('/api/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    const data = await res.json();

    if (res.ok && data.newBalance !== undefined) {
      currentUser.balance = data.newBalance;
      currentUser.adsWatched = (currentUser.adsWatched || 0) + 1;
      updateBalanceUI();
      showToast(`✓ +৳${adReward} credited to wallet!`, 'success');
    } else {
      showToast(data.error || 'Ad reward failed', 'error');
    }
  } catch (err) {
    showToast('Network error. Please retry.', 'error');
  }
}

function resetAdBtn() {
  const btn = document.getElementById('adBtn');
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'auto';
}

/* ============================================================
   BUY PROXY
   ============================================================ */
async function buyProxy() {
  if (!currentUser) { showToast('Loading user data...', 'warning'); return; }

  const balance = currentUser.balance ?? 0;
  const cost = 10;

  if (balance < cost) {
    const needed = (cost - balance).toFixed(2);
    showToast(`⚠ Need ৳${needed} more to buy a proxy`, 'error');
    tg?.HapticFeedback?.notificationOccurred('error');
    return;
  }

  // Disable button to prevent double-tap
  const btn = document.getElementById('buyProxyBtn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<span style="margin:auto;display:flex;align-items:center;gap:10px;justify-content:center;"><span class="loading-spinner"></span> Processing...</span>`;
  btn.style.pointerEvents = 'none';

  try {
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    const data = await res.json();

    if (res.ok && data.proxyDetails) {
      currentUser.balance = data.newBalance;
      currentUser.proxiesBought = (currentUser.proxiesBought || 0) + 1;
      updateBalanceUI();

      showProxyModal(data.proxyDetails);
      tg?.HapticFeedback?.notificationOccurred('success');
    } else {
      showToast(data.error || 'Purchase failed', 'error');
      tg?.HapticFeedback?.notificationOccurred('error');
    }
  } catch (err) {
    showToast('Network error. Please retry.', 'error');
  } finally {
    btn.innerHTML = originalHTML;
    btn.style.pointerEvents = 'auto';
  }
}

/* ── Render Proxy Modal ── */
function showProxyModal(proxyText) {
  proxyRawText = proxyText;
  const container = document.getElementById('proxyResultBox');
  container.innerHTML = '';

  // Parse key: value lines
  const lines = proxyText.split('\n').filter(l => l.trim());
  const parsed = [];

  lines.forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > -1) {
      const key = line.substring(0, colonIdx).trim();
      const val = line.substring(colonIdx + 1).trim();
      parsed.push({ key, val });
    } else if (line.trim()) {
      parsed.push({ key: 'Info', val: line.trim() });
    }
  });

  if (parsed.length > 0) {
    container.innerHTML = parsed.map(p => `
      <div class="proxy-row">
        <span class="proxy-key">${escapeHtml(p.key)}</span>
        <span class="proxy-val">${escapeHtml(p.val)}</span>
      </div>
    `).join('');
  } else {
    container.innerHTML = `<div class="proxy-val" style="text-align:center;padding:10px;">${escapeHtml(proxyText)}</div>`;
  }

  openModal('proxyModal');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function copyAllProxy() {
  if (!proxyRawText) return;
  navigator.clipboard.writeText(proxyRawText)
    .then(() => showToast('✓ Proxy details copied!', 'success'))
    .catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = proxyRawText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('✓ Copied!', 'success');
    });
}

/* ============================================================
   DEPOSIT MODAL
   ============================================================ */
function showDepositModal() {
  openModal('depositModal');
}

function copyBkash() {
  const num = document.getElementById('bkashNum')?.textContent
           || document.getElementById('depositBkashNum')?.textContent || '';
  if (!num || num === 'Loading...') { showToast('bKash number not loaded yet', 'warning'); return; }
  navigator.clipboard.writeText(num)
    .then(() => showToast('✓ bKash number copied!', 'success'))
    .catch(() => showToast('Copy failed', 'error'));
}

/* ============================================================
   HISTORY
   ============================================================ */
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="text-center text-muted" style="padding:30px;"><span class="loading-spinner"></span></div>';

  try {
    const res = await fetch(`/api/db?action=getHistory&telegramId=${currentUser?.telegramId}`);
    const data = await res.json();

    if (!data.history || data.history.length === 0) {
      list.innerHTML = `
        <div class="text-center text-muted" style="padding:40px 0;">
          <div style="font-size:2rem;margin-bottom:8px;">📜</div>
          No transactions yet
        </div>`;
      return;
    }

    list.innerHTML = data.history.map(item => {
      const isCredit = item.amount > 0;
      const icons = { proxy: '🛡️', ad: '📺', deposit: '💳', deduct: '📤' };
      const icon = icons[item.type] || '💱';
      const iconClass = item.type === 'proxy' ? 'proxy' : item.type === 'ad' ? 'ad' : 'deposit';

      return `
        <div class="history-item">
          <div class="history-icon ${iconClass}">${icon}</div>
          <div class="history-info">
            <div class="history-title">${item.description || item.type}</div>
            <div class="history-date">${formatDate(item.createdAt)}</div>
          </div>
          <div class="history-amount ${isCredit ? 'plus' : 'minus'}">
            ${isCredit ? '+' : ''}৳${Math.abs(item.amount).toFixed(2)}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<div class="text-center text-muted" style="padding:30px;">Failed to load history</div>';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
