
// --- Configuration ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- State Management ---
let currentUser = null;
let lastClaimTime = 0;
let cooldownSeconds = 180; // 3 minutes
let timerInterval = null;

// --- DOM Elements ---
const inputSection = document.getElementById('input-section');
const claimSection = document.getElementById('claim-section');
const userEmailInput = document.getElementById('user-email');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const cooldownDisplay = document.getElementById('cooldown-display');
const timerDisplay = document.getElementById('timer');
const watchAdBtn = document.getElementById('watch-ad-btn');
const userBalanceEl = document.getElementById('user-balance');
const leaderboardDaily = document.getElementById('daily-leaderboard');
const leaderboardWeekly = document.getElementById('weekly-leaderboard');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadLeaderboards();
    // Check if user is already logged in (session storage)
    const savedEmail = sessionStorage.getItem('faucet_email');
    if (savedEmail) {
        userEmailInput.value = savedEmail;
        validateUser(true);
    }
});

// --- Core Functions ---

function showStatus(msg, isError = false) {
    statusText.innerHTML = <i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-sync fa-spin'} mr-2"></i>${msg};
    statusBar.className = rounded-xl p-3 text-center shadow-sm transition-all duration-300 ${isError ? 'bg-red-50 border border-red-100 text-red-600' : 'bg-blue-50 border border-blue-100 text-blue-600'};
    statusBar.classList.remove('hidden');
}

function hideStatus() {
    statusBar.classList.add('hidden');
}

async function validateUser(isSession = false) {
    const email = userEmailInput.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
        showStatus("Please enter a valid email.", true);
        return;
    }

    showStatus("Verifying wallet...");
    try {
        const userRef = db.ref(users/${email});
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        if (userData) {
            // Existing User
            currentUser = { email, ...userData };
            handleLoginSuccess();
            if (!isSession) sessionStorage.setItem('faucet_email', email);
        } else {
            // New User
            showStatus("Creating new profile...");
            await userRef.set({
                email: email,
                balance: 0,
                lastClaim: Date.now(),
                joinedAt: Date.now()
            });
            currentUser = { email, balance: 0, lastClaim: Date.now() };
            handleLoginSuccess();

sessionStorage.setItem('faucet_email', email);
        }
    } catch (error) {
        console.error(error);
        showStatus("Connection error. Please try again.", true);
    }
}

function handleLoginSuccess() {
    hideStatus();
    inputSection.classList.add('hidden');
    claimSection.classList.remove('hidden');
    document.getElementById('user-badge').classList.remove('hidden');
    
    updateBalance();
    checkCooldown();
}

function logout() {
    sessionStorage.removeItem('faucet_email');
    location.reload();
}

function updateBalance() {
    if (!currentUser) return;
    userBalanceEl.textContent = ${currentUser.balance.toFixed(6)} USDT;
}

function checkCooldown() {
    const now = Date.now();
    const diff = now - currentUser.lastClaim;
    
    if (diff < cooldownSeconds * 1000) {
        const remaining = cooldownSeconds - Math.floor(diff / 1000);
        startTimer(remaining);
        watchAdBtn.disabled = true;
        watchAdBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        startTimer(0);
        watchAdBtn.disabled = false;
        watchAdBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function startTimer(seconds) {
    clearInterval(timerInterval);
    let timeLeft = seconds;
    
    const formatTime = (t) => {
        const m = Math.floor(t / 60).toString().padStart(2, '0');
        const s = (t % 60).toString().padStart(2, '0');
        return ${m}:${s};
    };

    timerDisplay.textContent = formatTime(timeLeft);
    cooldownDisplay.classList.remove('hidden');

    if (timeLeft <= 0) {
        timerDisplay.textContent = "Ready!";
        return;
    }

    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            checkCooldown(); // Re-enable button
        }
    }, 1000);
}

async function watchAdAndClaim() {
    if (watchAdBtn.disabled) return;
    
    showStatus("Waiting for ad completion...");
    watchAdBtn.disabled = true;
    
    // Simulate ad watching or use actual SDK callback
    // For this example, we assume the SDK triggers a callback or we wait a few seconds
    // In a real scenario, you'd listen to the ad SDK's 'ad_complete' event
    
    setTimeout(async () => {
        try {
            const now = Date.now();
            const rewardAmount = 0.0012;
            
            // Update Firebase
            await db.ref(users/${currentUser.email}).update({
                balance: firebase.database.ServerValue.increment(rewardAmount),
                lastClaim: now
            });
            
            // Update local state
            currentUser.balance += rewardAmount;
            updateBalance();
            showStatus("Reward claimed successfully!");
            
            setTimeout(() => {
                hideStatus();
                checkCooldown();
            }, 2000);
            
        } catch (error) {
            showStatus("Claim failed. Please retry.", true);
            watchAdBtn.disabled = false;
        }
    }, 2000); // Simulated ad delay
}

// --- Leaderboard Logic ---
async function loadLeaderboards() {
    try {
        const dailySnap = await db.ref('leaderboard/daily').once('value');
        const weeklySnap = await db.ref('leaderboard/weekly').once('value');
        
        renderLeaderboard(dailySnap, leaderboardDaily);
        renderLeaderboard(weeklySnap, leaderboardWeekly);
    } catch (e) {
        console.error("Leaderboard load error", e);
    }
}

function renderLeaderboard(snapshot, container) {
    container.innerHTML = '';
    if (!snapshot.exists()) {
        container.innerHTML = '<li class="text-sm text-gray-400">No data yet</li>';
        return;
    }
    
    const users = [];
    snapshot.forEach(child => {
        users.push({ email: child.key, score: child.val() });
    });
    
    // Sort by score descending

users.sort((a, b) => b.score - a.score);
    
    // Take top 3
    users.slice(0, 3).forEach((user, index) => {
        const li = document.createElement('li');
        li.className = "flex justify-between items-center text-sm bg-white/50 p-2 rounded-lg border border-white/30";
        
        let icon = "";
        if (index === 0) icon = '<i class="fas fa-trophy text-yellow-500"></i>';
        else if (index === 1) icon = '<i class="fas fa-medal text-gray-400"></i>';
        else if (index === 2) icon = '<i class="fas fa-medal text-orange-400"></i>';
        
        li.innerHTML = `
            <div class="flex items-center gap-2 truncate">
                ${icon}
                <span class="truncate">${user.email.split('@')[0]}</span>
            </div>
            <span class="font-bold text-indigo-600">${user.score.toFixed(4)}</span>
        `;
        container.appendChild(li);
    });
}
```
</details>
