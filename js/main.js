// ============================================================
// main.js — точка входа
// Инициализирует приложение и пробрасывает функции в window,
// чтобы inline-обработчики в HTML (onclick="nav(...)") работали.
// ============================================================
import { state } from './state.js';
import { apiFetch, loadPrices, loadItemDefs } from './api.js';
import { nav, navLocation, updateUI, showToast, closeResult, updateWatchButton, startWatchCooldownTick } from './ui.js';
import { renderInventory, openItemDetail, closeItemDetail, quickSellFromDetail, switchInvTab } from './inventory.js';
import { loadFarmState, renderFarmSlots, closeFarmModal, selectFarmItem, doFarmPlantConfirm, doFarmUnlock, openFarmPlantModal, openFarmHarvestModal, openFarmGrowingModal, doFarmHarvest } from './farm.js';
import { loadForestState, startRaid, returnRaid, collectRaid } from './forest.js';
import { tryStartBattle, watchBattle, preStart } from './battle.js';
import { resetShopState, loadShopItems, toggleActionMini, onQtyInput, performTransaction } from './shop.js';
import { loadRank, toggleFullLeaderboard, showUserDetail, closeModal } from './leaderboard.js';
import { updateName, togglePrivateProfile } from './profile.js';

const tg = window.Telegram.WebApp;
tg.expand();

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
    state.watchCooldownRemaining = state.user.watch_cooldown_remaining || 0;
    updateUI();
    updateWatchButton();
    startWatchCooldownTick();
    nav('scr-main');
  } else {
    showToast('Ошибка загрузки профиля');
  }
}

// ── Экспорт в window (нужен для onclick в HTML) ───────────────
// Все функции, которые вызываются из атрибутов HTML (onclick, onchange),
// должны быть доступны глобально.

Object.assign(window, {
  // навигация
  nav,
  navLocation,
  closeResult,

  // инвентарь
  openItemDetail,
  closeItemDetail,
  quickSellFromDetail,
  switchInvTab,

  // ферма
  closeFarmModal,
  selectFarmItem,
  doFarmPlantConfirm,
  doFarmUnlock,
  doFarmHarvest,

  // лес
  startRaid,
  returnRaid,
  collectRaid,

  // бой
  tryStartBattle,
  watchBattle,
  preStart,

  // магазин
  toggleActionMini,
  onQtyInput,
  performTransaction,

  // рейтинг
  toggleFullLeaderboard,
  showUserDetail,
  closeModal,

  // профиль
  updateName,
  togglePrivateProfile,
});

// ── Старт ─────────────────────────────────────────────────────
document.getElementById('version-label').textContent = 'v' + APP_VERSION;
auth();
