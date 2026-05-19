/* ============================================================
   BLACKHEX — app.js (Full Code)
   ============================================================ */

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor('#0a0a0f'); tg.setBackgroundColor('#0a0a0f'); }

// ── State ──
let currentUser   = null;
let adReward      = 2;
let adTimerIntvl  = null;
let proxyRawText  = '';
let allHistory    = [];
let depositMethods = [];
let selectedMethod = null;
let currentHTab   = 'all';
let wheelAngle    = 0;
let isSpinning    = false;

const WHEEL_SEGMENTS = [
  { label: 'Better\nLuck', color: '#1a1a2e', text: '#6a6a9a' },
  { label: '1',  color: '#0d1b2a', text: '#00f3ff' },
  { label: '2',  color: '#16213e', text: '#00f3ff' },
  { label: '3',  color: '#0f3460', text: '#00f3ff' },
  { label: '4',  color: '#533483', text: '#fff' },
  { label: '5',  color: '#7b2fff', text: '#fff' },
  { label: '6',  color: '#ff007a', text: '#fff' },
  { label: '7',  color: '#e94560', text: '#fff' },
  { label: '8',  color: '#0f3460', text: '#ffaa00' },
  { label: '9',  color: '#533483', text: '#ffaa00' },
  { label: '10', color: '#00f3ff', text: '#000' },
];

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  drawWheel(0);
});

async function initApp() {
  const tgUser = tg?.initDataUnsafe?.user || { id: 123456789, first_name: 'Dev', username: 'devuser' };
  await setupUser(tgUser);
  loadSettings();
  loadPaymentMethods();
}

async function setupUser(tgUser) {
  const telegramId = String(tgUser.id);
  const username   = tgUser.username || tgUser.first_name || 'Anonymous';
  const initial    = (tgUser.first_name || username || 'U')[0].toUpperCase();

  document.getElementById('headerAvatar').textContent    = initial;
  document.getElementById('usernameDisplay').textContent = username;
  document.getElementById('tgIdDisplay').textContent     = `#${telegramId}`;

  try {
    let res  = await fetch(`/api/db?action=getUser&telegramId=${telegramId}`);
    let data = await res.json();

    if (!res.ok) {
      const cr = await fetch('/api/db?action=createUser', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, username })
      });
      data = await cr.json();
    }
    currentUser = data.user;
    updateUI();
  } catch(e) { showToast('Connection error', 'error'); }
}

function updateUI() {
  if (!currentUser) return;
  const b = currentUser.balance ?? 0;
  document.getElementById('balanceDisplay').textContent  = b.toFixed(2);
  document.getElementById('pointsDisplay').textContent   = currentUser.points ?? 0;
  document.getElementById('adsDisplay').textContent      = currentUser.adsWatched ?? 0;
  document.getElementById('proxiesDisplay').textContent  = currentUser.proxiesBought ?? 0;
  document.getElementById('spinnerPointsDisplay').textContent = currentUser.points ?? 0;
}

/* ============================================================
   SETTINGS
   ============================================================ */
async function loadSettings() {
  try {
    const res  = await fetch('/api/db?action=getSettings');
    const data = await res.json();
    if (data.settings) {
      adReward = data.settings.adReward || 2;
      document.getElementById('adRewardDisplay').textContent  = `৳${adReward}`;
      document.getElementById('timerRewardLabel').textContent = `৳${adReward}`;
    }
  } catch(e) {}
}

async function loadPaymentMethods() {
  try {
    const res  = await fetch('/api/db?action=getPaymentMethods');
    const data = await res.json();
    depositMethods = data.methods || [];
  } catch(e) {}
}

/* ============================================================
   HISTORY (FIXED DEDUPLICATION LOGIC)
   ============================================================ */
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="text-center text-muted" style="padding:24px;"><span class="loading-spinner"></span></div>';
  try {
    const [txRes, depRes] = await Promise.all([
      fetch(`/api/db?action=getHistory&telegramId=${currentUser.telegramId}`),
      fetch(`/api/db?action=getDeposits&telegramId=${currentUser.telegramId}`)
    ]);
    const txData  = await txRes.json();
    const depData = await depRes.json();

    const txItems  = (txData.history || []).map(i => ({ ...i, _src: 'tx' }));
    const depItems = (depData.deposits || []).map(i => ({ ...i, _src: 'dep' }));

    // Dedup logic: use a Map with txId as key
    const map = new Map();
    
    // Add transactions
    txItems.forEach(item => {
        if (item.txId) map.set(item.txId, item);
        else allHistory.push(item);
    });

    // Add/Update with deposits (deposit detail objects have higher priority)
    depItems.forEach(item => {
        map.set(item.txId, item);
    });

    allHistory = [...Array.from(map.values()), ...allHistory].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderHistory();
  } catch(e) {
    list.innerHTML = '<div class="text-center text-muted" style="padding:24px;">Failed to load</div>';
  }
}

function renderHistory() {
  const list = document.getElementById('historyList');
  let items = allHistory;

  if (currentHFilter === 'deposit') items = items.filter(i => i._src === 'dep' || i.type === 'deposit' || i.type === 'adjust');
  if (currentHFilter === 'proxy')   items = items.filter(i => i.type === 'proxy');
  if (currentHFilter === 'earn')    items = items.filter(i => i.type === 'ad' || i.type === 'claim' || i.type === 'spin');

  if (items.length === 0) {
    list.innerHTML = '<div class="text-center text-muted" style="padding:40px 0;"><div style="font-size:2rem;margin-bottom:8px;">📜</div>No transactions yet</div>';
    return;
  }

  list.innerHTML = items.map(item => {
    if (item._src === 'dep' || item.type === 'deposit') return renderDepositItem(item);
    return renderTxItem(item);
  }).join('');
}

function renderTxItem(item) {
  const isCredit = item.amount > 0;
  const icons    = { proxy:'🛡️', ad:'📺', deposit:'💳', claim:'🎁', spin:'🎰', adjust:'⚙️' };
  const icon     = icons[item.type] || '💱';
  const hasDetails = item.type === 'proxy' && item.proxyDetails;

  return `
    <div class="history-item" ${hasDetails ? `onclick="showTxDetail('${encodeURIComponent(JSON.stringify(item))}')" style="cursor:pointer"` : ''}>
      <div class="history-icon ${item.type}">${icon}</div>
      <div class="history-info">
        <div class="history-title">${esc(item.description || item.type)}</div>
        <div class="history-date">${fmtDate(item.createdAt)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="history-amount ${isCredit?'plus':'minus'}">${isCredit?'+':''}৳${Math.abs(item.amount).toFixed(2)}</div>
        ${hasDetails ? '<div style="font-size:.6rem;color:var(--neon-cyan);letter-spacing:1px;">TAP FOR DETAILS</div>' : ''}
      </div>
    </div>`;
}

function renderDepositItem(dep) {
  const statusColors = { pending:'var(--warning)', approved:'var(--success)', rejected:'var(--danger)' };
  const statusIcons  = { pending:'⏳', approved:'✅', rejected:'❌' };
  const sc = statusColors[dep.status] || 'var(--text-muted)';
  const si = statusIcons[dep.status] || '❓';

  return `
    <div class="history-item" onclick="showDepositDetail('${encodeURIComponent(JSON.stringify(dep))}')" style="cursor:pointer;">
      <div class="history-icon deposit">💳</div>
      <div class="history-info">
        <div class="history-title">Deposit via ${esc(dep.method)}</div>
        <div class="history-date">${fmtDate(dep.createdAt)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="history-amount plus">+৳${dep.amount.toFixed(2)}</div>
        <div style="font-size:.65rem;color:${sc};letter-spacing:1px;">${si} ${dep.status.toUpperCase()}</div>
      </div>
    </div>`;
}

/* ============================================================
   PAGE NAVIGATION
   ============================================================ */
function switchPage(name, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (navEl) navEl.classList.add('active');

  if (name === 'history')     loadHistory();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'claim')       loadClaimPage();
  if (name === 'spinner')     { drawWheel(wheelAngle); updateUI(); }
}

/* ============================================================
   TOAST & MODAL
   ============================================================ */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(t._t); t._t = setTimeout(() => { t.className = 'toast'; }, 3800);
}

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', function(e) { if (e.target === this) closeModal(this.id); });
});

/* ============================================================
   WATCH AD
   ============================================================ */
async function watchAd() {
  if (!currentUser) { showToast('Loading...', 'warning'); return; }
  const btn = document.getElementById('adBtn');
  btn.style.opacity = '0.6'; btn.style.pointerEvents = 'none';

  try { if (typeof show_11023737 === 'function') show_11023737(); } catch(e) {}
  openModal('adTimerModal');
  startAdTimer();
}

function startAdTimer() {
  let s = 15;
  document.getElementById('timerCount').textContent = s;
  clearInterval(adTimerIntvl);
  adTimerIntvl = setInterval(async () => {
    s--;
    document.getElementById('timerCount').textContent = s;
    if (s <= 0) {
      clearInterval(adTimerIntvl);
      closeModal('adTimerModal');
      await creditAd();
      const btn = document.getElementById('adBtn');
      btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
    }
  }, 1000);
}

async function creditAd() {
  try {
    const res  = await fetch('/api/ads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser.balance    = data.newBalance;
      currentUser.adsWatched = (currentUser.adsWatched||0) + 1;
      currentUser.points     = data.newPoints ?? currentUser.points;
      updateUI();
      showToast(`✓ +৳${adReward} earned!`, 'success');
    } else { showToast(data.error || 'Failed', 'error'); }
  } catch(e) { showToast('Network error', 'error'); }
}

/* ============================================================
   BUY PROXY
   ============================================================ */
async function buyProxy() {
  if (!currentUser) { showToast('Loading...', 'warning'); return; }
  if (currentUser.balance < 10) {
    const needed = (10 - currentUser.balance).toFixed(2);
    showToast(`⚠ Need ৳${needed} more`, 'error');
    tg?.HapticFeedback?.notificationOccurred('error'); return;
  }

  const btn = document.getElementById('buyProxyBtn');
  btn.style.opacity = '0.6'; btn.style.pointerEvents = 'none';

  try {
    const res  = await fetch('/api/proxy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    const data = await res.json();

    if (res.ok && data.proxyDetails) {
      currentUser.balance      = data.newBalance;
      currentUser.proxiesBought = (currentUser.proxiesBought||0)+1;
      currentUser.points       = data.newPoints ?? currentUser.points;
      updateUI();
      showProxyModal(data.proxyDetails);
      tg?.HapticFeedback?.notificationOccurred('success');
    } else { showToast(data.error || 'Failed', 'error'); }
  } catch(e) { showToast('Network error', 'error'); }
  finally { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

function showProxyModal(text) {
  proxyRawText = text;
  const box  = document.getElementById('proxyResultBox');
  const lines = text.split('\n').filter(l => l.trim());
  box.innerHTML = lines.map(line => {
    const ci = line.indexOf(':');
    if (ci > -1) {
      const k = line.substring(0, ci).trim();
      const v = line.substring(ci+1).trim();
      return `<div class="proxy-row"><span class="proxy-key">${esc(k)}</span><span class="proxy-val">${esc(v)}</span></div>`;
    }
    return `<div class="proxy-row"><span class="proxy-val" style="width:100%">${esc(line)}</span></div>`;
  }).join('');
  openModal('proxyModal');
}

function copyAllProxy() {
  if (!proxyRawText) return;
  navigator.clipboard.writeText(proxyRawText)
    .then(() => showToast('✓ Copied!', 'success'))
    .catch(() => { fallbackCopy(proxyRawText); showToast('✓ Copied!', 'success'); });
}

/* ============================================================
   DEPOSIT FLOW
   ============================================================ */
function showDepositModal() {
  renderMethodList();
  showDepositStep(1);
  openModal('depositModal');
}

function renderMethodList() {
  const list = document.getElementById('methodList');
  if (depositMethods.length === 0) {
    list.innerHTML = `<div class="text-muted text-center" style="padding:20px;">No payment methods available</div>`;
    return;
  }
  const icons = { bkash: '💸', nagad: '🟠', rocket: '🚀', binance: '🟡' };
  list.innerHTML = depositMethods.map(m => `
    <div class="method-card" onclick="selectMethod('${m.method}','${m.number}','${m.label||m.method}')">
      <span style="font-size:1.4rem;">${icons[m.method.toLowerCase()]||'💳'}</span>
      <div style="flex:1">
        <div style="font-weight:600;color:var(--text-primary);font-size:.9rem;">${esc(m.label||m.method)}</div>
        <div style="font-size:.75rem;color:var(--neon-cyan);font-family:'Orbitron',monospace;letter-spacing:1px;">${esc(m.number)}</div>
      </div>
      <span style="color:var(--neon-cyan);font-size:1.1rem;">›</span>
    </div>`).join('');
}

function selectMethod(method, number, label) {
  selectedMethod = { method, number, label };
  const banner = document.getElementById('selectedMethodBanner');
  banner.innerHTML = `
    <div style="text-align:center;padding:12px;background:rgba(0,243,255,.06);border:1px solid rgba(0,243,255,.15);border-radius:12px;margin-bottom:4px;">
      <div style="font-size:.65rem;letter-spacing:2px;color:var(--text-muted);">SEND TO</div>
      <div style="font-family:'Orbitron',monospace;font-size:1.2rem;color:var(--neon-cyan);margin:4px 0;">${esc(number)}</div>
      <div style="font-size:.75rem;color:var(--text-muted);">via ${esc(label)}</div>
      <button onclick="fallbackCopy('${number}');showToast('Copied!','success')" 
              style="margin-top:8px;padding:4px 14px;background:rgba(0,243,255,.1);border:1px solid rgba(0,243,255,.2);border-radius:8px;color:var(--neon-cyan);font-size:.65rem;letter-spacing:1px;cursor:pointer;">
        📋 COPY NUMBER
      </button>
    </div>`;
  showDepositStep(2);
}

function showDepositStep(n) {
  document.getElementById('depositStep1').classList.toggle('hidden', n !== 1);
  document.getElementById('depositStep2').classList.toggle('hidden', n !== 2);
}

async function submitDeposit() {
  if (!selectedMethod) return;
  const amount = parseFloat(document.getElementById('depositAmount').value);
  const txId   = document.getElementById('depositTxId').value.trim();

  if (!amount || amount < 10) { showToast('Minimum deposit ৳10', 'error'); return; }
  if (!txId) { showToast('Enter your Transaction ID', 'error'); return; }

  try {
    const res  = await fetch('/api/db?action=submitDeposit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: currentUser.telegramId,
        username:   currentUser.username,
        method:     selectedMethod.method,
        amount, txId
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('✓ Deposit submitted! Awaiting approval.', 'success');
      closeModal('depositModal');
      document.getElementById('depositAmount').value = '';
      document.getElementById('depositTxId').value   = '';
    } else { showToast(data.error || 'Submission failed', 'error'); }
  } catch(e) { showToast('Network error', 'error'); }
}

/* ============================================================
   MODAL DETAILS (Proxy & Deposit)
   ============================================================ */
function showTxDetail(encoded) {
  const item = JSON.parse(decodeURIComponent(encoded));
  document.getElementById('detailModalTitle').textContent = '🛡️ PROXY DETAILS';
  const body = document.getElementById('detailModalBody');
  if (item.proxyDetails) {
    const lines = item.proxyDetails.split('\n').filter(l=>l.trim());
    body.innerHTML = `
      <div class="proxy-result-box">
        ${lines.map(line => {
          const ci = line.indexOf(':');
          if (ci>-1) {
            const k=line.substring(0,ci).trim(), v=line.substring(ci+1).trim();
            return `<div class="proxy-row"><span class="proxy-key">${esc(k)}</span><span class="proxy-val">${esc(v)}</span></div>`;
          }
          return `<div class="proxy-row"><span class="proxy-val">${esc(line)}</span></div>`;
        }).join('')}
      </div>
      <button class="copy-all-btn" onclick="fallbackCopy(${JSON.stringify(item.proxyDetails)});showToast('Copied!','success')">
        ⎘ COPY ALL DETAILS
      </button>`;
  }
  openModal('detailModal');
}

function showDepositDetail(encoded) {
  const dep = JSON.parse(decodeURIComponent(encoded));
  document.getElementById('detailModalTitle').textContent = '💳 DEPOSIT DETAILS';
  const statusColor = { pending:'var(--warning)', approved:'var(--success)', rejected:'var(--danger)' };
  const sc = statusColor[dep.status] || 'var(--text-muted)';

  document.getElementById('detailModalBody').innerHTML = `
    <div class="proxy-result-box">
      <div class="proxy-row"><span class="proxy-key">Method</span><span class="proxy-val">${esc(dep.method)}</span></div>
      <div class="proxy-row"><span class="proxy-key">Amount</span><span class="proxy-val">৳${dep.amount}</span></div>
      <div class="proxy-row"><span class="proxy-key">TxID</span><span class="proxy-val" style="font-size:.8rem;">${esc(dep.txId)}</span></div>
      <div class="proxy-row"><span class="proxy-key">Status</span><span class="proxy-val" style="color:${sc};">${dep.status.toUpperCase()}</span></div>
      <div class="proxy-row"><span class="proxy-key">Date</span><span class="proxy-val" style="font-size:.75rem;">${fmtDate(dep.createdAt)}</span></div>
      ${dep.status==='rejected' && dep.rejectNote ? `
      <div class="proxy-row" style="flex-direction:column;align-items:flex-start;gap:4px;">
        <span class="proxy-key" style="color:var(--danger);">Reject Reason</span>
        <span style="color:var(--danger);font-size:.85rem;line-height:1.4;">${esc(dep.rejectNote)}</span>
      </div>` : ''}
    </div>
    ${dep.status==='rejected' ? `
    <div style="margin-top:10px;padding:12px;background:rgba(255,51,85,.08);border:1px solid rgba(255,51,85,.2);border-radius:12px;font-size:.78rem;color:var(--danger);line-height:1.5;">
      ❌ Your deposit was rejected. Please try again with correct details or contact admin.
    </div>` : ''}`;
  openModal('detailModal');
}

/* ============================================================
   LEADERBOARD, CLAIM, SPINNER & AI
   ============================================================ */
async function loadLeaderboard() {
  const list = document.getElementById('leaderboardList');
  list.innerHTML = '<div class="text-center text-muted" style="padding:24px;"><span class="loading-spinner"></span></div>';
  try {
    const res  = await fetch('/api/db?action=leaderboard');
    const data = await res.json();
    const lb   = data.leaderboard || [];
    if (lb.length === 0) { list.innerHTML = '<div class="text-center text-muted" style="padding:40px;">No data yet</div>'; return; }
    const crowns = ['👑','🥈','🥉'];
    list.innerHTML = `<div class="lb-list">${lb.map((u,i) => {
      const isTop3 = i < 3;
      const crown  = crowns[i] || `<span class="lb-rank">#${i+1}</span>`;
      return `<div class="lb-item ${isTop3?'lb-top':''}"><div class="lb-pos">${crown}</div><div class="lb-info"><div class="lb-name">${esc(u.username)}</div><div class="lb-sub">${u.adsWatched||0} ads</div></div><div class="lb-earned">৳${(u.totalEarned||0).toFixed(2)}</div></div>`;
    }).join('')}</div>`;
  } catch(e) { list.innerHTML = '<div class="text-center text-muted" style="padding:24px;">Failed to load</div>'; }
}

async function loadClaimPage() {
  if (!currentUser) return;
  try {
    const res  = await fetch(`/api/db?action=getClaimStatus&telegramId=${currentUser.telegramId}`);
    const data = await res.json();
    renderCalendar(data.claimHistory || [], data.lastClaim);
    updateClaimBtn(data.lastClaim);
  } catch(e) {}
}

function updateClaimBtn(lastClaim) {
  const btn = document.getElementById('claimBtn');
  const today = new Date().toISOString().split('T')[0];
  if (lastClaim === today) { btn.textContent = '✓ CLAIMED TODAY'; btn.disabled = true; btn.style.opacity = '0.5'; } 
  else { btn.textContent = 'CLAIM TODAY'; btn.disabled = false; btn.style.opacity = '1'; }
}

async function doClaimDaily() {
  if (!currentUser) return;
  const btn = document.getElementById('claimBtn');
  btn.disabled = true; btn.textContent = 'Claiming...';
  try {
    const res  = await fetch('/api/db?action=claimDaily', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: currentUser.telegramId })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser.balance = data.newBalance; updateUI(); showToast('✓ ৳1 claimed!', 'success');
      renderCalendar(data.claimHistory || [], new Date().toISOString().split('T')[0]);
      updateClaimBtn(new Date().toISOString().split('T')[0]);
    } else { showToast(data.error || 'Already claimed', 'warning'); updateClaimBtn(new Date().toISOString().split('T')[0]); }
  } catch(e) { showToast('Error', 'error'); btn.disabled = false; }
}

function renderCalendar(claimedDates, lastClaim) {
  const cal = document.getElementById('claimCalendar');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.toISOString().split('T')[0];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const claimedSet = new Set(claimedDates);
  let html = `<div class="cal-header">${monthNames[month]} ${year}</div><div class="cal-grid">${['S','M','T','W','T','F','S'].map(d=>`<div class="cal-day-label">${d}</div>`).join('')}${Array(firstDay).fill('<div></div>').join('')}`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isClaimed = claimedSet.has(dateStr);
    const isToday = dateStr === today;
    const isFuture = new Date(dateStr) > now;
    let cls = 'cal-day ' + (isClaimed ? 'cal-claimed' : (isToday ? 'cal-today' : (!isFuture ? 'cal-missed' : 'cal-future')));
    html += `<div class="${cls}">${isClaimed || isToday || isFuture ? d : d+'<span class="cal-x">✕</span>'}</div>`;
  }
  cal.innerHTML = html + '</div>';
}

function drawWheel(rotation) {
  const canvas = document.getElementById('wheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = cx - 8;
  const seg = WHEEL_SEGMENTS.length;
  const arc = (2 * Math.PI) / seg;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  WHEEL_SEGMENTS.forEach((seg_obj, i) => {
    const startA = rotation + arc * i - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, startA, startA + arc); ctx.closePath();
    ctx.fillStyle = seg_obj.color; ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(startA + arc / 2);
    ctx.textAlign = 'right'; ctx.fillStyle = seg_obj.text; ctx.font = '10px Orbitron';
    ctx.fillText(seg_obj.label, r - 5, 5); ctx.restore();
  });
  ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 2*Math.PI); ctx.fillStyle = '#0a0a0f'; ctx.fill();
}

async function doSpin() {
  if (!currentUser || isSpinning) return;
  if ((currentUser.points||0) < 2) { showToast('Need 2 points to spin!', 'error'); return; }
  isSpinning = true;
  try {
    const res = await fetch('/api/db?action=spin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId: currentUser.telegramId }) });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); isSpinning = false; return; }
    // Animate...
    currentUser.balance = data.newBalance; currentUser.points = data.newPoints; updateUI();
    isSpinning = false;
  } catch(e) { showToast('Error', 'error'); isSpinning = false; }
}

/* ============================================================
   UTILITY
   ============================================================ */
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(ds) {
  if (!ds) return '';
  const d = new Date(ds);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + ' ' + d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}
