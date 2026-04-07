// ============================================================
// main.js — точка входа
// ============================================================
import { state } from './state.js';
import { apiFetch, loadPrices, loadItemDefs } from './api.js';
import { nav, navLocation, updateUI, showToast, closeResult, updateWatchButton, startWatchCooldownTick } from './ui.js';
import { renderInventory, renderInventoryPotions, openItemDetail, closeItemDetail, quickSellFromDetail, switchInvTab } from './inventory.js';
import { loadFarmState, renderFarmSlots, closeFarmModal, selectFarmItem, doFarmPlantConfirm, doFarmUnlock, openFarmPlantModal, openFarmHarvestModal, openFarmGrowingModal, doFarmHarvest } from './farm.js';
import { loadForestState, startRaid, returnRaid, collectRaid } from './forest.js';
import { tryStartBattle, watchBattle, preStart, rpgAction, rpgPotionSelect } from './battle.js';
import { resetShopState, loadShopItems, toggleActionMini, onQtyInput, shopQtyStep, performTransaction } from './shop.js';
import { loadRank, toggleFullLeaderboard, showUserDetail, closeModal } from './leaderboard.js';
import { updateName, togglePrivateProfile } from './profile.js';
import { renderMap, tryBuyFarm } from './map.js';

const tg = window.Telegram.WebApp;
tg.expand();

// ── Переключение вкладок экрана Поляна ───────────────────────

function switchFieldTab(tab) {
  document.querySelectorAll('.field-tab-content').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.field-tab-btn').forEach(el => {
    el.classList.remove('active');
  });

  const content = document.getElementById('field-content-' + tab);
  if (content) content.style.display = 'flex';

  const btn = document.getElementById('field-tab-' + tab);
  if (btn) btn.classList.add('active');

  const titles = {
    arena:  '⚔️ ПОЛЯНА СРАЖЕНИЙ',
    forest: '🌲 ПОХОД В ЛЕС',
  };
  const titleEl = document.getElementById('field-tab-title');
  if (titleEl) titleEl.textContent = titles[tab] || '';
}

// ── Авторизация ───────────────────────────────────────────────

async function auth() {
  const tgUser = tg.initDataUnsafe?.user || { id: 'dev_user', username: 'kaban', first_name: 'Хряк' };

  const [userData, , , forestData] = await Promise.all([
    apiFetch('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ tg_id: tgUser.id, username: tgUser.username, first_name: tgUser.first_name }),
    }),
    loadItemDefs(),
    loadPrices(),
    apiFetch(`/api/forest/state?tg_id=${tgUser.id}`),
  ]);

  state.user = userData;
  if (forestData) state.forestState = forestData;

  if (state.user) {
    if (state.user.potion_hp  === undefined) state.user.potion_hp  = 0;
    if (state.user.potion_sta === undefined) state.user.potion_sta = 0;
    state.watchCooldownRemaining = state.user.watch_cooldown_remaining || 0;
    updateUI();
    updateWatchButton();
    startWatchCooldownTick();
    nav('scr-main');
  } else {
    showToast('Ошибка загрузки профиля');
  }
}

Object.assign(window, {
  nav,
  navLocation,
  closeResult,

  openItemDetail,
  closeItemDetail,
  quickSellFromDetail,
  switchInvTab,
  renderInventoryPotions,

  closeFarmModal,
  selectFarmItem,
  doFarmPlantConfirm,
  doFarmUnlock,
  doFarmHarvest,

  startRaid,
  returnRaid,
  collectRaid,

  tryStartBattle,
  watchBattle,
  preStart,
  rpgAction,
  rpgPotionSelect,

  toggleActionMini,
  onQtyInput,
  shopQtyStep,
  performTransaction,

  toggleFullLeaderboard,
  showUserDetail,
  closeModal,

  updateName,
  togglePrivateProfile,

  renderMap,
  tryBuyFarm,

  switchFieldTab,
});

// nav с хуками
const _origNav = window.nav;
window.nav = function(id) {
  _origNav(id);
  if (id === 'scr-map')           renderMap();
  if (id === 'scr-farm-location') loadFarmState();
  if (id === 'scr-field') {
    switchFieldTab('arena');  // сначала показываем правильную вкладку
    loadForestState();        // потом грузим данные (рендер уйдёт в forest-state-area)
  }
};

document.getElementById('version-label').textContent = 'v' + APP_VERSION;
auth();