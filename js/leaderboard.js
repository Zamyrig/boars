// ============================================================
// leaderboard.js — рейтинг
// ============================================================
import { state } from './state.js';
import { apiFetch } from './api.js';
import { showToast } from './ui.js';

const tg = window.Telegram.WebApp;

function findUserRank(data) {
  const idx = data.findIndex(u => u.tg_id === state.user?.tg_id);
  return idx === -1 ? '?' : idx + 1;
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return '<span class="lb-last-seen">был в сети давно</span>';
  try {
    const date    = new Date(lastSeen + 'Z');
    const now     = new Date();
    const diffMs  = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH   = Math.floor(diffMs / 3600000);
    const diffD   = Math.floor(diffMs / 86400000);

    let text;
    if (diffMin < 2)       text = 'только что';
    else if (diffMin < 60) text = `${diffMin} мин. назад`;
    else if (diffH < 24)   text = `${diffH} ч. назад`;
    else if (diffD < 7)    text = `${diffD} дн. назад`;
    else {
      const d = date.getDate().toString().padStart(2,'0');
      const m = (date.getMonth()+1).toString().padStart(2,'0');
      text = `${d}.${m}.${date.getFullYear()}`;
    }
    return `<span class="lb-last-seen">${text}</span>`;
  } catch {
    return '<span class="lb-last-seen">был в сети давно</span>';
  }
}

export async function loadRank() {
  state.fullLeaderboardLoaded = false;
  state.fullLeaderboardData   = [];

  document.getElementById('toggle-full-leaderboard').style.display = 'none';
  document.getElementById('your-rank').textContent              = 'Твое место — ...';
  document.getElementById('rank-loading').style.display         = 'flex';
  document.getElementById('rank-list').style.display            = 'none';

  const data = await apiFetch('/api/leaderboard');
  document.getElementById('rank-list').innerHTML = '';

  if (!data || !Array.isArray(data)) {
    document.getElementById('rank-loading').style.display = 'none';
    document.getElementById('rank-list').style.display    = 'block';
    return;
  }

  const inTop = data.findIndex(u => u.tg_id === state.user?.tg_id);
  if (inTop !== -1) {
    state.userRank = inTop + 1;
    document.getElementById('your-rank').textContent = `Твое место — ${state.userRank}`;
  } else {
    document.getElementById('your-rank').textContent = 'Твое место — ...';
    apiFetch('/api/leaderboard/full').then(full => {
      if (full && Array.isArray(full)) {
        state.fullLeaderboardData = full;
        state.userRank = findUserRank(full);
        document.getElementById('your-rank').textContent = `Твое место — ${state.userRank}`;
      }
    });
  }

  renderLeaderboard(data);
  document.getElementById('rank-loading').style.display         = 'none';
  document.getElementById('rank-list').style.display            = 'block';
  document.getElementById('toggle-full-leaderboard').style.display = 'block';
  document.getElementById('toggle-full-leaderboard').textContent   = 'Развернуть';
}

export async function toggleFullLeaderboard() {
  const btn = document.getElementById('toggle-full-leaderboard');
  if (!state.fullLeaderboardLoaded) {
    btn.textContent = 'Загрузка...';
    btn.disabled    = true;
    const data = state.fullLeaderboardData.length
      ? state.fullLeaderboardData
      : await apiFetch('/api/leaderboard/full');
    if (data) {
      state.fullLeaderboardData   = data;
      state.fullLeaderboardLoaded = true;
      state.userRank = findUserRank(data);
      document.getElementById('your-rank').textContent = `Твое место — ${state.userRank}`;
      renderLeaderboard(data);
      btn.textContent = 'Свернуть';
    } else {
      btn.textContent = 'Ошибка';
      setTimeout(() => { btn.textContent = 'Развернуть'; }, 2000);
    }
    btn.disabled = false;
  } else {
    state.fullLeaderboardLoaded = false;
    loadRank();
  }
}

function renderLeaderboard(data) {
  const list = document.getElementById('rank-list');
  list.innerHTML = '';
  data.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'rank-item';
    if (state.user && u.tg_id === state.user.tg_id) item.classList.add('current-user-highlight');
    item.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:3px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="opacity:0.3;font-weight:900;width:24px;font-size:0.8rem;">${i + 1}</span>
          <span style="font-weight:700;">${u.display_name || u.username}</span>
        </div>
        <div style="padding-left:36px;">${formatLastSeen(u.last_seen)}</div>
      </div>
      <div class="lb-values">
        <div class="lb-value-row lb-val-gold">${u.balance.toLocaleString()} <img src="${BASE}/assets/boarcoin.png" class="coin-icon" alt=""></div>
        <div class="lb-value-row lb-val-acorn">${(u.acorns||0).toLocaleString()} <img src="${BASE}/assets/acorn.png" class="acorn-icon" alt=""></div>
      </div>`;
    item.onclick = () => showUserDetail(u);
    list.appendChild(item);
  });
}

export function showUserDetail(u) {
  tg.HapticFeedback.selectionChanged();
  document.getElementById('modal-user-name').innerText   = u.display_name || u.username;
  document.getElementById('modal-games').innerText       = u.total_games || 0;
  document.getElementById('modal-wins').innerText        = u.wins || 0;
  document.getElementById('modal-lose').innerText        = u.lose || 0;
  const wr = u.total_games > 0 ? Math.round((u.wins / u.total_games) * 100) : 0;
  document.getElementById('modal-winrate').innerText     = wr + '%';
  document.getElementById('modal-max-balance').innerText = (u.max_balance || 0).toLocaleString();
  document.getElementById('modal-watched').innerText     = (u.watched_battles || 0).toLocaleString();

  const btn = document.getElementById('modal-write-btn');
  if (u.username) {
    btn.style.display = 'block';
    btn.textContent   = 'НАПИСАТЬ';
    if (u.private_profile) {
      btn.style.background = '#7f8c8d';
      btn.style.boxShadow  = '0 4px 0 #566573';
      btn.onclick = () => { showToast('Этот пользователь запретил ему писать'); tg.HapticFeedback.notificationOccurred('error'); };
    } else {
      btn.style.background = '#0088cc';
      btn.style.boxShadow  = '0 4px 0 #006699';
      btn.onclick = () => tg.openTelegramLink(`https://t.me/${u.username}`);
    }
  } else {
    btn.style.display = 'none';
    btn.onclick = null;
  }
  document.getElementById('user-modal').style.display = 'flex';
}

export function closeModal() {
  document.getElementById('user-modal').style.display = 'none';
}