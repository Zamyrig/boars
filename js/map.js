// ============================================================
// map.js — карта мира
// ============================================================
import { state, isBossDefeated, isFarmOwned, buyFarm } from './state.js';
import { nav, showToast } from './ui.js';
import { tryStartBattle } from './battle.js';
import { loadFarmState } from './farm.js';
import { loadForestState } from './forest.js';

const tg = window.Telegram.WebApp;

const LOCATIONS = [
  {
    id: 'mine',
    name: 'Шахта',
    emoji: '⛏️',
    desc: 'Слабые враги. Хорошее начало.',
    show: () => true,
    locked: () => false,
    action: () => tryStartBattle('mine_grunt'),
  },
  {
    id: 'cave',
    name: 'Пещера',
    emoji: '🕳️',
    desc: 'Здесь прячется Бригадир. Первый босс.',
    show: () => !isBossDefeated('boss_1'),
    locked: () => false,
    isBoss: true,
    action: () => tryStartBattle('boss_1'),
  },
  {
    id: 'field',
    name: 'Поляна',
    emoji: '🌿',
    desc: 'Поход кабана и бои со зрителями.',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => nav('scr-field'),
  },
  {
    id: 'settlement',
    name: 'Поселение',
    emoji: '🏘️',
    desc: 'Торговцы и NPC.',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => nav('scr-settlement'),
  },
  {
    id: 'farm',
    name: 'Ферма',
    emoji: '🌾',
    desc: isFarmOwned() ? 'Выращивай ростки и собирай урожай.' : 'Старый фермер продаёт за 500 монет.',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => _openFarm(),
  },
  {
    id: 'forest',
    name: 'Лес',
    emoji: '🌲',
    desc: 'Враги 2 уровня. Опаснее шахты.',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    action: () => tryStartBattle('mine_grunt'),
  },
  {
    id: 'mansion',
    name: 'Особняк',
    emoji: '🏚️',
    desc: isBossDefeated('boss_2') ? 'Проводи экскурсии.' : 'Логово 2 босса.',
    show: () => true,
    locked: () => !isBossDefeated('boss_1'),
    after: 'boss1',
    isBoss: () => !isBossDefeated('boss_2'),
    action: () => tryStartBattle('mine_grunt'),
  },
  {
    id: 'bear_cave',
    name: 'Медвежья берлога',
    emoji: '🐻',
    desc: 'Враги 3 уровня.',
    show: () => true,
    locked: () => !isBossDefeated('boss_2'),
    after: 'boss2',
    action: () => tryStartBattle('mine_grunt'),
  },
  {
    id: 'forester',
    name: 'Домик лесника',
    emoji: '🏠',
    desc: 'Финальный босс. Открывает мультиплеер.',
    show: () => true,
    locked: () => !isBossDefeated('boss_2'),
    after: 'boss2',
    isBoss: () => !isBossDefeated('boss_3'),
    action: () => tryStartBattle('mine_grunt'),
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
    const desc      = typeof loc.desc === 'function' ? loc.desc() : loc.desc;

    const card = document.createElement('div');
    card.className = 'map-loc-card'
      + (isLocked ? ' locked' : ' unlocked')
      + (isBossLoc && !isLocked ? ' boss-loc' : '');

    card.innerHTML = `
      <div class="map-loc-emoji">${loc.emoji}</div>
      <div class="map-loc-name">${loc.name}</div>
      <div class="map-loc-desc">${isLocked ? _afterLabel(loc.after) : desc}</div>
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