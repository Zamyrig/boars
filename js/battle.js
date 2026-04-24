// ============================================================
// battle.js — бой: визуалка кабанов + RPG кнопки
// ============================================================
import { state, defeatBoss } from './state.js';
import { apiFetch } from './api.js';
import { nav, showToast, showBetDeduction, showResult, updateWatchButton, startWatchCooldownTick, coinImg } from './ui.js';
import { renderInventoryPotions } from './inventory.js';
const tg = window.Telegram.WebApp;

const BASE_DMG        = 5;
const ATTACK_STA      = 10;
const BLOCK_STA       = 15;   // стамина за простой блок
const BLOCK_STA_DRAIN = 30;   // штраф атакующему при ударе в блок
const BLOCK_RECOIL    = 0.10;
const WAIT_STA        = 25;   // восстановление за ожидание
const POTION_STA      = 5;
const BLOCK_REDUCE    = 0.80;
const BLOCK_MIN       = 0.10;

const ATTACK_ANIM_MS  = 1000;
const DMG_FRAME_DELAY = 550; // ~6й кадр атаки (10fps)

// ── Конфиги врагов ───────────────────────────────────────────
const ENEMY_CONFIGS = {
  mine_grunt: {
    name: 'Шахтёр',
    img: null,
    bgId: 'bg-mine',
    hp: 85, sta: 85, baseDmg: BASE_DMG * 0.85,
    rewardMin: 25, rewardMax: 35,
    isBoss: false,
    dropPotion: true,
  },
  forest_grunt: {
    name: 'Лесной кабан',
    img: null,
    bgId: 'bg-forest',
    hp: 120, sta: 110, baseDmg: BASE_DMG * 1.3,
    rewardMin: 50, rewardMax: 70,
    isBoss: false,
    dropPotion: true,
  },
  boss_1: {
    name: 'Бригадир',
    img: 'assets/boars/boar_sobchak/boar_waiting/boar_waiting1.png',
    bgId: 'bg-mine',
    hp: 150, sta: 150, baseDmg: 6,
    rewardMin: 700, rewardMax: 800,
    isBoss: true,
    bossId: 'boss_1',
  },
};

// ── Анимации ─────────────────────────────────────────────────
const BOAR_ANIMS = {
  waiting:     { folder: 'boar_waiting',     count: 7,  fps: 7  },
  attack:      { folder: 'boar_attack',      count: 10, fps: 10 },
  take_damage: { folder: 'boar_take_damage', count: 8,  fps: 10 },
  death:       { folder: 'boar_death',       count: 9,  fps: 8  },
  block:       { folder: 'boar_block',       count: 7,  fps: 8  },
};

const _boarState = {
  1: { timer: null, anim: null, dead: false },
  2: { timer: null, anim: null, dead: false },
};

// ── Путь к спрайту ───────────────────────────────────────────
function _skinBase(side, animFolder) {
  const skinId = side === 1
    ? (state.user?.skin_id || 'boar_sobchak')
    : (state._enemySkinId  || 'boar_sobchak');
  return `assets/boars/${skinId}/${animFolder}/${animFolder}`;
}

// ── Анимация ─────────────────────────────────────────────────
function _playBoarAnim(side, animName, loop = true) {
  const cfg = BOAR_ANIMS[animName];
  if (!cfg) return;
  const img = document.getElementById(`boar${side}-img`);
  if (!img) return;
  const bs = _boarState[side];

  if (bs.dead && animName !== 'death') return;
  if (loop && bs.anim === animName && bs.timer !== null) return;

  clearInterval(bs.timer);
  bs.timer = null;
  bs.anim  = animName;

  const base        = _skinBase(side, cfg.folder);
  const intervalMs  = Math.round(1000 / cfg.fps);
  let frame         = 1;
  let cancelled     = false;

  const frames = [];
  for (let i = 1; i <= cfg.count; i++) {
    const image = new Image();
    image.src   = `${base}${i}.png`;
    frames.push(image);
  }
  img.src = frames[0].src;

  bs.timer = setInterval(() => {
    if (cancelled) return;
    frame++;
    if (frame > cfg.count) {
      if (!loop) {
        cancelled = true;
        clearInterval(bs.timer);
        bs.timer = null;
        if (bs.anim === 'death') return;
        bs.anim = null;
        _playBoarAnim(side, 'waiting', true);
        return;
      }
      frame = 1;
    }
    img.src = frames[frame - 1].src;
  }, intervalMs);
}

function _stopBoarAnims() {
  [1, 2].forEach(side => {
    clearInterval(_boarState[side].timer);
    _boarState[side].timer = null;
    _boarState[side].anim  = null;
    _boarState[side].dead  = false;
  });
}

function _killBoar(side) {
  const bs = _boarState[side];
  bs.dead = true;
  clearInterval(bs.timer);
  bs.timer = null;
  bs.anim  = null;
  _playBoarAnim(side, 'death', false);
}

function _initBoarAnims() {
  _stopBoarAnims();
  _playBoarAnim(1, 'waiting', true);
  _playBoarAnim(2, 'waiting', true);
}

function _setBoarImages() {
  const img1 = document.getElementById('boar1-img');
  const img2 = document.getElementById('boar2-img');
  if (img1) img1.src = `${_skinBase(1, 'boar_waiting')}1.png`;
  if (img2) img2.src = `${_skinBase(2, 'boar_waiting')}1.png`;
}

// ── Инициализация RPG ────────────────────────────────────────
function initRpgState(enemyKey, enemySkinId = null) {
  const cfg = ENEMY_CONFIGS[enemyKey] || ENEMY_CONFIGS.mine_grunt;
  state._enemySkinId = enemySkinId || 'boar_sobchak';
  state.rpg = {
    enemyKey,
    enemyCfg: cfg,
    locked: false,
    potionOpen: false,
    round: 1,
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
    potions: {
      hp:  state.user?.potion_hp  || 0,
      sta: state.user?.potion_sta || 0,
    },
  };
}

// ── Точки входа ───────────────────────────────────────────────
export function tryStartBattle(enemyKey = 'mine_grunt', enemySkinId = null) {
  initRpgState(enemyKey, enemySkinId);
  _setupFightScreen();

  const allBgs = ['bg-main','bg-fight','bg-inventory','bg-shop','bg-farm','bg-mine','bg-forest'];
  allBgs.forEach(bg => {
    const el = document.getElementById(bg);
    if (el) el.style.display = 'none';
  });
  const cfg  = ENEMY_CONFIGS[enemyKey] || ENEMY_CONFIGS.mine_grunt;
  const bgEl = document.getElementById(cfg.bgId || 'bg-fight');
  if (bgEl) bgEl.style.display = 'block';

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('scr-fight').classList.add('active');
  document.body.classList.remove('dimmed', 'show-main-screen');
  tg.HapticFeedback.impactOccurred('medium');
}

function _setupFightScreen() {
  const r   = state.rpg;
  const cfg = r.enemyCfg;

  ['hp1-f','hp2-f'].forEach(id => {
    document.getElementById(id).style.width      = '100%';
    document.getElementById(id).style.background = '';
  });
  document.getElementById('hp1-txt').innerText = '100';
  document.getElementById('hp2-txt').innerText = cfg.hp;
  document.getElementById('hp2-f').style.width = (cfg.hp / cfg.maxHp * 100) + '%';

  const img2 = document.getElementById('boar2-img');
  if (cfg.img && img2) {
    img2.src = cfg.img;
  }

  document.getElementById('fight-log').innerText = '';
  _renderRpgBars();
  _renderPotionCounts();
  _closePotionMenu();
  _unlockButtons();
  const lbl = document.getElementById('rpg-round-label');
  if (lbl) lbl.textContent = 'РАУНД 1';
  _initBoarAnims();
}

// ── watchBattle ───────────────────────────────────────────────
export async function watchBattle() {
  if (state.isBattleLocked) return;
  state.isBattleLocked = true;
  state.isWatchingMode = true;
  state.battleResult   = null;

  const serverPromise = apiFetch('/api/battle/watch', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id }),
  });
  _startOldBattle(0, null, serverPromise);
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
  if (isNaN(amt) || amt < 10)   { tg.HapticFeedback.notificationOccurred('error'); showToast('Минимальная ставка: 10'); return; }
  if (amt > state.user.balance) { tg.HapticFeedback.notificationOccurred('error'); showToast('Недостаточно золота');     return; }

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
    if (!response || response.error) throw new Error(response?.error || 'Ошибка');
    state.battleResult = { ...response, _betAmount: amt };
    _startOldBattle(amt, response, null);
  } catch (error) {
    tg.HapticFeedback.notificationOccurred('error');
    showToast(error.message || 'Ошибка начала боя');
    state.isBattleLocked = false;
    input.disabled       = false;
    document.getElementById('bal-val').innerText = state.user.balance.toLocaleString();
  }
}

// ── RPG кнопки ────────────────────────────────────────────────
export function rpgAction(action) {
  const r = state.rpg;
  if (!r || r.locked) return;
  if (action === 'potion') { _togglePotion(); return; }
  if (r.potionOpen) _closePotionMenu();
  _doRpgRound(action);
}

export function rpgPotionSelect(type) {
  const r = state.rpg;
  if (!r || r.locked) return;
  if (r.potions[type] <= 0) { showToast('Нет зелий!'); return; }
  _closePotionMenu();
  _doRpgRound('potion-' + type);
}

function _togglePotion() {
  const r = state.rpg;
  r.potionOpen = !r.potionOpen;
  document.getElementById('rpg-potion-submenu').classList.toggle('open', r.potionOpen);
  tg.HapticFeedback.selectionChanged();
}

function _closePotionMenu() {
  if (!state.rpg) return;
  state.rpg.potionOpen = false;
  document.getElementById('rpg-potion-submenu')?.classList.remove('open');
}

// ── ИИ врага ─────────────────────────────────────────────────
function _enemyAI() {
  const e   = state.rpg.enemy;
  const cfg = state.rpg.enemyCfg;
  if (e.sta <= 10) return 'wait';
  const roll = Math.random();
  if (cfg.isBoss) {
    if (roll < 0.65) return 'attack';
    if (roll < 0.90) return 'wait';
    return 'block';
  }
  if (e.hp < e.maxHp * 0.25 && roll < 0.35) return 'wait';
  if (roll < 0.12) return 'block';
  if (roll < 0.30) return 'wait';
  return 'attack';
}

// ── Расчёт хода ──────────────────────────────────────────────
function _doRpgRound(playerAction) {
  const r = state.rpg;
  r.locked = true;
  _lockButtons();
  tg.HapticFeedback.impactOccurred('rigid');

  const enemyAction = _enemyAI();
  const p = r.player, e = r.enemy;

  let playerHeal = 0, playerStaRestore = 0;
  if (playerAction === 'potion-hp') {
    playerHeal = Math.round(p.maxHp * 0.5);
    p.hp  = Math.min(p.maxHp, p.hp + playerHeal);
    p.sta = Math.max(0, p.sta - POTION_STA);
    r.potions.hp--;
    _syncPotionsToUser();
  } else if (playerAction === 'potion-sta') {
    const target = Math.round(p.maxSta * 0.9);
    playerStaRestore = Math.max(0, target - p.sta);
    p.sta = Math.min(p.maxSta, p.sta + playerStaRestore);
    p.sta = Math.max(0, p.sta - POTION_STA);
    r.potions.sta--;
    _syncPotionsToUser();
  }

  let playerDmg = 0, enemyDmg = 0;
  let playerBlocked = false, enemyBlocked = false;
  let recoilOnEnemy = 0, recoilOnPlayer = 0;
  const pStaBeforeBlock = p.sta;
  const eStaBeforeBlock = e.sta;

  if (playerAction === 'attack') {
    playerDmg = p.sta <= 0 ? _rand(1,2) : Math.max(1, Math.round(p.baseDmg * (0.9 + Math.random() * 0.5)));
    if (p.sta > 0) p.sta = Math.max(0, p.sta - ATTACK_STA);
    if (enemyAction === 'block' && e.sta > 0) {
      enemyBlocked   = true;
      playerDmg      = Math.max(Math.round(p.baseDmg * BLOCK_MIN), Math.round(playerDmg * (1 - BLOCK_REDUCE)));
      e.sta          = Math.max(0, e.sta - BLOCK_STA_DRAIN);
      recoilOnPlayer = Math.round(p.baseDmg * BLOCK_RECOIL);
      p.hp           = Math.max(0, p.hp - recoilOnPlayer);
    }
    e.hp = Math.max(0, e.hp - playerDmg);
  } else if (playerAction === 'block') {
    if (p.sta > 0) p.sta = Math.max(0, p.sta - BLOCK_STA);
  } else if (playerAction === 'wait') {
    p.sta = Math.min(p.maxSta, p.sta + WAIT_STA);
  }

  if (enemyAction === 'attack') {
    enemyDmg = e.sta <= 0 ? _rand(1,2) : Math.max(1, Math.round(e.baseDmg * (0.9 + Math.random() * 0.5)));
    if (e.sta > 0) e.sta = Math.max(0, e.sta - ATTACK_STA);
    if (playerAction === 'block' && pStaBeforeBlock > 0) {
      playerBlocked = true;
      enemyDmg      = Math.max(Math.round(e.baseDmg * BLOCK_MIN), Math.round(enemyDmg * (1 - BLOCK_REDUCE)));
      e.sta         = Math.max(0, e.sta - BLOCK_STA_DRAIN);
      recoilOnEnemy = Math.round(e.baseDmg * BLOCK_RECOIL);
      e.hp          = Math.max(0, e.hp - recoilOnEnemy);
    }
    p.hp = Math.max(0, p.hp - enemyDmg);
  } else if (enemyAction === 'wait') {
    e.sta = Math.min(e.maxSta, e.sta + WAIT_STA);
  } else if (enemyAction === 'block' && playerAction !== 'attack') {
    if (e.sta > 0) e.sta = Math.max(0, e.sta - BLOCK_STA);
  }

document.getElementById('fight-log').innerText = '';

  _renderRpgBars(true); // скрываем цифры HP до удара
  _renderPotionCounts();
  r.round++;

  // ── Анимации ─────────────────────────────────────────────────
  const c1 = document.getElementById('cont-1');
  const c2 = document.getElementById('cont-2');
  const phases = [];

  // Анимация блока врага — запускается до атаки игрока
  if (enemyAction === 'block') {
    phases.push({ delay: 0, fn: () => { _playBoarAnim(2, 'block', false); }});
  }

  if (playerAction === 'attack') {
    phases.push({ delay: ATTACK_ANIM_MS + 150, fn: () => {
      _playBoarAnim(1, 'attack', false);
      setTimeout(() => {
        _spawnDmg(c2, `-${playerDmg}`, '#ff3e3e');
        if (enemyBlocked) {
          if (recoilOnPlayer > 0) _spawnDmg(c1, `-${recoilOnPlayer}`, '#ff8c00');
        } else if (e.hp <= 0) {
          _killBoar(2);
        } else {
          _playBoarAnim(2, 'take_damage', false);
        }
        tg.HapticFeedback.impactOccurred('medium');
      }, DMG_FRAME_DELAY);
    }});
  } else if (playerAction === 'block') {
    phases.push({ delay: 0, fn: () => { _playBoarAnim(1, 'block', false); }});
  } else if (playerAction === 'potion-hp') {
    phases.push({ delay: 500, fn: () => { _spawnDmg(c1, `+${playerHeal}`, '#4cd964'); }});
  } else if (playerAction === 'potion-sta') {
    phases.push({ delay: 500, fn: () => { _spawnDmg(c1, `+${playerStaRestore}`, '#3b9eff'); }});
  }

  if (enemyAction === 'attack') {
    phases.push({ delay: ATTACK_ANIM_MS + 150, fn: () => {
      _playBoarAnim(2, 'attack', false);
      setTimeout(() => {
        _spawnDmg(c1, `-${enemyDmg}`, '#ff3e3e');
        if (playerBlocked) {
          if (recoilOnEnemy > 0) _spawnDmg(c2, `-${recoilOnEnemy}`, '#ff8c00');
        } else if (p.hp <= 0) {
          _killBoar(1);
        } else {
          _playBoarAnim(1, 'take_damage', false);
        }
        tg.HapticFeedback.impactOccurred('medium');
      }, DMG_FRAME_DELAY);
    }});
  }

  let t = 0;
  phases.forEach(phase => { setTimeout(phase.fn, t); t += phase.delay; });

  const deathPending = (p.hp <= 0 || e.hp <= 0);
  const deathExtraMs = deathPending ? 1200 : 0;

  setTimeout(() => {
    if (p.hp <= 0) { _endRpg(false); return; }
    if (e.hp <= 0) { _endRpg(true);  return; }
    r.locked = false;
    _unlockButtons();
    const lbl = document.getElementById('rpg-round-label');
    if (lbl) lbl.textContent = `РАУНД ${r.round}`;
  }, t + 200 + deathExtraMs);
}

// ── Конец боя ─────────────────────────────────────────────────
async function _endRpg(playerWon) {
  _stopBoarAnims();
  tg.HapticFeedback.notificationOccurred(playerWon ? 'success' : 'error');
  const cfg = state.rpg?.enemyCfg || {};
  if (playerWon && cfg.isBoss && cfg.bossId) {
    defeatBoss(cfg.bossId);
    showToast('🎉 Босс повержен! Новые локации открыты!');
  }

  const icon  = document.getElementById('res-icon');
  const title = document.getElementById('res-title');
  const sum   = document.getElementById('res-sum');
  icon.innerText    = playerWon ? (cfg.isBoss ? '👑' : '🏆') : '💀';
  title.innerText   = playerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
  title.style.color = playerWon ? 'var(--win)' : 'var(--lose)';

  const reward = playerWon ? _rand(cfg.rewardMin || 25, cfg.rewardMax || 35) : 0;

  const [, dropResult] = await Promise.all([
    apiFetch('/api/battle/rpg-result', {
      method: 'POST',
      body: JSON.stringify({
        tg_id:  state.user.tg_id,
        is_win: playerWon,
        reward,
        enemy:  cfg.bossId || state.rpg?.enemyKey || 'mine_grunt',
      }),
    }).then(resp => {
      if (resp?.new_balance !== undefined) {
        state.user.balance     = resp.new_balance;
        state.user.total_games = resp.total_games;
        state.user.wins        = resp.wins;
        state.user.lose        = resp.lose;
        document.getElementById('bal-val').innerText = resp.new_balance.toLocaleString();
      }
    }).catch(e => {
      if (playerWon) state.user.balance += reward;
      document.getElementById('bal-val').innerText = state.user.balance.toLocaleString();
      console.warn('rpg-result sync failed', e);
    }),
    playerWon && cfg.dropPotion
      ? apiFetch('/api/battle/mine-drop', {
          method: 'POST',
          body: JSON.stringify({ tg_id: state.user.tg_id }),
        }).catch(e => { console.warn('mine-drop failed', e); return null; })
      : Promise.resolve(null),
  ]);

  let potionDropped = false;
  if (dropResult?.potion_dropped) {
    potionDropped         = true;
    state.user.potion_hp  = dropResult.potion_hp;
    state.user.potion_sta = dropResult.potion_sta;
    if (state.rpg) {
      state.rpg.potions.hp  = dropResult.potion_hp;
      state.rpg.potions.sta = dropResult.potion_sta;
    }
    renderInventoryPotions();
  }

  if (playerWon) {
    let sumHtml = `+${reward} ${coinImg()}`;
    if (potionDropped) sumHtml += `<span style="margin-left:10px;font-size:1.1rem;vertical-align:middle;">❤️ +1</span>`;
    sum.innerHTML   = sumHtml;
    sum.style.color = 'var(--win)';
  } else {
    sum.innerHTML = '';
  }

  const overlay = document.getElementById('result-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('result-card').classList.add('active'), 50);
}

// ── Зелья ────────────────────────────────────────────────────
function _syncPotionsToUser() {
  const r = state.rpg;
  if (!r || !state.user) return;
  state.user.potion_hp  = r.potions.hp;
  state.user.potion_sta = r.potions.sta;
  renderInventoryPotions();
  apiFetch('/api/user/update-potions', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, potion_hp: r.potions.hp, potion_sta: r.potions.sta }),
  }).catch(e => console.warn('potion sync error', e));
}

// ── Рендер баров ─────────────────────────────────────────────
function _renderRpgBars(hideHpTxt = false) {
  const r = state.rpg;
  if (!r) return;
  const p = r.player, e = r.enemy;
  const p1 = Math.max(0, (p.hp / p.maxHp) * 100);
  const p2 = Math.max(0, (e.hp / e.maxHp) * 100);
  const hp1f = document.getElementById('hp1-f');
  const hp2f = document.getElementById('hp2-f');
  hp1f.style.width      = p1 + '%';
  hp2f.style.width      = p2 + '%';
  hp1f.style.background = p1 < 30 ? 'linear-gradient(90deg,#ff3e3e,#ff8080)' : '';
  hp2f.style.background = p2 < 30 ? 'linear-gradient(90deg,#ff3e3e,#ff8080)' : '';

  const hp1txt = document.getElementById('hp1-txt');
  const hp2txt = document.getElementById('hp2-txt');
  if (hideHpTxt) {
    hp1txt.style.opacity = '0';
    hp2txt.style.opacity = '0';
  } else {
    hp1txt.innerText     = Math.round(p.hp);
    hp2txt.innerText     = Math.round(e.hp);
    hp1txt.style.opacity = '1';
    hp2txt.style.opacity = '1';
  }

  const s1   = Math.max(0, (p.sta / p.maxSta) * 100);
  const s2   = Math.max(0, (e.sta / e.maxSta) * 100);
  const sta1 = document.getElementById('rpg-sta1-bar');
  const sta2 = document.getElementById('rpg-sta2-bar');
  if (sta1) { sta1.style.width = s1 + '%'; sta1.style.background = s1 < 20 ? 'linear-gradient(90deg,#ff8c00,#ffb347)' : ''; }
  if (sta2) { sta2.style.width = s2 + '%'; sta2.style.background = s2 < 20 ? 'linear-gradient(90deg,#ff8c00,#ffb347)' : ''; }
  const t1 = document.getElementById('rpg-sta1-txt');
  const t2 = document.getElementById('rpg-sta2-txt');
  if (t1) t1.innerText = Math.round(p.sta);
  if (t2) t2.innerText = Math.round(e.sta);
}

function _renderPotionCounts() {
  const r = state.rpg;
  if (!r) return;
  const hEl = document.getElementById('rpg-potion-hp-count');
  const sEl = document.getElementById('rpg-potion-sta-count');
  if (hEl) hEl.textContent = `×${r.potions.hp}`;
  if (sEl) sEl.textContent = `×${r.potions.sta}`;
  const bh = document.getElementById('rpg-btn-potion-hp');
  const bs = document.getElementById('rpg-btn-potion-sta');
  if (bh) bh.disabled = r.potions.hp  <= 0;
  if (bs) bs.disabled = r.potions.sta <= 0;
  const bp = document.getElementById('rpg-btn-potion');
  if (bp) bp.style.display = (r.potions.hp > 0 || r.potions.sta > 0) ? '' : 'none';
}

function _lockButtons()   { document.querySelectorAll('.rpg-card-btn, .rpg-potion-btn').forEach(b => b.disabled = true); }
function _unlockButtons() { document.querySelectorAll('.rpg-card-btn').forEach(b => b.disabled = false); _renderPotionCounts(); }

function _spawnDmg(container, text, color) {
  const p       = document.createElement('div');
  p.className   = 'dmg-popup';
  p.innerText   = text;
  p.style.left  = (Math.random() * 40 + 30) + '%';
  p.style.color = color || '#ff3e3e';
  container.appendChild(p);
  setTimeout(() => p.remove(), 700);
}

function _rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Старая анимация (watchBattle / preStart) ─────────────────
function _generateHits(serverResult) {
  const winningSide = !serverResult || state.isWatchingMode
    ? (Math.random() < 0.5 ? 1 : 2)
    : (serverResult.is_win === true ? state.selectedSide : (state.selectedSide === 1 ? 2 : 1));
  let hits = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    hits = [];
    let hp1 = 100, hp2 = 100, target = 1;
    while (hp1 > 0 && hp2 > 0) {
      const dmg = Math.floor(Math.random() * 16) + 5;
      if (target === 1) { hp1 = Math.max(0, hp1 - dmg); hits.push({ target: 1, dmg }); if (hp1 <= 0) break; target = 2; }
      else              { hp2 = Math.max(0, hp2 - dmg); hits.push({ target: 2, dmg }); if (hp2 <= 0) break; target = 1; }
    }
    if ((hp1 > 0 ? 1 : 2) === winningSide) break;
  }
  return hits;
}

function _startOldBattle(bet, serverResult, serverPromise) {
  nav('scr-fight');
  let h1 = 100, h2 = 100;
  const log = document.getElementById('fight-log');
  log.innerText = '';

  ['hp1-f', 'hp2-f'].forEach(id => {
    const el = document.getElementById(id);
    el.style.width      = '100%';
    el.style.background = '';
  });
  document.getElementById('hp1-txt').innerText = '100';
  document.getElementById('hp2-txt').innerText = '100';

  const panel = document.getElementById('rpg-fight-panel');
  if (panel) panel.style.display = 'none';

  const playerSkin = state.user?.skin_id || 'boar_sobchak';
  const img1 = document.getElementById('boar1-img');
  const img2 = document.getElementById('boar2-img');
  if (img1) img1.src = `assets/boars/${playerSkin}/boar_waiting/boar_waiting1.png`;

  _initBoarAnims();

  const hits = _generateHits(serverResult);
  let resolvedWatchResult = null;

  if (serverPromise) {
    serverPromise.then(response => {
      resolvedWatchResult = response;
      if (response?.enemy_skin_id) {
        state._enemySkinId = response.enemy_skin_id;
        if (img2) img2.src = `assets/boars/${response.enemy_skin_id}/boar_waiting/boar_waiting1.png`;
      }
      if (response?.success) {
        state.battleResult            = { ...response, _isWatch: true };
        state.watchCooldownRemaining  = response.watch_cooldown_remaining || 0;
        updateWatchButton();
        clearInterval(state.watchCooldownTimer);
        state.watchCooldownTimer = null;
        if (state.watchCooldownRemaining > 0) startWatchCooldownTick();
      }
    }).catch(e => console.warn('watch request failed', e));
  }

  if (serverResult?.enemy_skin_id) {
    state._enemySkinId = serverResult.enemy_skin_id;
    if (img2) img2.src = `assets/boars/${serverResult.enemy_skin_id}/boar_waiting/boar_waiting1.png`;
  }

  let hitIndex = 0, battleEnded = false;

  const interval = setInterval(() => {
    if (hitIndex >= hits.length || battleEnded) { clearInterval(interval); return; }
    const hit  = hits[hitIndex];
    const cont = document.getElementById(`cont-${hit.target}`);
    _spawnDmg(cont, `-${hit.dmg}`, '#ff3e3e');

    if (hit.target === 1) {
      _playBoarAnim(1, 'take_damage', false);
      _playBoarAnim(2, 'attack', false);
    } else {
      _playBoarAnim(2, 'take_damage', false);
      _playBoarAnim(1, 'attack', false);
    }

    if (hit.target === 1) {
      h1 = Math.max(0, h1 - hit.dmg);
      const el1 = document.getElementById('hp1-f');
      el1.style.width      = h1 + '%';
      el1.style.background = h1 < 30 ? 'linear-gradient(90deg,#ff3e3e,#ff8080)' : '';
      document.getElementById('hp1-txt').innerText = h1;
    } else {
      h2 = Math.max(0, h2 - hit.dmg);
      const el2 = document.getElementById('hp2-f');
      el2.style.width      = h2 + '%';
      el2.style.background = h2 < 30 ? 'linear-gradient(90deg,#ff3e3e,#ff8080)' : '';
      document.getElementById('hp2-txt').innerText = h2;
    }
    tg.HapticFeedback.impactOccurred('medium');

    if (h1 <= 0 || h2 <= 0) {
      battleEnded = true;
      clearInterval(interval);
      if (h1 <= 0) _killBoar(1); else _killBoar(2);

      setTimeout(() => {
        _stopBoarAnims();
        const playerWins = serverResult?.is_win === true;
        tg.HapticFeedback.notificationOccurred(
          (playerWins && !state.isWatchingMode) || state.isWatchingMode ? 'success' : 'error'
        );
        if (state.isWatchingMode) {
          const wr          = resolvedWatchResult || state.battleResult;
          const rewardGiven = wr?.reward_given;
          const reward      = wr?.reward || 0;
          showResult('БОЙ ОКОНЧЕН', reward, rewardGiven && reward > 0 ? 'watch_reward' : 'watch_no_reward');
        } else {
          showResult(playerWins ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', bet, playerWins ? 'win' : 'lose');
        }
        state.isBattleLocked = false;
        if (panel) panel.style.display = '';
      }, 1400);
    }
    hitIndex++;
  }, 1200);
}