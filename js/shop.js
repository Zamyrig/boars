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

// ── Тоггл ─────────────────────────────────────────────────────────────────────
// Пересчитываем ширину/позицию ползунка по реальным DOM-размерам

export function _updateThumb() {
  const wrap   = document.getElementById('shop-toggle-wrap');
  const thumb  = document.getElementById('shop-toggle-thumb');
  const buyLbl = document.getElementById('shop-buy-label');
  const selLbl = document.getElementById('shop-sell-label');
  if (!wrap || !thumb || !buyLbl || !selLbl) return;

  const isSell = state.currentAction === 'sell';
  const target = isSell ? selLbl : buyLbl;

  // Позиция относительно wrap (с учётом padding: 3px)
  const wrapRect   = wrap.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  thumb.style.width     = targetRect.width + 'px';
  thumb.style.transform = `translateX(${targetRect.left - wrapRect.left - 3}px)`;
}

// ── Инициализация HTML тоггла ─────────────────────────────────────────────────
function _initToggleDOM() {
  // Находим шапку магазина и пересоздаём тоггл-враппер
  const header = document.querySelector('#scr-shop .shop-header');
  if (!header) return;

  // Убираем старый враппер если есть
  const oldWrap = header.querySelector('.shop-toggle-wrap');
  if (oldWrap) oldWrap.remove();

  const wrap = document.createElement('div');
  wrap.className = 'shop-toggle-wrap';
  wrap.id = 'shop-toggle-wrap';
  wrap.onclick = toggleActionMini;
  wrap.innerHTML = `
    <div class="shop-toggle-thumb" id="shop-toggle-thumb"></div>
    <span class="shop-toggle-label buy-label"  id="shop-buy-label">КУПИТЬ</span>
    <span class="shop-toggle-label sell-label" id="shop-sell-label">ПРОДАТЬ</span>
  `;
  header.appendChild(wrap);

  // Позиционируем thumb после рендера
  requestAnimationFrame(() => requestAnimationFrame(_updateThumb));
}

// ── Qty stepper ───────────────────────────────────────────────────────────────
function _initStepperDOM() {
  const row = document.querySelector('#scr-shop .shop-qty-row');
  if (!row) return;

  // Убираем старый input
  row.innerHTML = '';

  const stepper = document.createElement('div');
  stepper.className = 'qty-stepper';
  stepper.innerHTML = `
    <button class="qty-stepper-btn" id="qty-btn-minus" onclick="shopQtyStep(-1)">−</button>
    <input  class="qty-stepper-val" id="qty-input" type="number"
            value="1" min="1" inputmode="numeric"
            oninput="onQtyInput(this.value)">
    <button class="qty-stepper-btn" id="qty-btn-plus"  onclick="shopQtyStep(1)">+</button>
  `;
  row.appendChild(stepper);

  // Делаем shopQtyStep доступным глобально (вызывается из onclick)
  window.shopQtyStep = shopQtyStep;
}

// ── resetShopState ─────────────────────────────────────────────────────────────

export function resetShopState() {
  state.currentShopItem     = null;
  state.currentShopQuantity = 1;
  state.currentAction       = 'buy';

  _initToggleDOM();
  _initStepperDOM();

  const qtyInput = document.getElementById('qty-input');
  if (qtyInput) qtyInput.value = '1';

  const iconPh = document.getElementById('detail-icon-placeholder');
  const iconBig = document.getElementById('detail-icon-big');
  if (iconPh)  { iconPh.style.display = 'inline'; iconPh.innerText = '📦'; }
  if (iconBig) iconBig.style.display = 'none';

  const detailName  = document.getElementById('detail-name');
  const detailPrice = document.getElementById('detail-price');
  const totalCost   = document.getElementById('total-cost');
  if (detailName)  detailName.innerText = 'Выберите предмет';
  if (detailPrice) detailPrice.innerHTML = 'Цена: —';
  if (totalCost)   totalCost.style.display = 'none';

  document.querySelectorAll('#shop-items-container .shop-item').forEach(el => el.classList.remove('selected'));

  const wrap = document.getElementById('shop-toggle-wrap');
  if (wrap) wrap.classList.remove('sell-mode');

  updateTradeButton();
}

// ── loadShopItems ─────────────────────────────────────────────────────────────

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

  // после рендера позиционируем thumb
  requestAnimationFrame(() => requestAnimationFrame(_updateThumb));
}

function selectShopItem(item, el) {
  state.currentShopItem     = item;
  state.currentShopQuantity = 1;
  const qi = document.getElementById('qty-input');
  if (qi) qi.value = 1;

  const iconPh = document.getElementById('detail-icon-placeholder');
  const bigIcon = document.getElementById('detail-icon-big');
  if (iconPh)  iconPh.style.display = 'none';
  if (bigIcon) {
    bigIcon.src = `${BASE}/${item.icon}`;
    bigIcon.style.display = 'block';
    bigIcon.onerror = () => {
      bigIcon.style.display = 'none';
      if (iconPh) { iconPh.style.display = 'inline'; iconPh.innerText = item.emoji; }
    };
  }
  document.getElementById('detail-name').innerText = item.name;
  updatePriceDisplay();
  document.querySelectorAll('#shop-items-container .shop-item').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  tg.HapticFeedback.selectionChanged();
}

// ── Тоггл логика ──────────────────────────────────────────────────────────────

export function toggleActionMini() {
  const wrap = document.getElementById('shop-toggle-wrap');
  if (!wrap) return;
  wrap.classList.toggle('sell-mode');
  state.currentAction = wrap.classList.contains('sell-mode') ? 'sell' : 'buy';
  tg.HapticFeedback.selectionChanged();
  requestAnimationFrame(() => requestAnimationFrame(_updateThumb));
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
    const dp = document.getElementById('detail-price');
    if (dp) dp.innerHTML = 'Цена: —';
    if (totalCostEl) totalCostEl.style.display = 'none';
    return;
  }
  const price = state.currentAction === 'buy' ? state.currentShopItem.price : state.currentShopItem.sell_price;
  const total = price * state.currentShopQuantity;
  const dp = document.getElementById('detail-price');
  if (dp) dp.innerHTML = `${price} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""> / шт.`;
  if (totalCostEl) {
    totalCostEl.innerHTML =
      `${price} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""> × ${state.currentShopQuantity} = <b>${total.toLocaleString()}</b> <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt="">`;
    totalCostEl.style.display = 'flex';
  }
}

// ── Qty stepper callbacks ─────────────────────────────────────────────────────

export function shopQtyStep(delta) {
  let qty = state.currentShopQuantity + delta;
  if (qty < 1)      qty = 1;
  if (qty > 999999) qty = 999999;
  state.currentShopQuantity = qty;
  const qi = document.getElementById('qty-input');
  if (qi) qi.value = qty;
  tg.HapticFeedback.selectionChanged();
  updatePriceDisplay();
}

export function onQtyInput(value) {
  let qty = parseInt(value) || 1;
  if (qty < 1)      qty = 1;
  if (qty > 999999) qty = 999999;
  state.currentShopQuantity = qty;
  updatePriceDisplay();
}

// ── Транзакция ────────────────────────────────────────────────────────────────

export async function performTransaction() {
  if (!state.currentShopItem) {
    tg.HapticFeedback.notificationOccurred('error');
    showToast('Выберите предмет');
    return;
  }
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