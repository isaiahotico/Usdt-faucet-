/* Paperhouse Inc. — improved frontend
   IMPORTANT: FaucetPay API credentials belong only on your server.
   Frontend calls authenticated /api endpoints and never sends a payout itself.
*/

const firebaseConfig = {
  apiKey: 'AIzaSyBwpa8mA83JAv2A2Dj0rh5VHwodyv5N3dg',
  authDomain: 'freegcash-ads.firebaseapp.com',
  databaseURL: 'https://freegcash-ads-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'freegcash-ads',
  storageBucket: 'freegcash-ads.firebasestorage.app',
  messagingSenderId: '608086825364',
  appId: '1:608086825364:web:3a8e628d231b52c6171781'
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const $ = id => document.getElementById(id);
const CLAIM_AMOUNT = '0.0012';
const MAX_CLAIMS = 30;
const COOLDOWN_MS = 3 * 60 * 1000;
const AUTO_AD_INTERVAL_MS = 5 * 60 * 1000;
const state = { user: null, profile: {}, claim: null, board: 'daily', groupId: null, groupUnsubscribe: null };

const adZones = [
  { name: 'Zone 1', key: '10337853', show: () => window.show_10337853 },
  { name: 'Zone 2', key: '10337795', show: () => window.show_10337795 },
  { name: 'Zone 3', key: '10555663', show: () => window.show_10555663 }
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function utcDayNumber() { return Math.floor(Date.now() / 86400000); }
function currentZone() { return adZones[utcDayNumber() % adZones.length]; }
function setMessage(text, error = false) { $('message').textContent = text; $('message').className = `mt-4 min-h-5 text-sm ${error ? 'text-rose-400' : 'text-slate-400'}`; }
function setButtonBusy(button, busy, text) { if (!button.dataset.original) button.dataset.original = button.textContent; button.disabled = busy; button.textContent = busy ? text : button.dataset.original; }

async function api(path, options = {}) {
  const token = state.user ? await state.user.getIdToken() : null;
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  let body = null; try { body = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function renderClaim() {
  const c = state.claim || {};
  const rewarded = Number(c.rewardedAds || 0);
  const popup = Number(c.popupAds || 0);
  const claims = Number(c.claimsToday || 0);
  const cooldownUntil = Number(c.cooldownUntil || 0);
  const cooldownRemaining = Math.max(0, cooldownUntil - Date.now());
  const eligible = Boolean(state.profile.faucetpayEmail) && rewarded >= 3 && popup >= 1 && !cooldownRemaining && claims < MAX_CLAIMS;
  $('rewardedCount').textContent = `${Math.min(rewarded, 3)} / 3`;
  $('popupCount').textContent = `${Math.min(popup, 1)} / 1`;
  $('claimCount').textContent = `${claims} / ${MAX_CLAIMS}`;
  $('cooldown').textContent = cooldownRemaining ? `${Math.ceil(cooldownRemaining / 1000)}s` : 'Ready';
  $('claimBtn').disabled = !eligible;
}

async function loadClaim() { try { state.claim = await api('/api/me/claim-status'); renderClaim(); } catch (e) { setMessage(e.message, true); } }
async function loadProfile() { const result = await api('/api/profile'); state.profile = result || {}; $('email').value = state.profile.faucetpayEmail || ''; renderClaim(); }
async function loadStats() { try { const x = await api('/api/stats'); $('totalUsers').textContent = Number(x.totalUsers || 0).toLocaleString(); $('totalWithdrawn').textContent = `${Number(x.totalWithdrawn || 0).toFixed(4)} USDT`; } catch (_) {} }

async function playAd(kind) {
  const zone = currentZone();
  const provider = zone.show();
  if (typeof provider !== 'function') throw new Error('This ad zone is unavailable right now.');
  // Popup mode is supplied only for the rewarded popup action.
  const result = kind === 'popup' ? await provider('pop') : await provider();
  // The backend must validate completion according to the ad provider’s supported callback/token.
  return api('/api/ads/complete', { method: 'POST', body: JSON.stringify({ kind, zone: zone.key, providerCompleted: Boolean(result) }) });
}

async function watch(kind) {
  const button = kind === 'rewarded' ? $('rewardedBtn') : $('popupBtn');
  setButtonBusy(button, true, 'Loading ad…'); setMessage(`Loading ${currentZone().name}…`);
  try { state.claim = await playAd(kind); setMessage('Ad completed and progress saved.'); renderClaim(); }
  catch (e) { setMessage(e.message, true); }
  finally { setButtonBusy(button, false); }
}
async function claimReward() {
  const button = $('claimBtn'); setButtonBusy(button, true, 'Processing…');
  try { const x = await api('/api/claim', { method: 'POST', body: '{}' }); state.claim = x.status; setMessage(`Claim successful: ${x.amount || CLAIM_AMOUNT} USDT. Transaction: ${x.txId || 'pending'}`); await loadStats(); }
  catch (e) { setMessage(e.message, true); }
  finally { renderClaim(); setButtonBusy(button, false); }
}
async function saveProfile(event) {
  event.preventDefault(); const email = $('email').value.trim().toLowerCase(); const button = event.submitter; setButtonBusy(button, true, 'Saving…');
  try { await api('/api/profile', { method: 'PUT', body: JSON.stringify({ faucetpayEmail: email }) }); state.profile.faucetpayEmail = email; $('profileMessage').textContent = 'FaucetPay email saved.'; renderClaim(); }
  catch (e) { $('profileMessage').textContent = e.message; }
  finally { setButtonBusy(button, false); }
}

function listenPublicChat() {
  db.collection('chat').orderBy('createdAt', 'desc').limit(50).onSnapshot(snapshot => {
    $('chatMessages').innerHTML = snapshot.docs.reverse().map(doc => { const x = doc.data(); return `<p class="rounded-xl bg-slate-900 px-3 py-2"><b class="text-cyan-300">${escapeHtml(x.name || 'User')}</b> <span class="text-slate-300">${escapeHtml(x.text)}</span></p>`; }).join('') || '<p class="text-slate-500">No messages yet.</p>';
  });
}
async function sendChat(event, groupId = null) {
  event.preventDefault(); const input = groupId ? $('groupInput') : $('chatInput'); const text = input.value.trim(); if (!text) return;
  const path = groupId ? db.collection('groups').doc(groupId).collection('messages') : db.collection('chat');
  await path.add({ uid: state.user.uid, name: state.profile.displayName || 'User', text, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); input.value = '';
}
async function loadLeaderboard(period = state.board) { state.board = period; try { const rows = await api(`/api/leaderboard?period=${encodeURIComponent(period)}`); $('leaderboard').innerHTML = rows.length ? rows.map((x, i) => `<li class="flex items-center justify-between rounded-2xl bg-slate-800/80 p-3"><span><b class="mr-2 text-cyan-300">#${i + 1}</b>${escapeHtml(x.name || 'User')}</span><b>${Number(x.claims || 0)} claims</b></li>`).join('') : '<li class="text-slate-500">No claims recorded yet.</li>'; } catch (e) { $('leaderboard').innerHTML = `<li class="text-rose-400">${escapeHtml(e.message)}</li>`; } }
async function loadGroups() { try { const groups = await api('/api/groups'); $('groupsList').innerHTML = groups.length ? groups.map(g => `<div class="flex items-center justify-between gap-3 rounded-2xl bg-slate-800/80 p-4"><div><b>${escapeHtml(g.name)}</b><small class="mt-1 block text-slate-400">${Number(g.memberCount || 0)} / 300 members</small></div><button data-join="${escapeHtml(g.id)}" class="joinBtn rounded-xl bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950">Join</button></div>`).join('') : '<p class="text-slate-500">No groups yet.</p>'; document.querySelectorAll('.joinBtn').forEach(button => button.onclick = () => joinGroup(button.dataset.join)); } catch (e) { $('groupsList').innerHTML = `<p class="text-rose-400">${escapeHtml(e.message)}</p>`; } }
async function joinGroup(id) { try { const group = await api(`/api/groups/${encodeURIComponent(id)}/join`, { method: 'POST' }); state.groupId = id; $('groupTitle').textContent = group.name; $('groupChat').classList.remove('hidden'); if (state.groupUnsubscribe) state.groupUnsubscribe(); state.groupUnsubscribe = db.collection('groups').doc(id).collection('messages').orderBy('createdAt').limitToLast(100).onSnapshot(s => $('groupMessages').innerHTML = s.docs.map(d => `<p class="mb-2"><b class="text-violet-300">${escapeHtml(d.data().name || 'User')}</b> ${escapeHtml(d.data().text)}</p>`).join('')); } catch (e) { setMessage(e.message, true); } }

function startAutomaticAds() {
  const run = () => { if (document.visibilityState === 'visible') { const zone = currentZone(); if (typeof zone.show() === 'function') zone.show()({ type: 'inApp', inAppSettings: { frequency: 1, capping: 0.1, interval: 300, timeout: 5, everyPage: false } }).catch?.(() => {}); } }; setTimeout(run, 5000); setInterval(run, AUTO_AD_INTERVAL_MS);
}

$('rewardedBtn').onclick = () => watch('rewarded'); $('popupBtn').onclick = () => watch('popup'); $('claimBtn').onclick = claimReward; $('profileForm').onsubmit = saveProfile; $('chatForm').onsubmit = e => sendChat(e); $('groupForm').onsubmit = e => sendChat(e, state.groupId); document.querySelectorAll('.boardBtn').forEach(b => b.onclick = () => loadLeaderboard(b.dataset.board)); $('createGroupBtn').onclick = async () => { const name = prompt('Enter a group name:'); if (!name?.trim()) return; try { await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); await loadGroups(); } catch (e) { setMessage(e.message, true); } };
setInterval(renderClaim, 1000);

(async function init() {
  try {
    await auth.signInAnonymously(); state.user = auth.currentUser; $('authStatus').textContent = 'Secure session active'; $('zoneName').textContent = currentZone().name;
    await Promise.all([loadProfile(), loadClaim(), loadStats(), loadLeaderboard(), loadGroups()]); listenPublicChat(); startAutomaticAds();
  } catch (e) { $('authStatus').textContent = 'Connection error'; setMessage('Unable to start the secure session. Please refresh and try again.', true); }
})();