// ============================================================
// inventory.js — инвентарь, вкладки, модалка предмета
// ============================================================
import { state, ITEM_DEFS_LOCAL, TOTAL_SLOTS, INV_TAB_TITLES, INV_TAB_BG } from './state.js';
import { loadFarmState } from './farm.js';
import { loadForestState } from './forest.js';

const tg = window.Telegram.WebApp;

let _detailItemId = null;

// ── Форматирование ────────────────────────────────────────────

function fmtSlotCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'М';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'к';
  return String(n);
}

function fmtExact(n) {
  return n.toLocaleString('ru-RU');
}

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
}

// ── Модалка предмета ──────────────────────────────────────────

export function openItemDetail(itemId, count) {
  _detailItemId = itemId;
  const def      = state.itemDefs[itemId] || ITEM_DEFS_LOCAL[itemId] || {};
  const localDef = ITEM_DEFS_LOCAL[itemId] || {};

  const imgEl   = document.getElementById('item-detail-img');
  const iconSrc = def.icon || localDef.icon;
  if (iconSrc) {
    imgEl.src          = `${BASE}/${iconSrc}`;
    imgEl.style.display = 'block';
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      const wrap = imgEl.parentElement;
      let emojiEl = wrap.querySelector('.item-detail-img-emoji');
      if (!emojiEl) {
        emojiEl = document.createElement('div');
        emojiEl.className = 'item-detail-img-emoji';
        wrap.insertBefore(emojiEl, imgEl);
      }
      emojiEl.innerText    = def.emoji || localDef.emoji || '❓';
      emojiEl.style.display = 'flex';
    };
  }

  document.getElementById('item-detail-name').innerText   = def.name || itemId;
  document.getElementById('item-detail-count').innerHTML  =
    `${fmtExact(count)} шт. <span style="opacity:0.4;font-size:0.75rem;font-weight:600;">(точно)</span>`;
  document.getElementById('item-detail-desc').innerText   = def.description || '';

  const sellBtn   = document.getElementById('item-detail-sell-btn');
  const sellPrice = state.prices[itemId]?.sell;
  if (sellPrice) {
    sellBtn.style.display = 'block';
    sellBtn.innerText     = `Продать (${sellPrice} / шт.)`;
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

  // Ленивый импорт чтобы избежать циклической зависимости shop ↔ inventory
  const { nav } = await import('./ui.js');
  const { resetShopState, loadShopItems, updateTradeButton, updateShopItemPrices } = await import('./shop.js');

  state.currentAction = 'sell';
  nav('scr-shop');

  setTimeout(() => {
    document.getElementById('shop-toggle-mini').classList.add('sell-mode');
    document.getElementById('shop-action-label').innerText   = 'ПРОДАТЬ';
    document.getElementById('shop-action-label').style.color = 'var(--lose)';
    updateTradeButton();
    updateShopItemPrices();
    const itemList = [{id: 'acorn'}, {id: 'plant_acorn'}];
    document.querySelectorAll('#shop-items-container .shop-item').forEach((el, i) => {
      if (itemList[i]?.id === savedId) el.click();
    });
  }, 120);
}

// ── Вкладки инвентаря ─────────────────────────────────────────

export function switchInvTab(el, tab) {
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active-tab'));
  el.classList.add('active-tab');
  document.querySelectorAll('.inv-tab-content').forEach(c => c.style.display = 'none');
  const content = document.getElementById('inv-content-' + tab);
  if (content) content.style.display = 'flex';
  document.getElementById('inv-tab-title').innerText = INV_TAB_TITLES[tab] || tab.toUpperCase();

  const invBgs = ['bg-inventory','bg-farm','bg-mine','bg-forest'];
  invBgs.forEach(bg => {
    const bgEl = document.getElementById(bg);
    if (bgEl) bgEl.style.display = 'none';
  });
  const targetEl = document.getElementById(INV_TAB_BG[tab] || 'bg-inventory');
  if (targetEl) targetEl.style.display = 'block';

  tg.HapticFeedback.selectionChanged();
  if (tab === 'farm')   loadFarmState();
  if (tab === 'forest') loadForestState();
}