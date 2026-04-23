// ============================================================
// skins.js — выбор и покупка скинов (отдельный экран scr-skins)
// ============================================================
import { state } from './state.js';
import { apiFetch } from './api.js';
import { nav } from './ui.js';

const tg = window.Telegram.WebApp;

let _allSkins   = [];
let _currentIdx = 0;

// ── Загрузка данных и открытие экрана ────────────────────────

export async function openSkinsScreen() {
  nav('scr-skins');
  const container = document.getElementById('skins-screen-inner');
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:120px;opacity:0.4;font-size:0.85rem;">
      Загрузка...
    </div>`;

  try {
    const data = await apiFetch(`/api/skins?tg_id=${state.user.tg_id}`);
    _allSkins = data.skins || [];
    const activeIdx = _allSkins.findIndex(s => s.id === data.active_skin);
    _currentIdx = activeIdx >= 0 ? activeIdx : 0;
    _render(container);
  } catch (e) {
    console.warn('Skins load failed', e);
    container.innerHTML = `<div style="text-align:center;opacity:0.4;padding:20px;">Ошибка загрузки</div>`;
  }
}

// ── Рендер карусели ──────────────────────────────────────────

function _render(container) {
  if (!_allSkins.length) { container.innerHTML = ''; return; }

  const skin     = _allSkins[_currentIdx];
  const owned    = skin.owned;
  const isActive = skin.id === (state.user?.skin_id || 'boar_sobchak');
  const total    = _allSkins.length;

  const dots = _allSkins.map((_, i) =>
    `<div class="skin-dot${i === _currentIdx ? ' active' : ''}"></div>`
  ).join('');

  const lockOverlay = !owned ? `
    <div class="skin-lock-overlay">
      <span class="skin-lock-icon">🔒</span>
      <div class="skin-lock-price">
        ${skin.price} <img src="assets/boarcoin.png" class="coin-icon" alt="">
      </div>
    </div>` : '';

  const badge = isActive
    ? `<div class="skin-active-badge">✓ ВЫБРАН</div>`
    : '';

  let actionBtn;
  if (isActive) {
    actionBtn = `<button class="btn-wood" style="width:100%;opacity:0.4;pointer-events:none;">✓ ВЫБРАН</button>`;
  } else if (owned) {
    actionBtn = `<button class="btn-wood btn-play" style="width:100%;" onclick="skinSelect('${skin.id}')">ВЫБРАТЬ</button>`;
  } else {
    actionBtn = `<button class="btn-wood" style="width:100%;background:var(--gold);color:#000;border:none;box-shadow:0 4px 0 #cca300;" onclick="skinBuy('${skin.id}')">
      💰 КУПИТЬ ЗА ${skin.price}
    </button>`;
  }

  container.innerHTML = `
    <div class="skin-carousel">
      <button class="skin-nav-btn" onclick="skinNav(-1)" ${_currentIdx === 0 ? 'disabled' : ''}>‹</button>
      <div class="skin-carousel-inner">
        <div class="skin-card ${isActive ? 'active-skin' : ''} ${!owned ? 'locked' : ''}">
          <img
            class="skin-preview"
            src="assets/boars/${skin.id}/boar_waiting/boar_waiting1.png"
            alt="${skin.name}"
            style="opacity:0;transition:opacity 0.15s;"
            onload="this.style.opacity='1'"
            onerror="this.src='assets/boars/boar_sobchak/boar_waiting/boar_waiting1.png';this.style.opacity='1'"
          >
          ${lockOverlay}
          <div class="skin-name">${skin.name}</div>
          ${skin.description ? `<div style="font-size:0.6rem;opacity:0.45;text-align:center;line-height:1.3;">${skin.description}</div>` : ''}
          ${badge}
        </div>
      </div>
      <button class="skin-nav-btn" onclick="skinNav(1)" ${_currentIdx === total - 1 ? 'disabled' : ''}>›</button>
    </div>
    <div class="skin-dots">${dots}</div>
    <div style="margin-top:14px;">${actionBtn}</div>
  `;
}

// ── Глобальные хелперы ───────────────────────────────────────

window.skinNav = function(dir) {
  _currentIdx = Math.max(0, Math.min(_allSkins.length - 1, _currentIdx + dir));
  const container = document.getElementById('skins-screen-inner');
  if (container) _render(container);
  tg.HapticFeedback.selectionChanged();
};

window.skinSelect = async function(skinId) {
  try {
    const resp = await apiFetch('/api/skins/select', {
      method: 'POST',
      body: JSON.stringify({ tg_id: state.user.tg_id, skin_id: skinId }),
    });
    if (resp.error) return;
    state.user.skin_id = skinId;
    tg.HapticFeedback.notificationOccurred('success');
    const container = document.getElementById('skins-screen-inner');
    if (container) _render(container);
  } catch (e) { /* тихо */ }
};

window.skinBuy = async function(skinId) {
  try {
    const resp = await apiFetch('/api/skins/buy', {
      method: 'POST',
      body: JSON.stringify({ tg_id: state.user.tg_id, skin_id: skinId }),
    });
    if (resp.error) return;

    state.user.skin_id = skinId;
    state.user.balance = resp.new_balance;
    document.getElementById('bal-val').innerText = resp.new_balance.toLocaleString();
    tg.HapticFeedback.notificationOccurred('success');

    const data = await apiFetch(`/api/skins?tg_id=${state.user.tg_id}`);
    _allSkins = data.skins || [];
    const container = document.getElementById('skins-screen-inner');
    if (container) _render(container);
  } catch (e) { /* тихо */ }
};

// loadAndRenderSkins оставляем для обратной совместимости (main.js вызывает при открытии профиля)
export async function loadAndRenderSkins() { /* ничего — теперь отдельный экран */ }