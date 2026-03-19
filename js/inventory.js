// ============================================================
// inventory.js — инвентарь (только сумка)
// ============================================================
import { state, ITEM_DEFS_LOCAL, TOTAL_SLOTS } from './state.js';

const tg = window.Telegram.WebApp;

let _detailItemId = null;

function fmtSlotCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'М';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'к';
  return String(n);
}
function fmtExact(n) { return n.toLocaleString('ru-RU'); }

// ── Рендер инвентаря ──────────────────────────────────────────

export function renderInventory() {
  const grid = document.getElementById('inv-items-grid');
  if (!grid || !state.user) return;
  grid.innerHTML = '';

  const items = [];
  if (state.user.acorns       > 0) items.push({ id: 'acorn',       count: state.user.acorns });
  if (state.user.plant_acorns > 0) items.push({ id: 'plant_acorn', count: state.user.plant_acorns });

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (i < items.length) {
      const item = items[i];
      const def  = ITEM_DEFS_LOCAL[item.id];
      slot.classList.add('filled');
      const img = document.createElement('img');
      img.src = `${BASE}/${def.icon}`;
      img.alt = item.id;
      img.onerror = () => {
        img.style.display = 'none';
        const em = document.createElement('span');
        em.className = 'inv-slot-emoji';
        em.innerText = def.emoji;
        slot.appendChild(em);
      };
      slot.appendChild(img);
      if (item.count >= 1) {
        const cnt = document.createElement('span');
        cnt.className = `inv-slot-count${item.count >= 100 ? ' small' : ''}`;
        cnt.innerText = fmtSlotCount(item.count);
        slot.appendChild(cnt);
      }
      slot.onclick = () => openItemDetail(item.id, item.count);
      slot.title   = (state.itemDefs[item.id] || {}).name || item.id;
    }
    grid.appendChild(slot);
  }

  renderInventoryPotions();
}

// ── Слоты зелий ───────────────────────────────────────────────

export function renderInventoryPotions() {
  if (!state.user) return;
  const grid = document.querySelector('.inv-potions-grid');
  if (!grid) return;

  grid.innerHTML = '';
  _makePotionSlot(grid, '❤️', state.user.potion_hp  || 0, 'potion_hp',  'Зелье лечения');
  _makePotionSlot(grid, '⚡', state.user.potion_sta || 0, 'potion_sta', 'Зелье стамины');
  for (let i = 2; i < 4; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-potion-slot';
    slot.innerHTML = '<span style="font-size:0.85rem;opacity:0.2">🧪</span>';
    grid.appendChild(slot);
  }
}

function _makePotionSlot(grid, emoji, count, id, name) {
  const slot = document.createElement('div');
  slot.className = 'inv-potion-slot' + (count > 0 ? ' filled' : '');
  slot.style.position = 'relative';
  slot.style.cursor   = count > 0 ? 'pointer' : 'default';
  if (count > 0) {
    slot.innerHTML = `
      <span style="font-size:1.1rem;line-height:1;">${emoji}</span>
      <span style="position:absolute;bottom:2px;right:4px;font-size:0.52rem;font-weight:900;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.8);">${count}</span>
    `;
    slot.title   = `${name} ×${count}`;
    slot.onclick = () => _openPotionDetail(id, count, emoji, name);
  } else {
    slot.innerHTML = `<span style="font-size:0.85rem;opacity:0.2">${emoji}</span>`;
  }
  grid.appendChild(slot);
}

function _openPotionDetail(id, count, emoji, name) {
  const modal  = document.getElementById('item-detail-modal');
  if (!modal) return;
  const imgEl  = document.getElementById('item-detail-img');
  imgEl.style.display = 'none';
  const wrap   = imgEl.parentElement;
  let emojiEl  = wrap.querySelector('.item-detail-img-emoji');
  if (!emojiEl) {
    emojiEl = document.createElement('div');
    emojiEl.className = 'item-detail-img-emoji';
    wrap.insertBefore(emojiEl, imgEl);
  }
  emojiEl.innerText     = emoji;
  emojiEl.style.display = 'flex';
  document.getElementById('item-detail-name').innerText  = name;
  document.getElementById('item-detail-count').innerHTML = `${count} шт.`;
  document.getElementById('item-detail-desc').innerText  =
    id === 'potion_hp' ? 'Восстанавливает 50% HP в бою.' : 'Восстанавливает 50% стамины в бою.';
  const sellBtn   = document.getElementById('item-detail-sell-btn');
  sellBtn.style.display = 'block';
  sellBtn.innerText     = 'Продать (400 / шт.)';
  sellBtn.onclick       = async () => {
    const key = id === 'potion_hp' ? 'potion_hp' : 'potion_sta';
    if ((state.user[key] || 0) <= 0) { closeItemDetail(); return; }
    state.user[key]    = (state.user[key] || 0) - 1;
    state.user.balance += 400;
    document.getElementById('bal-val').innerText = state.user.balance.toLocaleString();
    closeItemDetail();
    renderInventoryPotions();
    const { apiFetch } = await import('./api.js');
    apiFetch('/api/user/update-potions', {
      method: 'POST',
      body: JSON.stringify({ tg_id: state.user.tg_id, potion_hp: state.user.potion_hp || 0, potion_sta: state.user.potion_sta || 0 }),
    });
  };
  modal.style.display = 'flex';
  tg.HapticFeedback.impactOccurred('light');
}

// ── Модалка предмета ──────────────────────────────────────────

export function openItemDetail(itemId, count) {
  _detailItemId = itemId;
  const def      = state.itemDefs[itemId] || ITEM_DEFS_LOCAL[itemId] || {};
  const localDef = ITEM_DEFS_LOCAL[itemId] || {};
  const imgEl    = document.getElementById('item-detail-img');
  const wrap     = imgEl.parentElement;
  const oldEmoji = wrap.querySelector('.item-detail-img-emoji');
  if (oldEmoji) oldEmoji.style.display = 'none';
  const iconSrc  = def.icon || localDef.icon;
  if (iconSrc) {
    imgEl.src           = `${BASE}/${iconSrc}`;
    imgEl.style.display = 'block';
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      let emojiEl = wrap.querySelector('.item-detail-img-emoji');
      if (!emojiEl) { emojiEl = document.createElement('div'); emojiEl.className = 'item-detail-img-emoji'; wrap.insertBefore(emojiEl, imgEl); }
      emojiEl.innerText = def.emoji || localDef.emoji || '❓';
      emojiEl.style.display = 'flex';
    };
  }
  document.getElementById('item-detail-name').innerText  = def.name || itemId;
  document.getElementById('item-detail-count').innerHTML =
    `${fmtExact(count)} шт.`;
  document.getElementById('item-detail-desc').innerText  = def.description || '';
  const sellBtn   = document.getElementById('item-detail-sell-btn');
  const sellPrice = state.prices[itemId]?.sell;
  if (sellPrice) {
    sellBtn.style.display = 'block';
    sellBtn.innerText     = `Продать (${sellPrice} / шт.)`;
    sellBtn.onclick       = quickSellFromDetail;
  } else {
    sellBtn.style.display = 'none';
  }
  document.getElementById('item-detail-modal').style.display = 'flex';
  tg.HapticFeedback.impactOccurred('light');
}

export function closeItemDetail() {
  document.getElementById('item-detail-modal').style.display = 'none';
  _detailItemId = null;
}

export async function quickSellFromDetail() {
  if (!_detailItemId) return;
  const savedId = _detailItemId;
  closeItemDetail();
  const { nav } = await import('./ui.js');
  const { updateTradeButton, updateShopItemPrices } = await import('./shop.js');
  state.currentAction = 'sell';
  nav('scr-shop');
  setTimeout(() => {
    const wrap = document.getElementById('shop-toggle-wrap');
    if (wrap) wrap.classList.add('sell-mode');
    updateTradeButton();
    updateShopItemPrices();
    import('./shop.js').then(m => { if (typeof m._updateThumb === 'function') m._updateThumb(); }).catch(() => {});
    const itemList = [{id:'acorn'},{id:'plant_acorn'}];
    document.querySelectorAll('#shop-items-container .shop-item').forEach((el, i) => {
      if (itemList[i]?.id === savedId) el.click();
    });
  }, 120);
}

// switchInvTab оставляем для совместимости но ничего не делает
export function switchInvTab(el, tab) {}