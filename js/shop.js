// ============================================================
// shop.js — магазин
// ============================================================
import { state } from './state.js';
import { apiFetch, loadPrices } from './api.js';
import { showToast, updateUI } from './ui.js';

const tg = window.Telegram.WebApp;

const SHOP_ITEMS = [
  { id: 'acorn',       name: 'Желудь', icon: 'assets/acorn.png',           emoji: '🌰' },
  { id: 'plant_acorn', name: 'Росток', icon: 'assets/acorn_planter_1.png', emoji: '🌱' },
];

export function resetShopState() {
  state.currentShopItem     = null;
  state.currentShopQuantity = 1;
  state.currentAction       = 'buy';

  document.getElementById('qty-input').value                    = '1';
  document.getElementById('detail-icon-placeholder').style.display = 'inline';
  document.getElementById('detail-icon-big').style.display         = 'none';
  document.getElementById('detail-name').innerText              = 'Выберите предмет';
  document.getElementById('detail-price').innerHTML             = 'Цена: —';
  document.getElementById('total-cost').style.display           = 'none';
  document.querySelectorAll('#shop-items-container .shop-item').forEach(el => el.classList.remove('selected'));
  document.getElementById('shop-toggle-mini').classList.remove('sell-mode');
  document.getElementById('shop-action-label').style.color     = 'var(--win)';
  document.getElementById('shop-action-label').innerText        = 'КУПИТЬ';
  updateTradeButton();
}

export async function loadShopItems() {
  await loadPrices();
  const container = document.getElementById('shop-items-container');
  container.innerHTML = '';

  for (const def of SHOP_ITEMS) {
    const item = {
      ...def,
      price:      state.prices[def.id]?.buy  || 0,
      sell_price: state.prices[def.id]?.sell || 0,
    };
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.onclick   = () => selectShopItem(item, div);
    const displayPrice = state.currentAction === 'buy' ? item.price : item.sell_price;
    div.innerHTML = `
      <img class="shop-item-img" src="${BASE}/${item.icon}" alt="${item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span class="shop-item-emoji" style="display:none">${item.emoji}</span>
      <div class="shop-item-name">${item.name}</div>
      <div class="shop-item-price">${displayPrice} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""></div>`;
    container.appendChild(div);
  }
}

function selectShopItem(item, el) {
  state.currentShopItem     = item;
  state.currentShopQuantity = 1;
  document.getElementById('qty-input').value = 1;

  document.getElementById('detail-icon-placeholder').style.display = 'none';
  const bigIcon = document.getElementById('detail-icon-big');
  bigIcon.src   = `${BASE}/${item.icon}`;
  bigIcon.style.display = 'block';
  bigIcon.onerror = () => {
    bigIcon.style.display = 'none';
    const ph = document.getElementById('detail-icon-placeholder');
    ph.style.display = 'inline';
    ph.innerText = item.emoji;
  };
  document.getElementById('detail-name').innerText = item.name;
  updatePriceDisplay();
  document.querySelectorAll('#shop-items-container .shop-item').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

export function toggleActionMini() {
  const toggle = document.getElementById('shop-toggle-mini');
  toggle.classList.toggle('sell-mode');
  state.currentAction = toggle.classList.contains('sell-mode') ? 'sell' : 'buy';
  const label = document.getElementById('shop-action-label');
  label.innerText   = state.currentAction === 'buy' ? 'КУПИТЬ' : 'ПРОДАТЬ';
  label.style.color = state.currentAction === 'buy' ? 'var(--win)' : 'var(--lose)';
  updatePriceDisplay();
  updateShopItemPrices();
  updateTradeButton();
}

export function updateTradeButton() {
  const btn = document.getElementById('shop-trade-btn');
  if (btn) {
    btn.innerText = state.currentAction === 'buy' ? 'КУПИТЬ' : 'ПРОДАТЬ';
    btn.classList.toggle('sell-mode', state.currentAction === 'sell');
  }
}

export function updateShopItemPrices() {
  document.querySelectorAll('#shop-items-container .shop-item').forEach((el, i) => {
    const def = SHOP_ITEMS[i];
    if (!def) return;
    const price = state.currentAction === 'buy'
      ? (state.prices[def.id]?.buy  || 0)
      : (state.prices[def.id]?.sell || 0);
    const priceEl = el.querySelector('.shop-item-price');
    if (priceEl) priceEl.innerHTML = `${price} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt="">`;
  });
}

function updatePriceDisplay() {
  const totalCostEl = document.getElementById('total-cost');
  if (!state.currentShopItem) {
    document.getElementById('detail-price').innerHTML = 'Цена: —';
    totalCostEl.style.display = 'none';
    return;
  }
  const price = state.currentAction === 'buy' ? state.currentShopItem.price : state.currentShopItem.sell_price;
  const total = price * state.currentShopQuantity;
  document.getElementById('detail-price').innerHTML =
    `${price} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""> / шт.`;
  totalCostEl.innerHTML =
    `${price} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""> × ${state.currentShopQuantity} = <b>${total.toLocaleString()}</b> <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt="">`;
  totalCostEl.style.display = 'flex';
}

export function onQtyInput(value) {
  let qty = parseInt(value) || 1;
  if (qty < 1)      qty = 1;
  if (qty > 999999) qty = 999999;
  state.currentShopQuantity = qty;
  updatePriceDisplay();
}

export async function performTransaction() {
  if (!state.currentShopItem) { tg.HapticFeedback.notificationOccurred('error'); showToast('Выберите предмет'); return; }
  const endpoint = state.currentAction === 'buy' ? '/api/shop/buy' : '/api/shop/sell';
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, item_id: state.currentShopItem.id, quantity: state.currentShopQuantity }),
  });
  if (response?.success) {
    state.user.balance       = response.new_balance;
    state.user.acorns        = response.new_acorns;
    state.user.plant_acorns  = response.new_plant_acorns;
    updateUI();
    tg.HapticFeedback.notificationOccurred('success');
    showToast(`${state.currentAction === 'buy' ? 'Куплено' : 'Продано'} ${state.currentShopQuantity}x ${state.currentShopItem.name}`);
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(response?.error || 'Ошибка операции');
  }
}