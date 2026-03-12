// ============================================================
// farm.js — ферма
// ============================================================
import { state, FARM_SLOT_CONFIGS } from './state.js';
import { apiFetch } from './api.js';
import { showToast } from './ui.js';

const tg = window.Telegram.WebApp;

export async function loadFarmState() {
  if (!state.user) return;
  const data = await apiFetch(`/api/farm/state?tg_id=${state.user.tg_id}`);
  if (!data?.slots) return;
  state.farmState = data;
  renderFarmSlots();
  startFarmTimers();
}

export function renderFarmSlots() {
  const row = document.getElementById('farm-slots-row');
  if (!row || !state.farmState) return;
  row.innerHTML = '';

  for (const cfg of FARM_SLOT_CONFIGS) {
    const sd  = state.farmState.slots.find(s => s.slot_num === cfg.slot) || {};
    const div = document.createElement('div');
    div.className = 'farm-slot';
    div.dataset.slot = cfg.slot;

    if (!sd.unlocked) {
      div.classList.add('locked');
      div.innerHTML = `
        <span class="farm-slot-icon">🔒</span>
        <span class="farm-slot-label">Слот ${cfg.slot}</span>
        <span class="farm-slot-cost">${cfg.unlock_cost.acorns}🌰<br>${cfg.unlock_cost.coins}🪙${cfg.unlock_cost.plant_acorns ? `<br>${cfg.unlock_cost.plant_acorns}🌱` : ''}</span>`;
      div.onclick = () => openFarmUnlockModal(cfg.slot);

    } else if (!sd.planted_item) {
      div.classList.add('unlocked-empty');
      div.innerHTML = `<span class="farm-slot-icon">🌱</span><span class="farm-slot-label">Пустой<br>слот</span>`;
      div.onclick = () => openFarmPlantModal(cfg.slot);

    } else if (sd.is_ready) {
      div.classList.add('ready');
      div.innerHTML = `<span class="farm-slot-icon">✨</span><span class="farm-slot-label">Готово!</span><span class="farm-slot-timer">Собрать</span>`;
      div.onclick = () => openFarmHarvestModal(cfg.slot, sd);

    } else {
      div.classList.add('planted');
      div.innerHTML = `
        <span class="farm-slot-icon">🌿</span>
        <span class="farm-slot-label">Растёт</span>
        <span class="farm-slot-timer" id="farm-timer-${cfg.slot}">${formatFarmTime(sd.seconds_left || 0)}</span>`;
      div.onclick = () => openFarmGrowingModal(cfg.slot, sd);
    }
    row.appendChild(div);
  }
}

function startFarmTimers() {
  if (state.farmTimerInterval) clearInterval(state.farmTimerInterval);
  state.farmTimerInterval = setInterval(() => {
    if (!state.farmState) return;
    let anyPlanted = false;
    for (const s of state.farmState.slots) {
      if (s.planted_item && !s.is_ready && s.seconds_left > 0) {
        s.seconds_left = Math.max(0, s.seconds_left - 1);
        const el = document.getElementById(`farm-timer-${s.slot_num}`);
        if (el) {
          if (s.seconds_left === 0) { s.is_ready = true; renderFarmSlots(); }
          else el.textContent = formatFarmTime(s.seconds_left);
        }
        anyPlanted = true;
      }
    }
    if (!anyPlanted) { clearInterval(state.farmTimerInterval); state.farmTimerInterval = null; }
  }, 1000);
}

export function formatFarmTime(sec) {
  if (sec <= 0) return 'Готово!';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${String(m).padStart(2,'0')}м`;
  if (m > 0) return `${m}м ${String(s).padStart(2,'0')}с`;
  return `${s}с`;
}

// ── Модалка фермы ─────────────────────────────────────────────

function openFarmModal(icon, title, bodyHtml) {
  document.getElementById('farm-modal-icon').innerText       = icon;
  document.getElementById('farm-modal-title-text').innerText = title;
  document.getElementById('farm-modal-body').innerHTML       = bodyHtml;
  document.getElementById('farm-modal').style.display        = 'flex';
  tg.HapticFeedback.impactOccurred('medium');
}

export function closeFarmModal() {
  document.getElementById('farm-modal').style.display = 'none';
  state.farmConfirmMode = false;
  state.selectedFarmItem = null;
  state.activeFarmSlot   = null;
}

// ── Разблокировка слота ───────────────────────────────────────

function openFarmUnlockModal(slotNum) {
  const cfg  = FARM_SLOT_CONFIGS.find(c => c.slot === slotNum);
  const cost = cfg.unlock_cost;
  const ok   = state.user.acorns >= cost.acorns &&
               state.user.balance >= cost.coins  &&
               state.user.plant_acorns >= cost.plant_acorns;
  openFarmModal('🔒', `Слот ${slotNum}`, `
    <p style="font-size:0.8rem;opacity:0.55;margin:0 0 12px;">Разблокируй слот ${slotNum}</p>
    <div class="farm-unlock-cost">
      <div class="farm-unlock-cost-row">🌰 Желуди <span>${state.user.acorns} / ${cost.acorns}</span></div>
      <div class="farm-unlock-cost-row">🪙 Монеты <span>${state.user.balance.toLocaleString()} / ${cost.coins.toLocaleString()}</span></div>
      ${cost.plant_acorns ? `<div class="farm-unlock-cost-row">🌱 Ростки <span>${state.user.plant_acorns} / ${cost.plant_acorns}</span></div>` : ''}
    </div>
    <div class="farm-confirm-row">
      <button class="btn-wood" style="opacity:0.5;" onclick="closeFarmModal()">Отмена</button>
      <button class="btn-wood btn-play" ${ok ? '' : 'disabled'} onclick="doFarmUnlock(${slotNum})">
        ${ok ? 'Разблокировать' : 'Не хватает'}
      </button>
    </div>`);
}

export async function doFarmUnlock(slotNum) {
  const resp = await apiFetch('/api/farm/unlock', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, slot_num: slotNum }),
  });
  if (resp?.success) {
    state.user.acorns       = resp.new_acorns;
    state.user.plant_acorns = resp.new_plant_acorns;
    state.user.balance      = resp.new_balance;
    document.getElementById('bal-val').innerText    = state.user.balance.toLocaleString();
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
    tg.HapticFeedback.notificationOccurred('success');
    showToast(`Слот ${slotNum} разблокирован!`);
    closeFarmModal();
    await loadFarmState();
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(resp?.error || 'Ошибка');
  }
}

// ── Посадка ───────────────────────────────────────────────────

function _farmItemIconHtml(itemId) {
  const def = state.itemDefs[itemId] || {};
  const loc = { acorn: 'assets/acorn.png', plant_acorn: 'assets/acorn_planter_1.png' };
  const emoji = { acorn: '🌰', plant_acorn: '🌱' };
  const src = def.icon || loc[itemId];
  if (src) return `<img src="${src}" onerror="this.style.display='none';this.nextSibling.style.display='block'" style="width:2rem;height:2rem;object-fit:contain;image-rendering:pixelated;display:block;margin:0 auto 4px;"><span style="display:none;font-size:1.8rem;">${def.emoji || emoji[itemId] || '🌱'}</span>`;
  return `<span class="farm-pick-icon">${def.emoji || emoji[itemId] || '🌱'}</span>`;
}

export async function openFarmPlantModal(slotNum) {
  state.activeFarmSlot   = slotNum;
  state.farmConfirmMode  = false;
  state.selectedFarmItem = null;
  if (!state.farmDropTable) {
    state.farmDropTable = await apiFetch('/api/farm/drops?item_id=plant_acorn');
  }
  _renderFarmPlantModal();
}

function _renderFarmPlantModal() {
  const dt       = state.farmDropTable;
  const hasPlant = state.user.plant_acorns > 0;
  const def      = state.itemDefs['plant_acorn'] || {};

  let dropRows = '';
  if (dt?.drops) {
    for (const d of dt.drops) {
      dropRows += `<div class="farm-drop-row"><span class="farm-drop-reward">🌰 ${d.acorns} + 🪙 ${d.coins_min}-${d.coins_max}</span><span class="farm-drop-chance">${d.chance}%</span></div>`;
    }
    if (dt.plant_acorn_chance) {
      dropRows += `<div class="farm-drop-row"><span class="farm-drop-reward">🌱 +1 Росток (бонус)</span><span class="farm-drop-chance">${dt.plant_acorn_chance}%</span></div>`;
    }
  }

  const body = `
    <p style="font-size:0.75rem;opacity:0.5;margin:0 0 10px;">Выбери что посадить:</p>
    <div class="farm-item-picker">
      <div class="farm-pick-item ${state.selectedFarmItem === 'plant_acorn' ? 'selected' : ''}" onclick="selectFarmItem('plant_acorn')">
        <div class="farm-pick-icon">${_farmItemIconHtml('plant_acorn')}</div>
        <div class="farm-pick-name">${def.name || 'Росток'}</div>
        <div class="farm-pick-count">${state.user.plant_acorns} шт.</div>
      </div>
    </div>
    ${dt ? `<div class="farm-grow-time">⏱ Время роста: ${dt.grow_time_hours} ч.</div>` : ''}
    ${state.selectedFarmItem ? `<div class="farm-drop-info">${dropRows}</div>` : ''}
    <div class="farm-confirm-row">
      <button class="btn-wood" style="opacity:0.5;" onclick="closeFarmModal()">Отмена</button>
      <button class="btn-wood" style="background:var(--win);color:#000;border:none;box-shadow:0 4px 0 #2d9a4a;"
        ${state.selectedFarmItem && hasPlant ? '' : 'disabled'}
        onclick="doFarmPlantConfirm()">Посадить</button>
    </div>`;

  document.getElementById('farm-modal-icon').innerText       = '🌱';
  document.getElementById('farm-modal-title-text').innerText = `Слот ${state.activeFarmSlot}`;
  document.getElementById('farm-modal-body').innerHTML       = body;
  document.getElementById('farm-modal').style.display        = 'flex';
}

export function selectFarmItem(itemId) {
  state.selectedFarmItem = itemId;
  tg.HapticFeedback.selectionChanged();
  _renderFarmPlantModal();
}

export function doFarmPlantConfirm() {
  if (!state.selectedFarmItem) return;
  if (!state.farmConfirmMode) {
    state.farmConfirmMode = true;
    const btn = document.querySelector('#farm-modal-body .farm-confirm-row .btn-wood:last-child');
    if (btn) { btn.textContent = '✓ Подтвердить'; btn.style.background = '#e6b800'; btn.onclick = doFarmPlant; }
    tg.HapticFeedback.impactOccurred('light');
    return;
  }
  doFarmPlant();
}

async function doFarmPlant() {
  const resp = await apiFetch('/api/farm/plant', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, slot_num: state.activeFarmSlot, item_id: state.selectedFarmItem }),
  });
  if (resp?.success) {
    state.user.plant_acorns = resp.new_plant_acorns;
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
    tg.HapticFeedback.notificationOccurred('success');
    showToast('Росток посажен! Ждёт 1 час 🌱');
    closeFarmModal();
    await loadFarmState();
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(resp?.error || 'Ошибка');
  }
}

// ── Растёт / сбор ─────────────────────────────────────────────

export function openFarmGrowingModal(slotNum, slotData) {
  openFarmModal('🌿', `Слот ${slotNum}`, `
    <div style="text-align:center;padding:10px 0;">
      <div style="font-size:3rem;margin-bottom:10px;">🌿</div>
      <div style="font-weight:800;font-size:1rem;margin-bottom:6px;">Росток растёт</div>
      <div style="font-size:0.8rem;opacity:0.5;margin-bottom:16px;">До сбора урожая:</div>
      <div style="font-size:1.8rem;font-weight:900;color:var(--win);margin-bottom:20px;" id="farm-modal-countdown">${formatFarmTime(slotData.seconds_left)}</div>
    </div>
    <div class="farm-confirm-row">
      <button class="btn-wood" style="width:100%;opacity:0.5;" onclick="closeFarmModal()">Закрыть</button>
    </div>`);

  const t = setInterval(() => {
    const el = document.getElementById('farm-modal-countdown');
    if (!el || document.getElementById('farm-modal').style.display === 'none') { clearInterval(t); return; }
    slotData.seconds_left = Math.max(0, slotData.seconds_left - 1);
    el.textContent = formatFarmTime(slotData.seconds_left);
    if (slotData.seconds_left === 0) { clearInterval(t); slotData.is_ready = true; openFarmHarvestModal(slotNum, slotData); }
  }, 1000);
}

export function openFarmHarvestModal(slotNum) {
  openFarmModal('✨', `Слот ${slotNum}`, `
    <div style="text-align:center;padding:8px 0 16px;">
      <div style="font-size:3rem;margin-bottom:8px;">✨</div>
      <div style="font-size:1rem;font-weight:800;margin-bottom:4px;">Урожай готов!</div>
      <div style="font-size:0.75rem;opacity:0.5;">Собери что выросло</div>
    </div>
    <div class="farm-confirm-row">
      <button class="btn-wood" style="opacity:0.5;" onclick="closeFarmModal()">Позже</button>
      <button class="btn-wood btn-play" onclick="doFarmHarvest(${slotNum})">🌾 Собрать</button>
    </div>`);
}

export async function doFarmHarvest(slotNum) {
  const resp = await apiFetch('/api/farm/harvest', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, slot_num: slotNum }),
  });
  if (resp?.success) {
    state.user.balance      = resp.new_balance;
    state.user.acorns       = resp.new_acorns;
    state.user.plant_acorns = resp.new_plant_acorns;
    state.user.max_balance  = resp.new_max_balance;
    document.getElementById('bal-val').innerText    = state.user.balance.toLocaleString();
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
    closeFarmModal();
    const d = resp.drops;
    showToast(`Урожай: 🌰${d.acorns} + 🪙${d.coins}${d.plant_acorn ? ' + 🌱1' : ''}`);
    tg.HapticFeedback.notificationOccurred('success');
    await loadFarmState();
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(resp?.error || 'Ошибка');
  }
}
