// ============================================================
// battle_rpg.js — GRPG боевая система
// ============================================================
import { state } from './state.js';
import { nav, showToast } from './ui.js';

const tg = window.Telegram.WebApp;

// ── Конфиги врагов ───────────────────────────────────────────
// Сюда добавлять новых врагов по мере написания сюжета
export const ENEMY_CONFIGS = {
  // Шахта — враги 1 уровня (-15% от базы игрока)
  mine_grunt: {
    name: 'Шахтёр',
    emoji: '🐷',
    hp: 85, sta: 85,
    baseDmg: 5 * 0.85,
    rewardMin: 8, rewardMax: 15,
    ai: 'grunt',
  },
  // TODO: добавить после получения сюжета:
  // mine_boss, forest_grunt, forest_boss, bear_grunt, bear_boss
};

// ── Константы боевки ─────────────────────────────────────────
const BASE_DMG     = 5;
const ATTACK_STA   = 10;
const BLOCK_STA    = 10;
const WAIT_STA     = 30;
const POTION_STA   = 5;
const BLOCK_REDUCE = 0.80;  // блок снижает 80% урона
const BLOCK_MIN    = 0.10;  // минимум 10% от базового урона всегда проходит

// ── Старт боя ────────────────────────────────────────────────

export function startRpgBattle(enemyKey) {
  const cfg = ENEMY_CONFIGS[enemyKey] || ENEMY_CONFIGS.mine_grunt;

  state.rpg = {
    enemyKey,
    enemyCfg: cfg,
    round: 1,
    locked: false,
    potionOpen: false,
    selectedAction: null,
    player: {
      hp: 100, maxHp: 100,
      sta: 100, maxSta: 100,
      baseDmg: BASE_DMG,
    },
    enemy: {
      hp: cfg.hp, maxHp: cfg.hp,
      sta: cfg.sta, maxSta: cfg.sta,
      baseDmg: cfg.baseDmg,
    },
    // зелья пока хардкод, потом будут браться из реального инвентаря
    potions: {
      hp:  state.user?.potions?.hp  ?? 2,
      sta: state.user?.potions?.sta ?? 2,
    },
  };

  _renderScene();
  nav('scr-rpg-fight');
  tg.HapticFeedback.impactOccurred('medium');
}

// ── Выбор действия ───────────────────────────────────────────

export function rpgSelectAction(action) {
  const r = state.rpg;
  if (!r || r.locked) return;
  if (r.potionOpen && action !== 'potion') _closePotionMenu();
  r.selectedAction = action;
  _highlightBtn(action);
  document.getElementById('rpg-confirm-btn').disabled = false;
  tg.HapticFeedback.selectionChanged();
}

export function rpgTogglePotion() {
  const r = state.rpg;
  if (!r || r.locked) return;
  r.potionOpen = !r.potionOpen;
  document.getElementById('rpg-potion-submenu').classList.toggle('open', r.potionOpen);
  if (!r.potionOpen && r.selectedAction?.startsWith('potion')) {
    r.selectedAction = null;
    document.getElementById('rpg-confirm-btn').disabled = true;
  }
  tg.HapticFeedback.selectionChanged();
}

export function rpgSelectPotion(type) {
  const r = state.rpg;
  if (!r || r.locked) return;
  if (r.potions[type] <= 0) { showToast('Нет зелий!'); return; }
  r.selectedAction = 'potion-' + type;
  _highlightBtn('potion');
  document.getElementById('rpg-btn-potion-hp') .classList.toggle('selected', type === 'hp');
  document.getElementById('rpg-btn-potion-sta').classList.toggle('selected', type === 'sta');
  document.getElementById('rpg-confirm-btn').disabled = false;
  tg.HapticFeedback.selectionChanged();
}

export function rpgConfirm() {
  const r = state.rpg;
  if (!r || !r.selectedAction || r.locked) return;
  r.locked = true;
  document.getElementById('rpg-confirm-btn').disabled = true;
  _setStatus('ОБРАБОТКА...');
  tg.HapticFeedback.impactOccurred('rigid');

  const enemyAction = _enemyAI();
  setTimeout(() => _resolveRound(r.selectedAction, enemyAction), 300);
}

// ── ИИ врага ─────────────────────────────────────────────────

function _enemyAI() {
  const e = state.rpg.enemy;
  if (e.sta <= 10) return 'wait';
  const roll = Math.random();
  if (e.hp < e.maxHp * 0.25 && roll < 0.35) return 'wait';
  if (roll < 0.12) return 'block';
  if (roll < 0.30) return 'wait';
  return 'attack';
}

// ── Расчёт раунда ────────────────────────────────────────────

function _resolveRound(playerAction, enemyAction) {
  const r = state.rpg;
  const p = r.player;
  const e = r.enemy;
  const logParts = [];

  // ── 1. ЗЕЛЬЯ — приоритет, применяются первыми ──
  if (playerAction === 'potion-hp') {
    const heal = Math.round(p.maxHp * 0.5);
    p.hp  = Math.min(p.maxHp, p.hp + heal);
    p.sta = Math.max(0, p.sta - POTION_STA);
    r.potions.hp--;
    _popup('rpg-avatar-player', `+${heal} HP`, 'heal');
    logParts.push(`<span class="rpg-log-green">Ты выпил зелье лечения (+${heal} HP)</span>`);
  } else if (playerAction === 'potion-sta') {
    const restore = Math.round(p.maxSta * 0.5);
    p.sta = Math.min(p.maxSta, p.sta + restore - POTION_STA);
    r.potions.sta--;
    _popup('rpg-avatar-player', `+${restore} СТА`, 'heal');
    logParts.push(`<span class="rpg-log-blue">Ты выпил зелье стамины (+${restore} СТА)</span>`);
  }

  // ── 2. АТАКИ ──
  let playerDmg = 0, enemyDmg = 0;
  let playerBlocked = false, enemyBlocked = false;

  // Игрок атакует
  if (playerAction === 'attack') {
    if (p.sta <= 0) {
      playerDmg = _randInt(1, 2);
    } else {
      const mult = 0.9 + Math.random() * 0.5; // -10%..+40%
      playerDmg = Math.max(1, Math.round(p.baseDmg * mult));
      p.sta = Math.max(0, p.sta - ATTACK_STA);
    }
    if (enemyAction === 'block' && e.sta > 0) {
      enemyBlocked = true;
      const minDmg = Math.max(1, Math.round(p.baseDmg * BLOCK_MIN));
      playerDmg = Math.max(minDmg, Math.round(playerDmg * (1 - BLOCK_REDUCE)));
      e.sta = Math.max(0, e.sta - BLOCK_STA);
    }
    e.hp = Math.max(0, e.hp - playerDmg);
  } else if (playerAction === 'block') {
    p.sta = Math.max(0, p.sta - BLOCK_STA);
  } else if (playerAction === 'wait') {
    p.sta = Math.min(p.maxSta, p.sta + WAIT_STA);
  }

  // Враг атакует
  if (enemyAction === 'attack') {
    if (e.sta <= 0) {
      enemyDmg = _randInt(1, 2);
    } else {
      const mult = 0.9 + Math.random() * 0.5;
      enemyDmg = Math.max(1, Math.round(e.baseDmg * mult));
      e.sta = Math.max(0, e.sta - ATTACK_STA);
    }
    if (playerAction === 'block' && p.sta > 0) {
      playerBlocked = true;
      const minDmg = Math.max(1, Math.round(e.baseDmg * BLOCK_MIN));
      enemyDmg = Math.max(minDmg, Math.round(enemyDmg * (1 - BLOCK_REDUCE)));
      // стамина за блок уже снята выше
    }
    p.hp = Math.max(0, p.hp - enemyDmg);
  } else if (enemyAction === 'wait') {
    e.sta = Math.min(e.maxSta, e.sta + WAIT_STA);
  } else if (enemyAction === 'block' && playerAction !== 'attack') {
    e.sta = Math.max(0, e.sta - BLOCK_STA);
  }

  // ── 3. ЛОГ ──
  const en = r.enemyCfg.name;
  if (playerAction === 'attack') {
    logParts.push(enemyBlocked
      ? `Ты атакуешь — <span class="rpg-log-red">−${playerDmg} HP</span> врагу <span class="rpg-log-blue">(блок!)</span>`
      : `Ты атакуешь — <span class="rpg-log-red">−${playerDmg} HP</span> врагу`);
  } else if (playerAction === 'block') {
    logParts.push(`Ты <span class="rpg-log-blue">блокируешь</span>`);
  } else if (playerAction === 'wait') {
    logParts.push(`Ты <span class="rpg-log-green">ждёшь</span> (+${WAIT_STA} СТА)`);
  }

  if (enemyAction === 'attack') {
    logParts.push(playerBlocked
      ? `${en} атакует — <span class="rpg-log-red">−${enemyDmg} HP</span> тебе <span class="rpg-log-blue">(блок!)</span>`
      : `${en} атакует — <span class="rpg-log-red">−${enemyDmg} HP</span> тебе`);
  } else if (enemyAction === 'block') {
    logParts.push(`${en} <span class="rpg-log-blue">блокирует</span>`);
  } else if (enemyAction === 'wait') {
    logParts.push(`${en} <span class="rpg-log-green">ждёт</span> (+${WAIT_STA} СТА)`);
  }

  _setLog(logParts.join('. ') + '.');

  // ── 4. АНИМАЦИИ ──
  if (playerAction === 'attack' && playerDmg > 0) {
    _hitAnim('rpg-avatar-enemy');
    _popup('rpg-avatar-enemy', `−${playerDmg}`, 'dmg');
  }
  if (enemyAction === 'attack' && enemyDmg > 0) {
    _hitAnim('rpg-avatar-player');
    _popup('rpg-avatar-player', `−${enemyDmg}`, 'dmg');
    tg.HapticFeedback.impactOccurred('medium');
  }
  if (enemyBlocked)  _popup('rpg-avatar-enemy',  'БЛОК', 'block');
  if (playerBlocked) _popup('rpg-avatar-player', 'БЛОК', 'block');

  r.round++;
  _renderBars();
  _renderPotionCounts();

  // ── 5. КОНЕЦ? ──
  setTimeout(() => {
    if (p.hp <= 0) { _endBattle(false); return; }
    if (e.hp <= 0) { _endBattle(true);  return; }
    _nextTurn();
  }, 900);
}

// ── Следующий ход ─────────────────────────────────────────────

function _nextTurn() {
  const r = state.rpg;
  r.selectedAction = null;
  r.locked = false;
  r.potionOpen = false;
  document.getElementById('rpg-potion-submenu').classList.remove('open');
  _highlightBtn('__none__');
  document.getElementById('rpg-confirm-btn').disabled = true;
  document.getElementById('rpg-round-badge').textContent = `РАУНД ${r.round}`;
  _setStatus('ТВОЙ ХОД');
  _updatePotionBtn();
}

// ── Конец боя ─────────────────────────────────────────────────

function _endBattle(playerWon) {
  const r = state.rpg;
  tg.HapticFeedback.notificationOccurred(playerWon ? 'success' : 'error');

  document.getElementById('rpg-res-icon').textContent  = playerWon ? '🏆' : '💀';
  document.getElementById('rpg-res-title').textContent = playerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
  document.getElementById('rpg-res-title').style.color = playerWon ? 'var(--win)' : 'var(--lose)';

  if (playerWon) {
    const reward = _randInt(r.enemyCfg.rewardMin, r.enemyCfg.rewardMax);
    document.getElementById('rpg-res-sub').textContent = `+${reward} монет • ${r.round - 1} раундов`;
    // TODO: отправить результат на сервер когда будет эндпоинт /api/battle/rpg
  } else {
    document.getElementById('rpg-res-sub').textContent = `Проиграл на ${r.round - 1} раунде`;
  }

  document.getElementById('rpg-result-overlay').classList.add('show');
}

export function rpgCloseResult() {
  document.getElementById('rpg-result-overlay').classList.remove('show');
  nav('scr-main');
}

export function rpgRestart() {
  const key = state.rpg?.enemyKey || 'mine_grunt';
  document.getElementById('rpg-result-overlay').classList.remove('show');
  startRpgBattle(key);
}

// ── Рендер ───────────────────────────────────────────────────

function _renderScene() {
  const r = state.rpg;
  document.getElementById('rpg-enemy-name').textContent   = r.enemyCfg.name;
  document.getElementById('rpg-avatar-enemy').textContent = r.enemyCfg.emoji;
  document.getElementById('rpg-round-badge').textContent  = `РАУНД ${r.round}`;
  _renderBars();
  _renderPotionCounts();
  _setLog('Выбери действие...');
  _setStatus('ТВОЙ ХОД');
  _highlightBtn('__none__');
  _updatePotionBtn();
  document.getElementById('rpg-confirm-btn').disabled = true;
  document.getElementById('rpg-potion-submenu').classList.remove('open');
  document.getElementById('rpg-result-overlay').classList.remove('show');
}

function _renderBars() {
  const { player: p, enemy: e } = state.rpg;
  _setBar('rpg-player-hp',  p.hp,  p.maxHp,  'hp');
  _setBar('rpg-player-sta', p.sta, p.maxSta, 'sta');
  _setBar('rpg-enemy-hp',   e.hp,  e.maxHp,  'hp');
  _setBar('rpg-enemy-sta',  e.sta, e.maxSta, 'sta');
}

function _setBar(id, val, max, type) {
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  const bar = document.getElementById(id + '-bar');
  const txt = document.getElementById(id + '-txt');
  if (!bar || !txt) return;
  bar.style.width = pct + '%';
  txt.textContent = Math.max(0, Math.round(val));
  bar.classList.remove('low');
  if (type === 'hp'  && pct < 30) bar.classList.add('low');
  if (type === 'sta' && pct < 20) bar.classList.add('low');
}

function _renderPotionCounts() {
  const p = state.rpg.potions;
  const hpEl  = document.getElementById('rpg-potion-hp-count');
  const staEl = document.getElementById('rpg-potion-sta-count');
  if (hpEl)  hpEl.textContent  = `×${p.hp}`;
  if (staEl) staEl.textContent = `×${p.sta}`;
  const btnHp  = document.getElementById('rpg-btn-potion-hp');
  const btnSta = document.getElementById('rpg-btn-potion-sta');
  if (btnHp)  btnHp.disabled  = p.hp  <= 0;
  if (btnSta) btnSta.disabled = p.sta <= 0;
}

function _updatePotionBtn() {
  const btn = document.getElementById('rpg-btn-potion');
  if (!btn) return;
  const has = state.rpg.potions.hp > 0 || state.rpg.potions.sta > 0;
  btn.style.display = has ? '' : 'none';
}

function _highlightBtn(action) {
  ['attack','block','wait','potion'].forEach(a => {
    document.getElementById('rpg-btn-' + a)?.classList.remove('selected');
  });
  document.getElementById('rpg-btn-' + action)?.classList.add('selected');
  if (action !== 'potion') {
    document.getElementById('rpg-btn-potion-hp') ?.classList.remove('selected');
    document.getElementById('rpg-btn-potion-sta')?.classList.remove('selected');
  }
}

function _closePotionMenu() {
  state.rpg.potionOpen = false;
  document.getElementById('rpg-potion-submenu').classList.remove('open');
}

function _setLog(html) {
  const el = document.getElementById('rpg-fight-log');
  if (el) el.innerHTML = html;
}

function _setStatus(text) {
  const el  = document.getElementById('rpg-turn-label');
  const dot = document.getElementById('rpg-turn-dot');
  if (el)  el.textContent = text;
  if (dot) dot.classList.toggle('waiting', text !== 'ТВОЙ ХОД');
}

// ── Анимации ─────────────────────────────────────────────────

function _hitAnim(avatarId) {
  const el = document.getElementById(avatarId);
  if (!el) return;
  el.classList.remove('rpg-shake', 'rpg-flash');
  void el.offsetWidth;
  el.classList.add('rpg-shake', 'rpg-flash');
  setTimeout(() => el.classList.remove('rpg-flash'), 150);
  setTimeout(() => el.classList.remove('rpg-shake'), 280);
}

function _popup(avatarId, text, type) {
  const avatar = document.getElementById(avatarId);
  if (!avatar) return;
  const p = document.createElement('div');
  p.className   = `rpg-dmg-popup rpg-popup-${type}`;
  p.textContent = text;
  avatar.parentElement.appendChild(p);
  setTimeout(() => p.remove(), 900);
}

function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}