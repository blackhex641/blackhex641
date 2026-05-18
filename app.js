const tg = window.Telegram.WebApp;
tg.expand();

let balance = 0.00;
let adTimer;
let timeLeft = 15; 
let isWatchingAd = false;
let userId = null;

window.onload = async () => {
    const user = tg.initDataUnsafe.user;
    if (user) {
        userId = user.id;
        document.getElementById("userInfo").innerText = `👤 ${user.first_name} (ID: ${user.id})`;
    } else {
        document.getElementById("userInfo").innerText = "Web Version (Testing)";
    }
    updateBalanceUI();
};

function updateBalanceUI() {
    document.getElementById("userBalance").innerText = balance.toFixed(2);
}

function openDeposit() {
    tg.showAlert("Deposit verification form will be connected soon.");
}

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
    tg.showAlert("Ad cancelled. No reward given.");
}

async function adSuccess() {
    isWatchingAd = false;
    document.getElementById("adModal").style.display = "none";
    
    balance += 1.00; 
    updateBalanceUI();
    tg.showAlert("✅ Success! Reward added to your wallet.");
}

async function buyProxy() {
    if (balance >= 10.00) {
        balance -= 10.00;
        updateBalanceUI();
        tg.showAlert("✅ Proxy Purchased!\n\nIP: 192.168.1.1:8080:user:pass\n(Database integration coming next)");
    } else {
        tg.showAlert("❌ Insufficient balance! Watch ads or deposit money.");
    }
}
