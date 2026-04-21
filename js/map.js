// ============================================================
// map.js — карта мира
// ============================================================
import { state, isBossDefeated, isFarmOwned, buyFarm } from './state.js';
import { nav, showToast } from './ui.js';
import { tryStartBattle } from './battle.js';
import { loadFarmState } from './farm.js';

const tg = window.Telegram.WebApp;

const LOCATIONS = [
  {
    id: 'mine',
    name: 'Шахта',
    emoji: '⛏️',
    show: () => true,
    locked: () => false,
    action: () => tryStartBattle('mine_grunt'),
  },
  {
    id: 'cave',
    name: 'Пещера',
    emoji: '🕳️',
    show: () => !isBossDefeated('boss_1'),
    locked: () => false,
    isBoss: true,
    action: () => tryStartBattle('boss_1'),
  },
  {
    id: 'field',
    name: 'Поляна',
    emoji: '🌿',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => nav('scr-field'),
  },
  {
    id: 'settlement',
    name: 'Поселение',
    emoji: '🏘️',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => nav('scr-settlement'),
  },
  {
    id: 'farm',
    name: 'Ферма',
    emoji: '🌾',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => _openFarm(),
  },
  {
    id: 'forest',
    name: 'Лес',
    emoji: '🌲',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => tryStartBattle('forest_grunt'),
  },
  {
    id: 'mansion',
    name: 'Особняк',
    emoji: '🏚️',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    isBoss: () => !isBossDefeated('boss_2'),
    action: () => showToast('Скоро!'),
  },
  {
    id: 'bear_cave',
    name: 'Медвежья берлога',
    emoji: '🐻',
    show: () => true,
    locked: () => !isBossDefeated('boss_2'),
    after: 'boss2',
    action: () => showToast('Скоро!'),
  },
  {
    id: 'forester',
    name: 'Домик лесника',
    emoji: '🏠',
    show: () => true,
    locked: () => !isBossDefeated('boss_2'),
    after: 'boss2',
    isBoss: () => !isBossDefeated('boss_3'),
    action: () => showToast('Скоро!'),
  },
];

// ── Ферма ─────────────────────────────────────────────────────

function _openFarm() {
  if (isFarmOwned()) {
    nav('scr-farm-location');
    loadFarmState();
  } else {
    nav('scr-farm-buy');
  }
}

export function tryBuyFarm() {
  if (!state.user) return;
  if (state.user.balance < 500) {
    showToast('Нужно 500 монет!');
    tg.HapticFeedback.notificationOccurred('error');
    return;
  }
  state.user.balance -= 500;
  document.getElementById('bal-val').innerText = state.user.balance.toLocaleString();
  buyFarm();
  tg.HapticFeedback.notificationOccurred('success');
  showToast('Ферма куплена! 🌾');
  nav('scr-farm-location');
  loadFarmState();
}

// ── Рендер ────────────────────────────────────────────────────

export function renderMap() {
  const grid = document.getElementById('map-locations-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const loc of LOCATIONS) {
    if (!loc.show()) continue;
    const isLocked  = loc.locked();
    const isBossLoc = typeof loc.isBoss === 'function' ? loc.isBoss() : !!loc.isBoss;

    const card = document.createElement('div');
    card.className = 'map-loc-card'
      + (isLocked ? ' locked' : ' unlocked')
      + (isBossLoc && !isLocked ? ' boss-loc' : '');

    card.innerHTML = `
      <div class="map-loc-emoji">${loc.emoji}</div>
      <div class="map-loc-name">${loc.name}</div>
      ${isLocked ? '<div class="map-loc-lock">🔒</div>' : ''}
      ${isBossLoc && !isLocked ? '<div class="map-loc-boss-badge">БОСС</div>' : ''}
    `;

    if (!isLocked) {
      card.onclick = () => { tg.HapticFeedback.impactOccurred('light'); loc.action(); };
    } else {
      card.onclick = () => { tg.HapticFeedback.notificationOccurred('warning'); showToast(`Открывается ${_afterLabel(loc.after)}`); };
    }
    grid.appendChild(card);
  }
}

function _afterLabel(after) {
  return { boss1: 'после победы над Бригадиром', boss2: 'после 2 босса', boss3: 'после 3 босса' }[after] || 'скоро';
}