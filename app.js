"use strict";

/*
  Paperhouse Inc. frontend

  IMPORTANT:
  - Never put your FaucetPay API key here.
  - The claim request must be handled by your secure backend.
  - The backend must validate:
      1. Firebase user authentication
      2. Daily limit
      3. Three-minute cooldown
      4. Correct FaucetPay email/wallet
      5. Duplicate claim prevention
      6. FaucetPay API response
*/

const firebaseConfig = {
  apiKey: "AIzaSyBwpa8mA83JAv2A2Dj0rh5VHwodyv5N3dg",
  authDomain: "freegcash-ads.firebaseapp.com",
  databaseURL: "https://freegcash-ads-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "freegcash-ads",
  storageBucket: "freegcash-ads.firebasestorage.app",
  messagingSenderId: "608086825364",
  appId: "1:608086825364:web:3a8e628d231b52c6171781"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

const REWARD_AMOUNT = 0.0012;
const CLAIM_COOLDOWN_MS = 3 * 60 * 1000;
const AUTO_AD_INTERVAL_MS = 5 * 60 * 1000;
const MAX_DAILY_CLAIMS = 30;

const AD_ZONES = [
  {
    number: 1,
    rewarded: window.show_10337853,
    popup: window.show_10337853
  },
  {
    number: 2,
    rewarded: window.show_10337795,
    popup: window.show_10337795
  },
  {
    number: 3,
    rewarded: window.show_10555663,
    popup: window.show_10555663
  }
];

let currentUser = null;
let currentProfile = null;
let userState = null;
let cooldownTimer = null;
let autoAdTimer = null;

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function setMessage(elementId, message, type = "info") {
  const element = $(elementId);

  const colors = {
    success: "text-emerald-600",
    error: "text-red-600",
    info: "text-blue-600"
  };

  element.className = `mt-3 text-sm ${colors[type] || colors.info}`;
  element.textContent = message;
}

function getUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getUtcDayNumber(date = new Date()) {
  return Math.floor(date.getTime() / 86400000);
}

function getCurrentAdZone() {
  const zoneIndex = getUtcDayNumber() % AD_ZONES.length;
  return AD_ZONES[zoneIndex];
}

function getTodayState() {
  const today = getUtcDateKey();

  if (!userState || userState.dateKey !== today) {
    userState = {
      dateKey: today,
      rewardedAds: 0,
      popupAds: 0,
      dailyClaims: 0,
      lastClaimAt: 0
    };
  }

  return userState;
}

function getRewardProgress() {
  const state = getTodayState();

  const rewardedProgress = Math.min(state.rewardedAds, 3);
  const popupProgress = Math.min(state.popupAds, 1);

  return rewardedProgress + popupProgress;
}

function hasClaimRequirement() {
  const state = getTodayState();

  return state.rewardedAds >= 3 && state.popupAds >= 1;
}

function updateFaucetUI() {
  const state = getTodayState();
  const zone = getCurrentAdZone();
  const progress = getRewardProgress();

  $("zoneNumber").textContent = zone.number;
  $("dailyClaims").textContent = `${state.dailyClaims} / ${MAX_DAILY_CLAIMS}`;
  $("balance").textContent = hasClaimRequirement()
    ? REWARD_AMOUNT.toFixed(4)
    : "0.0000";

  $("progressText").textContent = `${progress} / 4 ads`;
  $("progressBar").style.width = `${(progress / 4) * 100}%`;

  $("rewardedBtn").disabled = state.rewardedAds >= 3;
  $("popupBtn").disabled = state.popupAds >= 1;

  const cooldownRemaining = Math.max(
    0,
    CLAIM_COOLDOWN_MS - (Date.now() - Number(state.lastClaimAt || 0))
  );

  const canClaim =
    hasClaimRequirement() &&
    cooldownRemaining <= 0 &&
    state.dailyClaims < MAX_DAILY_CLAIMS;

  $("claimBtn").disabled = !canClaim;

  if (state.dailyClaims >= MAX_DAILY_CLAIMS) {
    $("cooldownText").textContent = "You have reached today’s 30-claim limit.";
  } else if (cooldownRemaining > 0) {
    $("cooldownText").textContent =
      `Next claim available in ${formatDuration(cooldownRemaining)}.`;
  } else if (!hasClaimRequirement()) {
    $("cooldownText").textContent =
      "Complete 3 rewarded ads and 1 popup ad to unlock your claim.";
  } else {
    $("cooldownText").textContent = "Your claim is ready.";
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function saveUserState() {
  if (!currentUser || !userState) return;

  await db.ref(`users/${currentUser.uid}/faucetState`).set(userState);
}

async function loadUserProfile(user) {
  const snapshot = await db.ref(`users/${user.uid}`).once("value");
  const data = snapshot.val() || {};

  currentProfile = data.profile || {};

  const storedState = data.faucetState || {};
  const today = getUtcDateKey();

  userState = {
    dateKey: today,
    rewardedAds: Number(storedState.dateKey === today ? storedState.rewardedAds : 0),
    popupAds: Number(storedState.dateKey === today ? storedState.popupAds : 0),
    dailyClaims: Number(storedState.dateKey === today ? storedState.dailyClaims : 0),
    lastClaimAt: Number(storedState.lastClaimAt || 0)
  };

  $("profileName").value = currentProfile.name || "";
  $("profileFaucetPay").value = currentProfile.faucetPayEmail || "";
  $("profileWallet").value = currentProfile.walletAddress || "";

  updateFaucetUI();
}

function getZoneFunction(type) {
  const zone = getCurrentAdZone();

  if (type === "popup") {
    return zone.popup;
  }

  return zone.rewarded;
}

async function showRewardAd(type) {
  const adFunction = getZoneFunction(type);

  if (typeof adFunction !== "function") {
    throw new Error("The selected ad zone is not available.");
  }

  if (type === "popup") {
    return adFunction("pop");
  }

  return adFunction();
}

async function handleRewardedAd() {
  const state = getTodayState();

  if (state.rewardedAds >= 3) {
    showToast("You already completed the rewarded ads for today.");
    return;
  }

  $("rewardedBtn").disabled = true;
  setMessage("faucetMessage", "Loading rewarded ad...", "info");

  try {
    await showRewardAd("rewarded");

    /*
      In production, do not trust only localStorage or frontend counters.
      Send a server-side reward event for validation.
    */

    state.rewardedAds += 1;
    await saveUserState();

    setMessage(
      "faucetMessage",
      `Rewarded ad completed: ${state.rewardedAds}/3.`,
      "success"
    );

    showToast("Rewarded ad completed.");
    updateFaucetUI();
  } catch (error) {
    console.error(error);
    setMessage(
      "faucetMessage",
      "The ad could not be completed. Please try again.",
      "error"
    );
    updateFaucetUI();
  }
}

async function handlePopupAd() {
  const state = getTodayState();

  if (state.popupAds >= 1) {
    showToast("You already completed the popup ad for today.");
    return;
  }

  $("popupBtn").disabled = true;
  setMessage("faucetMessage", "Loading popup ad...", "info");

  try {
    await showRewardAd("popup");

    state.popupAds += 1;
    await saveUserState();

    setMessage(
      "faucetMessage",
      "Popup ad completed. Your claim may now be ready.",
      "success"
    );

    showToast("Popup ad completed.");
    updateFaucetUI();
  } catch (error) {
    console.error(error);
    setMessage(
      "faucetMessage",
      "The popup ad could not be completed.",
      "error"
    );
    updateFaucetUI();
  }
}

async function handleClaim() {
  if (!currentUser) {
    showToast("Please sign in first.");
    return;
  }

  const state = getTodayState();

  if (!hasClaimRequirement()) {
    showToast("Complete all required ads first.");
    return;
  }

  if (state.dailyClaims >= MAX_DAILY_CLAIMS) {
    showToast("You have reached the daily claim limit.");
    return;
  }

  const cooldownRemaining =
    CLAIM_COOLDOWN_MS - (Date.now() - Number(state.lastClaimAt || 0));

  if (cooldownRemaining > 0) {
    showToast(`Please wait ${formatDuration(cooldownRemaining)}.`);
    return;
  }

  if (!currentProfile.faucetPayEmail && !currentProfile.walletAddress) {
    showToast("Please save your payment details first.");
    return;
  }

  $("claimBtn").disabled = true;
  setMessage("faucetMessage", "Submitting secure withdrawal request...", "info");

  try {
    const token = await currentUser.getIdToken();

    /*
      Your backend must:
      - Verify this Firebase ID token
      - Validate the user profile
      - Check cooldown and daily limit on the server
      - Call FaucetPay using the secret API key
      - Store a unique transaction ID
    */

    const response = await fetch("/api/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        amount: REWARD_AMOUNT
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Withdrawal failed.");
    }

    state.rewardedAds = 0;
    state.popupAds = 0;
    state.dailyClaims += 1;
    state.lastClaimAt = Date.now();

    await saveUserState();

    setMessage(
      "faucetMessage",
      "Withdrawal submitted successfully.",
      "success"
    );

    showToast("Your USDT withdrawal was submitted.");
    updateFaucetUI();
    loadWithdrawals();
  } catch (error) {
    console.error(error);

    setMessage(
      "faucetMessage",
      error.message || "Withdrawal failed. Please try again.",
      "error"
    );

    updateFaucetUI();
  }
}

async function registerUser(event) {
  event.preventDefault();

  const name = $("registerName").value.trim();
  const email = $("registerEmail").value.trim();
  const password = $("registerPassword").value;
  const faucetPayEmail = $("faucetPayEmail").value.trim();
  const walletAddress = $("walletAddress").value.trim();

  setMessage("authMessage", "Creating your account...", "info");

  try {
    const credential = await auth.createUserWithEmailAndPassword(
      email,
      password
    );

    await db.ref(`users/${credential.user.uid}`).set({
      profile: {
        name,
        email,
        faucetPayEmail,
        walletAddress,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      },
      faucetState: {
        dateKey: getUtcDateKey(),
        rewardedAds: 0,
        popupAds: 0,
        dailyClaims: 0,
        lastClaimAt: 0
      }
    });

    setMessage(
      "authMessage",
      "Account created successfully.",
      "success"
    );
  } catch (error) {
    console.error(error);
    setMessage("authMessage", error.message, "error");
  }
}

async function saveProfile(event) {
  event.preventDefault();

  if (!currentUser) return;

  const profile = {
    name: $("profileName").value.trim(),
    faucetPayEmail: $("profileFaucetPay").value.trim(),
    walletAddress: $("profileWallet").value.trim(),
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  };

  try {
    await db.ref(`users/${currentUser.uid}/profile`).update(profile);
    currentProfile = {
      ...currentProfile,
      ...profile
    };

    setMessage("profileMessage", "Payment profile saved.", "success");
    showToast("Profile updated.");
  } catch (error) {
    console.error(error);
    setMessage("profileMessage", "Unable to save profile.", "error");
  }
}

async function sendChatMessage(event) {
  event.preventDefault();

  if (!currentUser) return;

  const input = $("chatInput");
  const message = input.value.trim();

  if (!message) return;

  await db.ref("chats/general").push({
    uid: currentUser.uid,
    name: currentProfile?.name || "User",
    message,
    createdAt: firebase.database.ServerValue.TIMESTAMP
  });

  input.value = "";
}

function listenToChat() {
  db.ref("chats/general")
    .limitToLast(50)
    .on("value", (snapshot) => {
      const messages = [];

      snapshot.forEach((child) => {
        messages.push(child.val());
      });

      $("chatMessages").innerHTML = messages.length
        ? messages.map((item) => `
          <div class="rounded-2xl bg-white p-3 shadow-sm">
            <div class="text-xs font-black text-blue-600">
              ${escapeHtml(item.name || "User")}
            </div>
            <div class="mt-1 text-sm text-slate-700">
              ${escapeHtml(item.message || "")}
            </div>
          </div>
        `).join("")
        : `<p class="text-sm text-slate-500">No messages yet.</p>`;

      $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
    });
}

async function loadWithdrawals() {
  db.ref("withdrawals")
    .limitToLast(10)
    .on("value", (snapshot) => {
      const records = [];

      snapshot.forEach((child) => {
        records.push(child.val());
      });

      records.reverse();

      $("withdrawalList").innerHTML = records.length
        ? records.map((record) => `
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
            <div>
              <p class="text-sm font-black">
                ${escapeHtml(record.username || "User")}
              </p>
              <p class="text-xs text-slate-500">
                ${maskWallet(record.wallet || record.email || "")}
              </p>
            </div>
            <span class="text-sm font-black text-emerald-600">
              ${Number(record.amount || 0).toFixed(4)} USDT
            </span>
          </div>
        `).join("")
        : `<p class="text-sm text-slate-500">No withdrawals yet.</p>`;
    });
}

function listenToStatistics() {
  db.ref("statistics").on("value", (snapshot) => {
    const stats = snapshot.val() || {};

    $("totalUsers").textContent = Number(stats.totalUsers || 0).toLocaleString();
    $("totalWithdrawals").textContent =
      Number(stats.totalWithdrawals || 0).toLocaleString();
  });
}

function listenToLeaderboard(path, elementId) {
  db.ref(path)
    .orderByChild("claims")
    .limitToLast(10)
    .on("value", (snapshot) => {
      const users = [];

      snapshot.forEach((child) => {
        users.push(child.val());
      });

      users.reverse();

      $(elementId).innerHTML = users.length
        ? users.map((user, index) => `
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
            <div class="flex items-center gap-3">
              <div class="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-xs font-black text-blue-700">
                ${index + 1}
              </div>
              <span class="text-sm font-bold">
                ${escapeHtml(user.name || "User")}
              </span>
            </div>
            <span class="text-sm font-black text-blue-600">
              ${Number(user.claims || 0)}
            </span>
          </div>
        `).join("")
        : `<p class="text-sm text-slate-500">No leaderboard data yet.</p>`;
    });
}

async function startAutomaticAds() {
  const showInAppAd = getZoneFunction("rewarded");

  if (typeof showInAppAd !== "function") {
    console.warn("Current ad zone is unavailable.");
    return;
  }

  try {
    await showInAppAd({
      type: "inApp",
      inAppSettings: {
        frequency: 1,
        capping: 0.1,
        interval: 30,
        timeout: 5,
        everyPage: false
      }
    });
  } catch (error) {
    console.warn("Automatic ad error:", error);
  }

  clearInterval(autoAdTimer);

  autoAdTimer = setInterval(async () => {
    try {
      await showInAppAd({
        type: "inApp",
        inAppSettings: {
          frequency: 1,
          capping: 0.1,
          interval: 30,
          timeout: 5,
          everyPage: false
        }
      });
    } catch (error) {
      console.warn("Automatic ad error:", error);
    }
  }, AUTO_AD_INTERVAL_MS);
}

function startCooldownTimer() {
  clearInterval(cooldownTimer);

  cooldownTimer = setInterval(() => {
    updateFaucetUI();
  }, 1000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maskWallet(value) {
  if (!value) return "Hidden";

  if (value.length <= 10) {
    return `${value.slice(0, 3)}***`;
  }

  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function createGroup() {
  if (!currentUser) return;

  const groupName = prompt("Enter a group name:");

  if (!groupName || groupName.trim().length < 3) {
    return;
  }

  const groupRef = db.ref("groups").push();

  groupRef.set({
    name: groupName.trim(),
    ownerUid: currentUser.uid,
    memberCount: 1,
    maxMembers: 300,
    createdAt: firebase.database.ServerValue.TIMESTAMP
  })
    .then(() => {
      showToast("Group created successfully.");
    })
    .catch((error) => {
      console.error(error);
      showToast("Unable to create group.");
    });
}

auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (!user) {
    $("authCard").classList.remove("hidden");
    $("mainApp").classList.add("hidden");
    $("logoutBtn").classList.add("hidden");
    $("userStatus").textContent = "Not signed in";
    return;
  }

  $("authCard").classList.add("hidden");
  $("mainApp").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("userStatus").textContent = user.email;

  await loadUserProfile(user);

  listenToChat();
  listenToStatistics();
  loadWithdrawals();

  listenToLeaderboard("leaderboards/daily", "dailyLeaderboard");
  listenToLeaderboard("leaderboards/weekly", "weeklyLeaderboard");

  startCooldownTimer();
  startAutomaticAds();
});

$("registerForm").addEventListener("submit", registerUser);
$("profileForm").addEventListener("submit", saveProfile);
$("chatForm").addEventListener("submit", sendChatMessage);

$("rewardedBtn").addEventListener("click", handleRewardedAd);
$("popupBtn").addEventListener("click", handlePopupAd);
$("claimBtn").addEventListener("click", handleClaim);
$("createGroupBtn").addEventListener("click", createGroup);

$("logoutBtn").addEventListener("click", async () => {
  await auth.signOut();
  showToast("You have been logged out.");
});