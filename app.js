// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBwpa8mA83JAv2A2Dj0rh5VHwodyv5N3dg",
    authDomain: "freegcash-ads.firebaseapp.com",
    databaseURL: "https://freegcash-ads-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "freegcash-ads",
    storageBucket: "freegcash-ads.firebasestorage.app",
    messagingSenderId: "608086825364",
    appId: "1:608086825364:web:3a8e628d231b52c6171781"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// FaucetPay Config
const FAUCETPAY_API_KEY = 'a92bb3fc17bf8476f2705f613ffc976dff7d8ed8f977c1e80294beb4f131a7f3';
const REWARD_AMOUNT = 0.0012;
const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

// DOM Elements
const inputSection = document.getElementById('input-section');
const claimSection = document.getElementById('claim-section');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const watchBtn = document.getElementById('watch-ad-btn');
const cooldownDisplay = document.getElementById('cooldown-display');
const timerDisplay = document.getElementById('timer');
const dailyList = document.getElementById('daily-leaderboard');
const weeklyList = document.getElementById('weekly-leaderboard');

let currentUserEmail = null;
let cooldownInterval = null;

// --- INITIALIZATION ---
window.onload = () => {
    loadLeaderboards();
    checkExistingSession();
    
    // Show Initial Interstitial Ad (as per requirement: auto show on open)
    setTimeout(() => {
        if (typeof show_10555663 === 'function') {
            show_10555663({
                type: 'inApp',
                inAppSettings: {
                    frequency: 1, // Show once on load
                    capping: 0.1,
                    interval: 30,
                    timeout: 5,
                    everyPage: false
                }
            });
        }
    }, 1000);
};

// --- CORE FUNCTIONS ---

function showStatus(msg) {
    statusBar.classList.remove('hidden');
    statusText.textContent = msg;
}

function hideStatus() {
    statusBar.classList.add('hidden');
}

function validateUser() {
    const email = document.getElementById('user-email').value.trim();
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
    }
  watchBtn.innerHTML = '<i class="fas fa-check"></i> Claimed!';
        setTimeout(() => {
            watchBtn.innerHTML = originalBtnContent;
        }, 2000);

    } catch (error) {
        console.error("Ad or Payment Error:", error);
        alert("Ad was skipped or payment failed. Please try again.");
        enableClaimButton();
    }
}

async function processPayment(email) {
    showStatus('Sending 0.0012 USDT...');
    
    try {
        const response = await fetch(https://faucetpay.io/api/v1/send_to, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                api_key: FAUCETPAY_API_KEY,
                currency: 'USDT',
                amount: REWARD_AMOUNT,
                recipient: email
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Log to Firebase Leaderboard
        logToLeaderboard(email);
        
        hideStatus();
        return true;

    } catch (err) {
        console.error("API Error:", err);
        hideStatus();
        throw err;
    }
}

// --- LEADERBOARD LOGIC ---

function logToLeaderboard(email) {
    const now = Date.now();
    const todayKey = daily_${new Date(now).toISOString().split('T')[0]};
    const weekKey = weekly_${getWeekNumber(new Date(now))};

    // Increment daily
    db.ref(leaderboard/${todayKey}/${email}).set(firebase.database.ServerValue.increment(1));
    
    // Increment weekly
    db.ref(leaderboard/${weekKey}/${email}).set(firebase.database.ServerValue.increment(1));
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return ${d.getUTCFullYear}-W${weekNo};
}

function loadLeaderboards() {
    const currentWeek = getWeekNumber(new Date());
    const today = new Date().toISOString().split('T')[0];

    // Load Daily
    db.ref(leaderboard/daily_${today}).on('value', (snapshot) => {
        const data = snapshot.val();
        renderLeaderboard(dailyList, data, 'Daily');
    });

    // Load Weekly
    db.ref(leaderboard/weekly_${currentWeek}).on('value', (snapshot) => {
        const data = snapshot.val();
        renderLeaderboard(weeklyList, data, 'Weekly');
    });
}

function renderLeaderboard(container, data, type) {
    if (!data) {
        container.innerHTML = <li class="text-gray-400 text-center">No ${type} activity</li>;
        return;
    }

    // Convert to array and sort by value descending
    const users = Object.entries(data)
        .map(([email, count]) => ({ email, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5

    if (users.length === 0) {
        container.innerHTML = <li class="text-gray-400 text-center">No ${type} activity</li>;
        return;
    }

    container.innerHTML = users.map((u, index) => `
        <li class="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100 transition">
            <span class="truncate w-24 text-gray-700">${index + 1}. ${u.email}</span>
            <span class="font-bold text-blue-600">${u.count} claims</span>
        </li>
    `).join('');
}
```
