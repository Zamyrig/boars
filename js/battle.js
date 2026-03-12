// ============================================================
// battle.js — бой, ставки, просмотр
// ============================================================
import { state } from './state.js';
import { apiFetch } from './api.js';
import { nav, showToast, showBetDeduction, showResult, updateWatchButton, startWatchCooldownTick, coinImg } from './ui.js';

const tg = window.Telegram.WebApp;

export function tryStartBattle() {
  nav('scr-bet');
}

export async function watchBattle() {
  if (state.isBattleLocked) return;
  state.isBattleLocked   = true;
  state.isWatchingMode   = true;
  startBattle(0, null);
  const response = await apiFetch('/api/battle/watch', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id }),
  });
  if (response?.success) {
    state.battleResult = { ...response, _isWatch: true };
    state.watchCooldownRemaining = response.watch_cooldown_remaining || 0;
    updateWatchButton();
    clearInterval(state.watchCooldownTimer);
    state.watchCooldownTimer = null;
    if (state.watchCooldownRemaining > 0) startWatchCooldownTick();
  } else {
    state.battleResult = null;
  }
}

export async function preStart(side) {
  if (state.isBattleLocked) return;

  if (state.forestState?.state === 'raiding') {
    tg.HapticFeedback.notificationOccurred('warning');
    showToast('Кабан в походе! Зайди в Лес чтобы отозвать его 🌲');
    return;
  }

  const input = document.getElementById('bet-amt');
  const amt   = parseInt(input.value);
  if (isNaN(amt) || amt < 10)     { tg.HapticFeedback.notificationOccurred('error'); showToast('Минимальная ставка: 10'); return; }
  if (amt > state.user.balance)   { tg.HapticFeedback.notificationOccurred('error'); showToast('Недостаточно золота'); return; }

  state.selectedSide   = side === 0 ? (Math.random() < 0.5 ? 1 : 2) : side;
  state.isWatchingMode = false;
  state.isBattleLocked = true;
  input.disabled       = true;

  document.getElementById('bal-val').innerText = (state.user.balance - amt).toLocaleString();
  showBetDeduction(amt);

  try {
    const response = await apiFetch('/api/battle/init', {
      method: 'POST',
      body: JSON.stringify({ tg_id: state.user.tg_id, bet_amount: amt }),
    });
    if (!response || response.error) throw new Error(response?.error || 'Ошибка инициализации боя');
    state.battleResult = { ...response, _betAmount: amt };
    startBattle(amt, response);
  } catch (error) {
    console.error('Ошибка начала боя:', error);
    tg.HapticFeedback.notificationOccurred('error');
    showToast(error.message || 'Ошибка начала боя');
    state.isBattleLocked = false;
    input.disabled       = false;
    document.getElementById('bal-val').innerText = state.user.balance.toLocaleString();
  }
}

function generateHits(serverResult) {
  let winningSide;
  if (!serverResult || state.isWatchingMode) {
    winningSide = Math.random() < 0.5 ? 1 : 2;
  } else {
    const playerWins = serverResult.is_win === true;
    winningSide = playerWins ? state.selectedSide : (state.selectedSide === 1 ? 2 : 1);
  }

  let hits = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    hits = [];
    let hp1 = 100, hp2 = 100, target = 1;
    while (hp1 > 0 && hp2 > 0) {
      const dmg = Math.floor(Math.random() * 16) + 5;
      if (target === 1) {
        hp1 = Math.max(0, hp1 - dmg);
        hits.push({ target: 1, dmg, isFinal: hp1 <= 0 });
        if (hp1 <= 0) break;
        target = 2;
      } else {
        hp2 = Math.max(0, hp2 - dmg);
        hits.push({ target: 2, dmg, isFinal: hp2 <= 0 });
        if (hp2 <= 0) break;
        target = 1;
      }
    }
    if ((hp1 > 0 ? 1 : 2) === winningSide) break;
  }
  return hits;
}

function spawnDmg(container, val) {
  const p = document.createElement('div');
  p.className  = 'dmg-popup';
  p.innerText  = `-${val}`;
  p.style.left = (Math.random() * 40 + 30) + '%';
  container.appendChild(p);
  setTimeout(() => p.remove(), 700);
}

function startBattle(bet, serverResult) {
  nav('scr-fight');
  let h1 = 100, h2 = 100;
  const log = document.getElementById('fight-log');
  log.innerText = 'ПОДГОТОВКА К БОЮ...';
  ['hp1-f','hp2-f'].forEach(id => document.getElementById(id).style.width = '100%');
  document.getElementById('hp1-txt').innerText = '100';
  document.getElementById('hp2-txt').innerText = '100';

  const hits       = generateHits(serverResult);
  const playerWins = serverResult?.is_win === true;
  let hitIndex = 0, battleEnded = false;

  setTimeout(() => { if (!battleEnded) log.innerText = 'ИДЕТ БОЙ...'; }, 500);

  const interval = setInterval(() => {
    if (hitIndex >= hits.length || battleEnded) { clearInterval(interval); return; }
    const hit  = hits[hitIndex];
    const cont = document.getElementById(`cont-${hit.target}`);
    cont.classList.add('hit');
    spawnDmg(cont, hit.dmg);
    setTimeout(() => cont.classList.remove('hit'), 250);

    if (hit.target === 1) {
      h1 = Math.max(0, h1 - hit.dmg);
      document.getElementById('hp1-f').style.width   = h1 + '%';
      document.getElementById('hp1-txt').innerText   = h1;
    } else {
      h2 = Math.max(0, h2 - hit.dmg);
      document.getElementById('hp2-f').style.width   = h2 + '%';
      document.getElementById('hp2-txt').innerText   = h2;
    }

    tg.HapticFeedback.impactOccurred('medium');

    if (h1 <= 0 || h2 <= 0) {
      battleEnded = true;
      clearInterval(interval);
      log.innerText = `ПОБЕДИЛ КАБАН ${h1 > 0 ? 'ЛЕВЫЙ' : 'ПРАВЫЙ'}`;
      setTimeout(() => {
        tg.HapticFeedback.notificationOccurred(
          (playerWins && !state.isWatchingMode) || state.isWatchingMode ? 'success' : 'error'
        );
        if (state.isWatchingMode) {
          const rewardGiven = state.battleResult?.reward_given;
          const reward      = state.battleResult?.reward || 0;
          showResult('БОЙ ОКОНЧЕН', reward, rewardGiven && reward > 0 ? 'watch_reward' : 'watch_no_reward');
        } else {
          showResult(playerWins ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', bet, playerWins ? 'win' : 'lose');
        }
        state.isBattleLocked = false;
        document.getElementById('bet-amt').disabled = false;
      }, 1000);
    }
    hitIndex++;
  }, 700);
}
