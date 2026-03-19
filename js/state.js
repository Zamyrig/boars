// ============================================================
// state.js — общее состояние приложения
// ============================================================

export const RAID_MAX_HOURS  = 10;
export const RAID_REST_HOURS = 4;
export const TOTAL_SLOTS     = 20;

export const FARM_SLOT_CONFIGS = [
  { slot: 1, unlock_cost: { acorns: 3,    coins: 30,    plant_acorns: 0  } },
  { slot: 2, unlock_cost: { acorns: 5,    coins: 50,    plant_acorns: 0  } },
  { slot: 3, unlock_cost: { acorns: 10,   coins: 100,   plant_acorns: 0  } },
  { slot: 4, unlock_cost: { acorns: 100,  coins: 1000,  plant_acorns: 1  } },
  { slot: 5, unlock_cost: { acorns: 300,  coins: 3000,  plant_acorns: 3  } },
  { slot: 6, unlock_cost: { acorns: 1000, coins: 10000, plant_acorns: 10 } },
];

export const ITEM_DEFS_LOCAL = {
  acorn:       { icon: 'assets/acorn.png',           emoji: '🌰' },
  plant_acorn: { icon: 'assets/acorn_planter_1.png', emoji: '🌱' },
};

export const INV_TAB_TITLES = {
  bag: 'СУМКА', farm: 'ФЕРМА', forest: 'ЛЕС', mine: 'ШАХТА', cave: 'ПЕЩЕРА',
};
export const INV_TAB_BG = {
  bag: 'bg-inventory', farm: 'bg-farm', forest: 'bg-forest', mine: 'bg-mine', cave: 'bg-main',
};

// ── Прогресс (localStorage) ───────────────────────────────────

function loadProgress() {
  try {
    const raw = localStorage.getItem('wtb_progress');
    const p = raw ? JSON.parse(raw) : {};
    return {
      defeated_bosses: p.defeated_bosses || [],
      farm_owned: p.farm_owned || false,
    };
  } catch { return { defeated_bosses: [], farm_owned: false }; }
}

function saveProgress(p) {
  try { localStorage.setItem('wtb_progress', JSON.stringify(p)); } catch {}
}

export const progress = loadProgress();

export function defeatBoss(bossId) {
  if (!progress.defeated_bosses.includes(bossId)) {
    progress.defeated_bosses.push(bossId);
    saveProgress(progress);
  }
}

export function isBossDefeated(bossId) {
  return progress.defeated_bosses.includes(bossId);
}

export function buyFarm() {
  progress.farm_owned = true;
  saveProgress(progress);
}

export function isFarmOwned() {
  return progress.farm_owned;
}

// ── Мутируемое состояние ─────────────────────────────────────

export const state = {
  user: null,
  prices: {},
  itemDefs: {},

  // бой
  selectedSide: 0,
  isWatchingMode: false,
  isBattleLocked: false,
  battleResult: null,
  watchCooldownRemaining: 0,
  watchCooldownTimer: null,

  // rpg
  rpg: null,

  // магазин
  currentShopItem: null,
  currentShopQuantity: 1,
  currentAction: 'buy',

  // рейтинг
  fullLeaderboardLoaded: false,
  fullLeaderboardData: [],
  userRank: '?',

  // ферма
  farmState: null,
  farmDropTable: null,
  farmTimerInterval: null,
  activeFarmSlot: null,
  selectedFarmItem: null,
  farmConfirmMode: false,

  // лес
  forestState: null,
  forestTimerInterval: null,
};