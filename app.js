/* Paperhouse Inc. frontend
   Security: all reward/payout rules MUST be enforced server-side.
   Never place a FaucetPay API key in this file.
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
const db = firebase.firestore();

const $ = id => document.getElementById(id);
const state = { user: null, profile: null, claim: null, board: 'daily', groupId: null };
const adZones = [
  { name: 'Zone 1', fn: () => window.show_10337853?.() },
  { name: 'Zone 2', fn: () => window.show_10337795?.() },
  { name: 'Zone 3', fn: () => window.show_10555663?.() }
];

function dayZone() {
  const day = Math.floor(Date.now() / 86400000);
  return adZones[day % adZones.length];
}
function setMessage(text, error = false) {
  $('message').textContent = text;
  $('message').className = `mt-4 text-sm ${error ? 'text-rose-400' : 'text-slate-400'}`;
}
function zonePopup() {
  const zone = dayZone();
  $('zoneName').textContent = zone.name;
  return zone.fn ? zone.fn() : Promise.reject(new Error('Ad provider is unavailable'));
}
function renderClaim() {
  const c = state.claim || { rewardedAds: 0, popupAds: 0, claimsToday: 0, cooldownUntil: 0 };
  $('rewardedCount').textContent = `${c.rewardedAds || 0} / 3`;
  $('popupCount').textContent = `${c.popupAds || 0} / 1`;
  $('claimCount').textContent = `${c.claimsToday || 0} / 30`;
  const ready = (c.rewardedAds >= 3 && c.popupAds >= 1 && Date.now() >= (c.cooldownUntil || 0) && c.claimsToday < 30 && !!state.profile?.faucetpayEmail);
  $('claimBtn').disabled = !ready;
  const remaining = Math.max(0, (c.cooldownUntil || 0) - Date.now());
  $('cooldown').textContent = remaining ? `${Math.ceil(remaining / 1000)}s` : 'Ready';
}
async function ensureUser() {
  if (auth.currentUser) return auth.currentUser;
  const credential = await auth.signInAnonymously();
  return credential.user;
}
async function loadProfile() {
  const snap = await db.collection('users').doc(state.user.uid).get();
  state.profile = snap.exists ? snap.data() : {};
  $('email').value = state.profile.faucetpayEmail || '';
  renderClaim();
}
async function loadClaim() {
  const r = await fetch('/api/me/claim-status', { credentials: 'include' });
  if (r.ok) state.claim = await r.json();
  renderClaim();
}
async function loadStats() {
  const r = await fetch('/api/stats');
  if (!r.ok) return;
  const x = await r.json();
  $('totalUsers').textContent = Number(x.totalUsers || 0).toLocaleString();
  $('totalWithdrawn').textContent = `${Number(x.totalWithdrawn || 0).toFixed(4)} USDT`;
}
async function watch(kind) {
  const button = kind === 'rewarded' ? $('rewardedBtn') : $('popupBtn');
  button.disabled = true;
  setMessage('Loading today’s ad…');
  try {
    const result = kind === 'popup' ? await dayZone().fn('pop') : await dayZone().fn();
    // The server should independently verify the ad callback/token where supported.
    const r = await fetch('/api/ads/complete', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ kind, zone: dayZone().name, providerResult: !!result }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Ad reward was not accepted');
    state.claim = await r.json();
    setMessage('Ad completed. Your progress was saved.');
    renderClaim();
  } catch (e) { setMessage(e.message || 'The ad could not be loaded.', true); }
  finally { button.disabled = false; }
}
async function claim() {
  $('claimBtn').disabled = true;
  setMessage('Processing claim securely…');
  try {
    const r = await fetch('/api/claim', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: '{}' });
    const x = await r.json();
    if (!r.ok) throw new Error(x.error || 'Claim failed');
    state.claim = x.status;
    setMessage(`Success: ${x.amount} USDT sent. Transaction: ${x.txId || 'pending'}`);
    renderClaim(); await loadStats();
  } catch (e) { setMessage(e.message, true); renderClaim(); }
}
async function saveProfile(e) {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const r = await fetch('/api/profile', { method: 'PUT', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ faucetpayEmail: email }) });
  $('profileMessage').textContent = r.ok ? 'Email saved.' : ((await r.json().catch(() => ({}))).error || 'Could not save email.');
  if (r.ok) { state.profile = {...state.profile, faucetpayEmail: email}; renderClaim(); }
}
function listenChat() {
  db.collection('chat').orderBy('createdAt', 'desc').limit(50).onSnapshot(s => {
    $('chatMessages').innerHTML = s.docs.reverse().map(d => `<p><b class="text-cyan-400">${escapeHtml(d.data().name || 'User')}</b>: ${escapeHtml(d.data().text)}</p>`).join('');
  });
}
async function sendChat(e, groupId = null) {
  e.preventDefault(); const input = groupId ? $('groupInput') : $('chatInput'); const text = input.value.trim(); if (!text) return;
  const path = groupId ? db.collection('groups').doc(groupId).collection('messages') : db.collection('chat');
  await path.add({ uid: state.user.uid, name: state.profile?.displayName || 'User', text, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); input.value = '';
}
function escapeHtml(s = '') { return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
async function loadBoard(board = state.board) {
  state.board = board; const r = await fetch(`/api/leaderboard?period=${board}`); if (!r.ok) return; const rows = await r.json();
  $('leaderboard').innerHTML = rows.map((x, i) => `<li class="flex justify-between rounded-lg bg-slate-800 p-2"><span>#${i + 1} ${escapeHtml(x.name || 'User')}</span><b>${x.claims}</b></li>`).join('') || '<li class="text-slate-400">No claims yet.</li>';
}
async function loadGroups() {
  const r = await fetch('/api/groups'); if (!r.ok) return; const groups = await r.json();
  $('groupsList').innerHTML = groups.map(g => `<div class="rounded-xl bg-slate-800 p-3 flex justify-between gap-2"><span><b>${escapeHtml(g.name)}</b><small class="block text-slate-400">${g.memberCount}/300 members</small></span><button data-join="${g.id}" class="joinBtn rounded-lg bg-cyan-500 text-slate-950 px-3 py-1 font-bold">Join</button></div>`).join('');
  document.querySelectorAll('.joinBtn').forEach(b => b.onclick = () => joinGroup(b.dataset.join));
}
async function joinGroup(id) { const r = await fetch(`/api/groups/${id}/join`, {method:'POST', credentials:'include'}); if (!r.ok) return; state.groupId = id; const group = (await r.json()); $('groupTitle').textContent = group.name; $('groupChat').classList.remove('hidden'); db.collection('groups').doc(id).collection('messages').orderBy('createdAt').limitToLast(100).onSnapshot(s => $('groupMessages').innerHTML = s.docs.map(d => `<p><b>${escapeHtml(d.data().name || 'User')}</b>: ${escapeHtml(d.data().text)}</p>`).join('')); }

$('rewardedBtn').onclick = () => watch('rewarded'); $('popupBtn').onclick = () => watch('popup'); $('claimBtn').onclick = claim; $('profileForm').onsubmit = saveProfile; $('chatForm').onsubmit = e => sendChat(e); $('groupForm').onsubmit = e => sendChat(e, state.groupId); $('createGroupBtn').onclick = async () => { const name = prompt('Group name?'); if (name) { await fetch('/api/groups', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}); loadGroups(); }}; document.querySelectorAll('.boardBtn').forEach(b => b.onclick = () => loadBoard(b.dataset.board));
setInterval(renderClaim, 1000);

(async function init() { try { state.user = await ensureUser(); $('authStatus').textContent = 'Signed in'; await loadProfile(); await Promise.all([loadClaim(), loadStats(), loadBoard(), loadGroups()]); listenChat(); $('zoneName').textContent = dayZone().name; } catch (e) { $('authStatus').textContent = 'Connection error'; setMessage('Please refresh and try again.', true); } })();