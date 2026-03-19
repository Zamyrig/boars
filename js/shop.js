// ============================================================
// shop.js — магазин (зелья сохраняются в БД)
// ============================================================
import { state } from './state.js';
import { apiFetch, loadPrices } from './api.js';
import { showToast, updateUI } from './ui.js';
import { renderInventoryPotions } from './inventory.js';

const tg = window.Telegram.WebApp;

const SHOP_ITEMS = [
  { id: 'acorn',       name: 'Желудь',        icon: 'assets/acorn.png',           emoji: '🌰', category: 'resource' },
  { id: 'plant_acorn', name: 'Росток',         icon: 'assets/acorn_planter_1.png', emoji: '🌱', category: 'resource' },
  { id: 'potion_hp',   name: 'Зелье лечения', icon: null,                         emoji: '❤️', category: 'potion' },
  { id: 'potion_sta',  name: 'Зелье стамины', icon: null,                         emoji: '⚡', category: 'potion' },
];

export function _updateThumb() {
  const wrap   = document.getElementById('shop-toggle-wrap');
  const thumb  = document.getElementById('shop-toggle-thumb');
  const buyLbl = document.getElementById('shop-buy-label');
  const selLbl = document.getElementById('shop-sell-label');
  if (!wrap || !thumb || !buyLbl || !selLbl) return;
  const isSell = state.currentAction === 'sell';
  const target = isSell ? selLbl : buyLbl;
  const wrapRect   = wrap.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  thumb.style.width     = targetRect.width + 'px';
  thumb.style.transform = `translateX(${targetRect.left - wrapRect.left - 3}px)`;
}

function _initToggleDOM() {
  const header = document.querySelector('#scr-shop .shop-header');
  if (!header) return;
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
  requestAnimationFrame(() => requestAnimationFrame(_updateThumb));
}

function _initStepperDOM() {
  const row = document.querySelector('#scr-shop .shop-qty-row');
  if (!row) return;
  row.innerHTML = '';
  const stepper = document.createElement('div');
  stepper.className = 'qty-stepper';
  stepper.innerHTML = `
    <button class="qty-stepper-btn" id="qty-btn-minus" onclick="shopQtyStep(-1)">−</button>
    <input  class="qty-stepper-val" id="qty-input" type="number" value="1" min="1" inputmode="numeric" oninput="onQtyInput(this.value)">
    <button class="qty-stepper-btn" id="qty-btn-plus"  onclick="shopQtyStep(1)">+</button>
  `;
  row.appendChild(stepper);
  window.shopQtyStep = shopQtyStep;
}

export function resetShopState() {
  state.currentShopItem     = null;
  state.currentShopQuantity = 1;
  state.currentAction       = 'buy';
  _initToggleDOM();
  _initStepperDOM();
  const qtyInput = document.getElementById('qty-input');
  if (qtyInput) qtyInput.value = '1';
  const iconPh  = document.getElementById('detail-icon-placeholder');
  const iconBig = document.getElementById('detail-icon-big');
  if (iconPh)  { iconPh.style.display = 'inline'; iconPh.innerText = '📦'; iconPh.style.fontSize = ''; }
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

export async function loadShopItems() {
  await loadPrices();
  const container = document.getElementById('shop-items-container');
  container.innerHTML = '';

  for (const def of SHOP_ITEMS) {
    const price      = state.prices[def.id]?.buy  || 0;
    const sell_price = state.prices[def.id]?.sell || 0;
    if (!price) continue;

    const item = { ...def, price, sell_price };
    const div  = document.createElement('div');
    div.className = 'shop-item';
    div.onclick   = () => selectShopItem(item, div);
    const displayPrice = state.currentAction === 'buy' ? price : sell_price;

    let iconHtml;
    if (def.icon) {
      iconHtml = `<img class="shop-item-img" src="${BASE}/${def.icon}" alt="${def.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="shop-item-emoji" style="display:none">${def.emoji}</span>`;
    } else {
      iconHtml = `<span class="shop-item-emoji">${def.emoji}</span>`;
    }
    div.innerHTML = `${iconHtml}<div class="shop-item-name">${def.name}</div><div class="shop-item-price">${displayPrice} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""></div>`;
    container.appendChild(div);
  }
  requestAnimationFrame(() => requestAnimationFrame(_updateThumb));
}

function selectShopItem(item, el) {
  state.currentShopItem     = item;
  state.currentShopQuantity = 1;
  const qi = document.getElementById('qty-input');
  if (qi) qi.value = 1;
  const iconPh  = document.getElementById('detail-icon-placeholder');
  const bigIcon = document.getElementById('detail-icon-big');
  if (item.icon) {
    if (iconPh)  iconPh.style.display = 'none';
    if (bigIcon) {
      bigIcon.src = `${BASE}/${item.icon}`;
      bigIcon.style.display = 'block';
      bigIcon.onerror = () => {
        bigIcon.style.display = 'none';
        if (iconPh) { iconPh.style.display = 'inline'; iconPh.innerText = item.emoji; }
      };
    }
  } else {
    if (bigIcon) bigIcon.style.display = 'none';
    if (iconPh)  { iconPh.style.display = 'inline'; iconPh.innerText = item.emoji; iconPh.style.fontSize = '2.5rem'; }
  }
  document.getElementById('detail-name').innerText = item.name;
  updatePriceDisplay();
  document.querySelectorAll('#shop-items-container .shop-item').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  tg.HapticFeedback.selectionChanged();
}

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
    totalCostEl.innerHTML = `${price} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""> × ${state.currentShopQuantity} = <b>${total.toLocaleString()}</b> <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt="">`;
    totalCostEl.style.display = 'flex';
  }
}

export function shopQtyStep(delta) {
  let qty = state.currentShopQuantity + delta;
  if (qty < 1)      qty = 1;
  if (qty > 99)     qty = 99;
  state.currentShopQuantity = qty;
  const qi = document.getElementById('qty-input');
  if (qi) qi.value = qty;
  tg.HapticFeedback.selectionChanged();
  updatePriceDisplay();
}

export function onQtyInput(value) {
  let qty = parseInt(value) || 1;
  if (qty < 1)  qty = 1;
  if (qty > 99) qty = 99;
  state.currentShopQuantity = qty;
  updatePriceDisplay();
}

// ── Сохранить зелья в БД ─────────────────────────────────────

async function savePotionsToDB() {
  if (!state.user?.tg_id) return;
  await apiFetch('/api/user/update-potions', {
    method: 'POST',
    body: JSON.stringify({
      tg_id:      state.user.tg_id,
      potion_hp:  state.user.potion_hp  || 0,
      potion_sta: state.user.potion_sta || 0,
    }),
  });
}

// ── Транзакция ────────────────────────────────────────────────

export async function performTransaction() {
  if (!state.currentShopItem) {
    tg.HapticFeedback.notificationOccurred('error');
    showToast('Выберите предмет');
    return;
  }

  const item     = state.currentShopItem;
  const qty      = state.currentShopQuantity;
  const isPotion = item.category === 'potion';
  const isBuy    = state.currentAction === 'buy';

  if (isPotion) {
    const potKey = item.id === 'potion_hp' ? 'potion_hp' : 'potion_sta';

    if (isBuy) {
      const total = item.price * qty;
      if (state.user.balance < total) {
        tg.HapticFeedback.notificationOccurred('error');
        showToast('Недостаточно монет');
        return;
      }
      state.user.balance -= total;
      state.user[potKey] = (state.user[potKey] || 0) + qty;
    } else {
      const have = state.user[potKey] || 0;
      if (have < qty) {
        tg.HapticFeedback.notificationOccurred('error');
        showToast('Недостаточно зелий');
        return;
      }
      state.user[potKey] -= qty;
      state.user.balance += item.sell_price * qty;
    }

    document.getElementById('bal-val').innerText = state.user.balance.toLocaleString();
    renderInventoryPotions();
    tg.HapticFeedback.notificationOccurred('success');
    showToast(`${isBuy ? 'Куплено' : 'Продано'} ${qty}x ${item.name}`);

    // Сохраняем в БД
    await savePotionsToDB();
    return;
  }

  // Обычные предметы — через сервер
  const endpoint = isBuy ? '/api/shop/buy' : '/api/shop/sell';
  const response = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, item_id: item.id, quantity: qty }),
  });
  if (response?.success) {
    state.user.balance      = response.new_balance;
    state.user.acorns       = response.new_acorns;
    state.user.plant_acorns = response.new_plant_acorns;
    updateUI();
    tg.HapticFeedback.notificationOccurred('success');
    showToast(`${isBuy ? 'Куплено' : 'Продано'} ${qty}x ${item.name}`);
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(response?.error || 'Ошибка операции');
  }
}