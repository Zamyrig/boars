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
});

// nav с хуками
const _origNav = window.nav;
window.nav = function(id) {
  _origNav(id);
  if (id === 'scr-map')           renderMap();
  if (id === 'scr-farm-location') loadFarmState();
  if (id === 'scr-field')         loadForestState();   // ФИКС: был scr-forest-location
};

document.getElementById('version-label').textContent = 'v' + APP_VERSION;
auth();