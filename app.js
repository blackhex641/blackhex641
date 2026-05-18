// app.js
(function() {
  // ---------- localStorage helpers ----------
  const LS = {
    getBalance: () => parseFloat(localStorage.getItem('blackhex_balance')) || 0,
    setBalance: (val) => localStorage.setItem('blackhex_balance', val),
    getTransactions: () => JSON.parse(localStorage.getItem('blackhex_transactions') || '[]'),
    setTransactions: (arr) => localStorage.setItem('blackhex_transactions', JSON.stringify(arr)),
    getPaymentMethods: () => JSON.parse(localStorage.getItem('blackhex_payment_methods') || '{"bkash":"","nagad":"","rocket":"","binance":""}'),
    setPaymentMethods: (obj) => localStorage.setItem('blackhex_payment_methods', JSON.stringify(obj)),
    getAdReward: () => parseFloat(localStorage.getItem('blackhex_ad_reward')) || 1.0,
    setAdReward: (val) => localStorage.setItem('blackhex_ad_reward', val),
    getProxies: () => JSON.parse(localStorage.getItem('blackhex_proxies') || '[]'),
    setProxies: (arr) => localStorage.setItem('blackhex_proxies', JSON.stringify(arr))
  };

  // ---------- DOM elements ----------
  const homeTab = document.getElementById('home-tab');
  const historyTab = document.getElementById('history-tab');
  const profileTab = document.getElementById('profile-tab');
  const navItems = document.querySelectorAll('.nav-item');
  const balanceDisplay = document.getElementById('balance-display');
  const historyList = document.getElementById('history-list');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileUsername = document.getElementById('profile-username');
  const profileId = document.getElementById('profile-id');

  // ---------- Tab switching ----------
  function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`${tabId}-tab`).classList.add('active');
    document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add('active');
    if (tabId === 'history') renderHistory();
    if (tabId === 'profile') loadProfile();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // ---------- Render Balance ----------
  function updateBalanceUI() {
    balanceDisplay.textContent = `৳${LS.getBalance().toFixed(2)}`;
  }

  // ---------- Add Transaction ----------
  function addTransaction(type, description, amount, status = 'completed') {
    const txns = LS.getTransactions();
    txns.unshift({
      type,          // 'credit' or 'debit' or 'pending'
      description,
      amount,
      status,
      timestamp: new Date().toISOString()
    });
    LS.setTransactions(txns);
    if (document.getElementById('history-tab').classList.contains('active')) renderHistory();
  }

  // ---------- Render History ----------
  function renderHistory() {
    const txns = LS.getTransactions();
    historyList.innerHTML = '';
    if (txns.length === 0) {
      historyList.innerHTML = '<p class="empty-state">No transactions yet.</p>';
      return;
    }
    txns.forEach(tx => {
      const item = document.createElement('div');
      item.className = `history-item ${tx.type}`;
      const sign = tx.type === 'credit' ? '+' : tx.type === 'debit' ? '-' : '';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
          <strong>${tx.description}</strong>
          <span class="${tx.type === 'credit' ? 'neon-pink' : ''}">${sign}৳${tx.amount.toFixed(2)}</span>
        </div>
        <small style="opacity:0.7">${new Date(tx.timestamp).toLocaleString()}</small>
        ${tx.status === 'pending' ? '<div style="color:#ffaa00;">⏳ Pending</div>' : ''}
      `;
      historyList.appendChild(item);
    });
  }

  // ---------- Profile ----------
  function loadProfile() {
    // Try Telegram WebApp user
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
      const user = window.Telegram.WebApp.initDataUnsafe.user;
      profileAvatar.src = user.photo_url || '';
      profileName.textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
      profileUsername.textContent = user.username ? '@' + user.username : 'no username';
      profileId.textContent = user.id;
    } else {
      // Fallback for browser testing
      profileAvatar.src = 'https://i.pravatar.cc/100';
      profileName.textContent = 'Crypto Phantom';
      profileUsername.textContent = '@phantom';
      profileId.textContent = '123456789';
    }
  }

  // ---------- Deposit Modal ----------
  const depositModal = document.getElementById('deposit-modal');
  const closeDeposit = document.getElementById('close-deposit');
  const depositForm = document.getElementById('deposit-form');
  const methodSelect = document.getElementById('method-select');
  const paymentDetails = document.getElementById('payment-details');

  function openDeposit() {
    const methods = LS.getPaymentMethods();
    methodSelect.innerHTML = '<option value="">-- Select --</option>';
    let hasAny = false;
    for (const [key, value] of Object.entries(methods)) {
      if (value && value.trim() !== '') {
        hasAny = true;
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key.toUpperCase();
        methodSelect.appendChild(option);
      }
    }
    if (!hasAny) {
      methodSelect.innerHTML = '<option value="">No methods available</option>';
    }
    paymentDetails.textContent = 'Select a method to see details';
    depositModal.style.display = 'flex';
  }

  closeDeposit.addEventListener('click', () => depositModal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === depositModal) depositModal.style.display = 'none';
  });

  methodSelect.addEventListener('change', () => {
    const methods = LS.getPaymentMethods();
    const selected = methodSelect.value;
    if (methods[selected]) {
      paymentDetails.textContent = `Send to: ${methods[selected]}`;
    } else {
      paymentDetails.textContent = 'No number set for this method';
    }
  });

  depositForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const method = methodSelect.value;
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const transId = document.getElementById('trans-id').value.trim();
    if (!method || !amount || !transId) {
      alert('Please fill all fields.');
      return;
    }
    addTransaction('pending', `Deposit via ${method.toUpperCase()} (TXN: ${transId})`, amount, 'pending');
    alert('Deposit request submitted! Waiting for admin approval.');
    depositForm.reset();
    paymentDetails.textContent = 'Select a method to see details';
    depositModal.style.display = 'none';
  });

  document.getElementById('deposit-btn').addEventListener('click', openDeposit);

  // ---------- Watch Ads ----------
  const adModal = document.getElementById('ad-modal');
  const cancelAd = document.getElementById('cancel-ad');
  const countdownDisplay = document.getElementById('countdown-display');
  let adTimer = null;
  let adCancelled = false;

  function startAdWatch() {
    adCancelled = false;
    adModal.style.display = 'flex';
    countdownDisplay.textContent = '15';
    // Trigger SDK ad
    if (typeof show_11023737 === 'function') {
      show_11023737();
    }
    let secondsLeft = 15;
    adTimer = setInterval(() => {
      secondsLeft--;
      countdownDisplay.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(adTimer);
        adTimer = null;
        if (!adCancelled) {
          const reward = LS.getAdReward();
          const newBalance = LS.getBalance() + reward;
          LS.setBalance(newBalance);
          addTransaction('credit', 'Ad Reward', reward);
          updateBalanceUI();
          adModal.style.display = 'none';
          alert(`Congratulations! You earned ৳${reward.toFixed(2)}`);
        }
      }
    }, 1000);
  }

  function cancelAdWatch() {
    adCancelled = true;
    if (adTimer) {
      clearInterval(adTimer);
      adTimer = null;
    }
    adModal.style.display = 'none';
  }

  cancelAd.addEventListener('click', cancelAdWatch);
  document.getElementById('ad-btn').addEventListener('click', startAdWatch);

  // ---------- Buy Proxy ----------
  const proxyModal = document.getElementById('proxy-modal');
  const closeProxyModal = document.getElementById('close-proxy-modal');
  const dummyIpDisplay = document.getElementById('dummy-ip-display');

  function generateDummyIP() {
    const octet = () => Math.floor(Math.random() * 256);
    return `${octet()}.${octet()}.${octet()}.${octet()}`;
  }

  document.getElementById('proxy-btn').addEventListener('click', () => {
    const balance = LS.getBalance();
    const price = 10;
    if (balance < price) {
      const missing = price - balance;
      alert(`Insufficient balance! You need ৳${missing.toFixed(2)} more to buy Owl Proxy 200MB.`);
      return;
    }
    const newBalance = balance - price;
    LS.setBalance(newBalance);
    const ip = generateDummyIP();
    dummyIpDisplay.textContent = ip;
    addTransaction('debit', 'Owl Proxy 200MB', price);
    updateBalanceUI();
    proxyModal.style.display = 'flex';
  });

  closeProxyModal.addEventListener('click', () => proxyModal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === proxyModal) proxyModal.style.display = 'none';
  });

  // ---------- Initialization ----------
  updateBalanceUI();
  loadProfile();
  // Set default payment methods if empty
  const methods = LS.getPaymentMethods();
  if (!methods.bkash && !methods.nagad && !methods.rocket && !methods.binance) {
    LS.setPaymentMethods({ bkash: '01712345678', nagad: '01798765432', rocket: '01755667788', binance: '123456789' });
  }
})();
