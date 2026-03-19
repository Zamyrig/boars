// ============================================================
// forest.js — поход в лес
// ============================================================
import { state, RAID_MAX_HOURS, RAID_REST_HOURS } from './state.js';
import { apiFetch } from './api.js';
import { showToast } from './ui.js';
import { formatFarmTime } from './farm.js';

const tg = window.Telegram.WebApp;

export async function loadForestState() {
  if (!state.user) return;
  const data = await apiFetch(`/api/forest/state?tg_id=${state.user.tg_id}`);
  if (!data) return;

  if (data.just_returned) {
    const acorns = data.acorns_found || 0;
    tg.HapticFeedback.notificationOccurred('success');
    showToast(acorns > 0
      ? `Кабан вернулся пока тебя не было! Нашёл 🌰 ${acorns} желудей за ${RAID_MAX_HOURS} ч.`
      : 'Кабан вернулся пока тебя не было, но ничего не нашёл 😔'
    );
    state.user.acorns = (state.user.acorns || 0) + acorns;
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
  }

  state.forestState = data;
  const forestContent = document.getElementById('inv-content-forest');
  if (forestContent && forestContent.style.display !== 'none') {
    renderForestUI();
    startForestTimer();
  }
}

export function renderForestUI() {
  const area = document.getElementById('forest-state-area');
  if (!area || !state.forestState) return;
  const s = state.forestState;

  if (s.state === 'idle') {
    area.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:20px 10px;">
        <div style="font-size:3.5rem;">🐗</div>
        <div style="font-weight:800;font-size:1rem;">Кабан дома</div>
        <div style="font-size:0.75rem;opacity:0.5;line-height:1.6;">Отправь кабана в поход — он найдёт желуди.<br>Максимум ${RAID_MAX_HOURS} часов, потом вернётся сам.</div>
      </div>
      <button class="btn-wood btn-play" style="width:100%;font-size:0.9rem;" onclick="startRaid()">🌲 Отправить в поход</button>`;

  } else if (s.state === 'raiding') {
    area.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:16px 10px;">
        <div style="font-size:3rem;">🐗💨</div>
        <div style="font-weight:800;font-size:1rem;">Кабан в походе</div>
        <div style="font-size:0.75rem;opacity:0.5;">В лесу уже <span id="forest-hours-away">${s.hours_away}</span> ч.</div>
        <div style="font-size:0.72rem;opacity:0.4;margin-top:4px;">Авто-возврат через:</div>
        <div style="font-size:1.8rem;font-weight:900;color:var(--gold);" id="forest-timer">${formatFarmTime(s.seconds_left)}</div>
        <div style="font-size:0.7rem;opacity:0.35;margin-top:4px;">~1 желудь/час в среднем</div>
      </div>
      <button class="btn-wood" style="width:100%;font-size:0.85rem;opacity:0.85;" onclick="returnRaid()">🏡 Вернуть на поляну</button>`;

  } else if (s.state === 'raid_done') {
    area.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:16px 10px;">
        <div style="font-size:3rem;">🐗✨</div>
        <div style="font-weight:800;font-size:1rem;">Кабан вернулся!</div>
        <div style="font-size:0.8rem;opacity:0.6;">Нашёл <b>${s.acorns_found}</b> 🌰 желудей</div>
      </div>
      <button class="btn-wood btn-play" style="width:100%;font-size:0.9rem;" onclick="collectRaid()">🌰 Забрать находки</button>`;

  } else if (s.state === 'resting') {
    area.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:16px 10px;">
        <div style="font-size:3rem;">😴</div>
        <div style="font-weight:800;font-size:1rem;">Кабан отдыхает</div>
        <div style="font-size:0.75rem;opacity:0.5;">После похода нужно восстановиться</div>
        <div style="font-size:1.8rem;font-weight:900;color:var(--lose);" id="forest-timer">${formatFarmTime(s.rest_seconds_left)}</div>
        ${s.acorns_found ? `<div style="font-size:0.75rem;opacity:0.55;margin-top:4px;">С похода принёс: 🌰 ${s.acorns_found} желудей</div>` : ''}
      </div>
      <button class="btn-wood" style="width:100%;opacity:0.35;cursor:not-allowed;" disabled>😴 Кабан устал</button>`;
  }
}

export function startForestTimer() {
  if (state.forestTimerInterval) clearInterval(state.forestTimerInterval);
  if (!state.forestState || !['raiding','resting'].includes(state.forestState.state)) return;

  state.forestTimerInterval = setInterval(() => {
    const timerEl = document.getElementById('forest-timer');
    if (!timerEl) { clearInterval(state.forestTimerInterval); return; }

    if (state.forestState.state === 'raiding') {
      state.forestState.seconds_left = Math.max(0, (state.forestState.seconds_left || 0) - 1);
      timerEl.textContent = formatFarmTime(state.forestState.seconds_left);
      const hoursEl = document.getElementById('forest-hours-away');
      if (hoursEl) hoursEl.textContent = Math.floor((RAID_MAX_HOURS * 3600 - state.forestState.seconds_left) / 3600);
      if (state.forestState.seconds_left === 0) {
        clearInterval(state.forestTimerInterval);
        loadForestState();
      }
    } else if (state.forestState.state === 'resting') {
      state.forestState.rest_seconds_left = Math.max(0, (state.forestState.rest_seconds_left || 0) - 1);
      timerEl.textContent = formatFarmTime(state.forestState.rest_seconds_left);
      if (state.forestState.rest_seconds_left === 0) {
        clearInterval(state.forestTimerInterval);
        state.forestState = { state: 'idle' };
        renderForestUI();
      }
    }
  }, 1000);
}

export async function startRaid() {
  tg.HapticFeedback.impactOccurred('medium');
  const resp = await apiFetch('/api/forest/raid/start', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id }),
  });
  if (resp?.success) {
    state.forestState = { state: 'raiding', seconds_left: resp.seconds_left, hours_away: 0 };
    renderForestUI();
    startForestTimer();
    tg.HapticFeedback.notificationOccurred('success');
    showToast('Кабан ушёл в поход! 🌲');
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(resp?.error || 'Ошибка');
  }
}

export async function returnRaid() {
  tg.HapticFeedback.impactOccurred('medium');
  const resp = await apiFetch('/api/forest/raid/return', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id }),
  });
  if (resp?.success) {
    state.user.acorns = resp.new_acorns;
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
    state.forestState = { state: 'resting', rest_seconds_left: resp.rest_seconds, acorns_found: resp.acorns_found };
    renderForestUI();
    startForestTimer();
    tg.HapticFeedback.notificationOccurred('success');
    showToast(resp.acorns_found > 0
      ? `Вернулся! Нашёл 🌰 ${resp.acorns_found} за ${resp.hours_away} ч.`
      : 'Вернулся с пустыми руками 😔');
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(resp?.error || 'Ошибка');
  }
}

export async function collectRaid() {
  tg.HapticFeedback.impactOccurred('medium');
  const resp = await apiFetch('/api/forest/raid/return', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id }),
  });
  if (resp?.success) {
    state.user.acorns = resp.new_acorns;
    document.getElementById('acorns-val').innerText = state.user.acorns.toLocaleString();
    state.forestState = { state: 'resting', rest_seconds_left: resp.rest_seconds, acorns_found: resp.acorns_found };
    renderForestUI();
    startForestTimer();
    tg.HapticFeedback.notificationOccurred('success');
    showToast(`Желуди забраны! 🌰 ${resp.acorns_found} Кабан отдыхает 😴`);
  } else {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(resp?.error || 'Ошибка');
  }
}