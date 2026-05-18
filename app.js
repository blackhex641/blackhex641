const tg = window.Telegram.WebApp;
tg.expand();

let balance = 0.00;
let adTimer;
let timeLeft = 15; 
let isWatchingAd = false;

// 1. Load User Data with Profile Picture
window.onload = () => {
    const user = tg.initDataUnsafe.user;
    if (user) {
        document.getElementById("userName").innerText = user.first_name + (user.last_name ? " " + user.last_name : "");
        document.getElementById("userUsername").innerText = user.username ? "@" + user.username : "No Username";
        document.getElementById("userId").innerText = user.id;
        
        // Fetch Telegram profile photo if available
        if(user.photo_url) {
            document.getElementById("userPhoto").src = user.photo_url;
        }
    }
    updateBalanceUI();
};

function updateBalanceUI() {
    document.getElementById("mainBalance").innerText = balance.toFixed(2);
}

// 2. Tab Switching Logic (Bottom Menu)
function switchTab(tabName, element) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    // Remove active color from all icons
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
    });

    // Show selected tab & highlight icon
    document.getElementById('tab-' + tabName).classList.add('active');
    element.classList.add('active');
}

// 3. Modals Control
function openDepositModal() {
    document.getElementById('depositModal').style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function submitDeposit() {
    const amount = document.getElementById('depAmount').value;
    const trx = document.getElementById('depTrx').value;
    if(!amount || !trx) {
        tg.showAlert("Please fill all fields!");
        return;
    }
    tg.showAlert("Deposit request submitted for ৳" + amount + "\nWaiting for admin approval.");
    closeModal('depositModal');
}

// 4. Ad Logic
function startAdTimer() {
    try {
        if (typeof show_11023737 === "function") {
            show_11023737().then(() => runTimer()).catch(err => runTimer());
        } else {
            runTimer();
        }
    } catch (e) {
        runTimer();
    }
}

function runTimer() {
    isWatchingAd = true;
    timeLeft = 15; 
    document.getElementById("countdown").innerText = timeLeft;
    document.getElementById("adModal").style.display = "flex";

    adTimer = setInterval(() => {
        timeLeft--;
        document.getElementById("countdown").innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(adTimer);
            adSuccess();
        }
    }, 1000);
}

function cancelAd() {
    clearInterval(adTimer);
    isWatchingAd = false;
    document.getElementById("adModal").style.display = "none";
    tg.showAlert("Ad closed early! No reward added.");
}

function adSuccess() {
    isWatchingAd = false;
    document.getElementById("adModal").style.display = "none";
    balance += 1.00; 
    updateBalanceUI();
    tg.showAlert("✅ Success! ৳1.00 added.");
}

// 5. Proxy Buy Logic (With Exact Calculation)
function buyProxy() {
    const proxyPrice = 10.00;
    
    if (balance >= proxyPrice) {
        balance -= proxyPrice;
        updateBalanceUI();
        tg.showAlert("✅ Proxy Purchased!\nIP: 192.168.1.1:8080");
    } else {
        // Calculate missing amount
        let missingAmount = proxyPrice - balance;
        tg.showAlert(`❌ Insufficient Balance!\n\nYou need ৳${missingAmount.toFixed(2)} more to buy this proxy.`);
    }
}
