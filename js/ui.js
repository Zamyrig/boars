// ============================================================
// ui.js — навигация, уведомления, результат боя
// ============================================================
import { state } from './state.js';
import { renderInventory, switchInvTab } from './inventory.js';
import { resetShopState, loadShopItems } from './shop.js';
import { loadRank } from './leaderboard.js';
import { coinImg, acornImg, seedImg } from './assets.js';

export { coinImg, acornImg, seedImg };

const tg = window.Telegram.WebApp;

const ALL_BGS = ['bg-main','bg-mine','bg-fight','bg-inventory','bg-shop','bg-farm'];

const SCREEN_BG = {
  'scr-main':           'bg-main',
  'scr-map':            'bg-main',
  'scr-profile':        'bg-main',
  'scr-rank':           'bg-main',
  'scr-bet':            'bg-main',
  'scr-load':           'bg-main',
  'scr-location':       'bg-main',
  'scr-fight':          'bg-fight',
  'scr-inventory':      'bg-inventory',
  'scr-shop':           'bg-shop',
  'scr-farm-location':  'bg-farm',
  'scr-farm-buy':       'bg-farm',
  'scr-field':          'bg-main',
  'scr-settlement':     'bg-main',
};

const CARD_SCREENS = new Set([
  'scr-bet','scr-inventory','scr-shop','scr-profile','scr-rank',
  'scr-load','scr-location','scr-map','scr-settlement',
  'scr-farm-location','scr-farm-buy','scr-field',
]);

// ── Навигация ─────────────────────────────────────────────────

export function nav(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (!screen) { console.warn('nav: screen not found:', id); return; }
  screen.classList.add('active');

  ALL_BGS.forEach(bg => { const el = document.getElementById(bg); if (el) el.style.display = 'none'; });
  const bgEl = document.getElementById(SCREEN_BG[id] || 'bg-main');
  if (bgEl) bgEl.style.display = 'block';

  document.body.classList.toggle('dimmed', CARD_SCREENS.has(id));
  document.body.classList.toggle('show-main-screen', id === 'scr-main');

  if (id === 'scr-inventory') renderInventory();
  if (id === 'scr-shop') { resetShopState(); loadShopItems(); }
  if (id === 'scr-rank') loadRank();

  tg.HapticFeedback.impactOccurred('light');
}

export function navLocation(type) {
  const locs = {
    farm:   { bg: 'bg-farm',  icon: '🌾', title: 'ФЕРМА'   },
    mine:   { bg: 'bg-mine',  icon: '⛏️', title: 'ШАХТА'  },
    forest: { bg: 'bg-main',  icon: '🌲', title: 'ЛЕС'     },
    cave:   { bg: 'bg-main',  icon: '🕳️', title: 'ПЕЩЕРА' },
    market: { bg: 'bg-shop',  icon: '🏪', title: 'РЫНОК'   },
  };
  const loc = locs[type] || locs.farm;
  ALL_BGS.forEach(bg => { const el = document.getElementById(bg); if (el) el.style.display = 'none'; });
  document.getElementById(loc.bg).style.display = 'block';
  document.getElementById('loc-icon').innerText  = loc.icon;
  document.getElementById('loc-title').innerText = loc.title;
  document.getElementById('loc-desc').innerText  = '';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('scr-location').classList.add('active');
  document.body.classList.add('dimmed');
  tg.HapticFeedback.impactOccurred('light');
}

// ── Обновление UI ─────────────────────────────────────────────

export function updateUI() {
  const u = state.user;
  if (!u) return;
  document.getElementById('bal-val').innerText    = u.balance.toLocaleString();
  document.getElementById('acorns-val').innerText = u.acorns.toLocaleString();
  document.getElementById('edit-name').value      = u.display_name || u.username || '';
  document.getElementById('st-games').innerText   = u.total_games || 0;
  document.getElementById('st-wins').innerText    = u.wins || 0;
  document.getElementById('st-lose').innerText    = u.lose || 0;
  const wr = u.total_games > 0 ? Math.round((u.wins / u.total_games) * 100) : 0;
  document.getElementById('st-wr').innerText          = wr + '%';
  document.getElementById('st-max-balance').innerText = (u.max_balance || 0).toLocaleString();
  document.getElementById('st-watched').innerText     = u.watched_battles || 0;
  const toggle = document.getElementById('private-profile-toggle');
  if (toggle) toggle.checked = !!u.private_profile;
  renderInventory();
}

// ── Уведомления ───────────────────────────────────────────────

let _toastQueue   = [];
let _toastRunning = false;

export function showToast(message) {
  _toastQueue.push(message);
  if (!_toastRunning) _runToastQueue();
}

function _runToastQueue() {
  if (!_toastQueue.length) { _toastRunning = false; return; }
  _toastRunning = true;
  const toast = document.getElementById('notification-toast');
  toast.textContent = _toastQueue.shift();
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); setTimeout(_runToastQueue, 200); }, 2200);
}

export function showBetDeduction(amount) {
  const notify = document.getElementById('bet-deduction-notify');
  document.getElementById('deduction-amount').innerText = amount.toLocaleString();
  notify.classList.add('show');
  setTimeout(() => notify.classList.remove('show'), 2000);
}

// ── Кулдаун просмотра боя ────────────────────────────────────

export function formatCooldown(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export function updateWatchButton() {
  const btn        = document.getElementById('watch-btn');
  const rewardLine = document.getElementById('watch-reward-line');
  if (!btn || !rewardLine) return;
  if (state.watchCooldownRemaining > 0) {
    btn.classList.add('on-cooldown');
    rewardLine.innerHTML = `<span class="watch-timer-line">до отката: ${formatCooldown(state.watchCooldownRemaining)}</span>`;
    rewardLine.className = '';
  } else {
    btn.classList.remove('on-cooldown');
    rewardLine.innerHTML = `+ 200 ${coinImg()}`;
    rewardLine.className = 'watch-reward-line';
  }
}

export function startWatchCooldownTick() {
  if (state.watchCooldownTimer) clearInterval(state.watchCooldownTimer);
  if (state.watchCooldownRemaining <= 0) return;
  state.watchCooldownTimer = setInterval(() => {
    if (state.watchCooldownRemaining > 0) {
      state.watchCooldownRemaining--;
      updateWatchButton();
    } else {
      clearInterval(state.watchCooldownTimer);
      state.watchCooldownTimer = null;
      updateWatchButton();
    }
  }, 1000);
}

// ── Результат боя ─────────────────────────────────────────────

export function showResult(title, amount, type) {
  const overlay = document.getElementById('result-overlay');
  const t    = document.getElementById('res-title');
  const s    = document.getElementById('res-sum');
  const icon = document.getElementById('res-icon');
  t.innerText = title;
  if (type === 'win') {
    icon.innerText = '🏆'; t.style.color = 'var(--win)';
    s.innerHTML = `+${amount.toLocaleString()} ${coinImg()}`; s.style.color = 'var(--win)';
  } else if (type === 'lose') {
    icon.innerText = '💀'; t.style.color = 'var(--lose)'; s.innerHTML = ''; s.style.color = '';
  } else if (type === 'watch_reward') {
    icon.innerText = '👁'; t.style.color = '#fff';
    s.innerHTML = `+${amount.toLocaleString()} ${coinImg()}`; s.style.color = 'var(--win)';
  } else if (type === 'watch_no_reward') {
    icon.innerText = '👁'; t.style.color = '#aaa';
    s.innerHTML = `<span style="font-size:0.9rem;opacity:0.6;">Награда будет после отката</span>`; s.style.color = '';
  }
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('result-card').classList.add('active'), 50);
}

export function closeResult() {
  const br = state.battleResult;
  if (br) {
    if (br.new_balance     !== undefined) state.user.balance         = br.new_balance;
    if (br.acorns          !== undefined) state.user.acorns          = br.acorns;
    if (br.plant_acorns    !== undefined) state.user.plant_acorns    = br.plant_acorns;
    if (br.max_balance     !== undefined) state.user.max_balance     = br.max_balance;
    if (br.watched_battles !== undefined) state.user.watched_battles = br.watched_battles;
    document.getElementById('bal-val').innerText    = state.user.balance.toLocaleString();
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
    state.battleResult = null;
  }
  document.getElementById('result-card').classList.remove('active');
  setTimeout(() => { document.getElementById('result-overlay').style.display = 'none'; nav('scr-main'); }, 300);
}