// ============================================================
// profile.js — профиль игрока
// ============================================================
import { state } from './state.js';
import { apiFetch } from './api.js';
import { nav } from './ui.js';

const tg = window.Telegram.WebApp;

export async function updateName() {
  const name = document.getElementById('edit-name').value.trim();
  if (!name) return;
  await apiFetch('/api/user/update-name', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, display_name: name }),
  });
  state.user.display_name = name;
  tg.HapticFeedback.notificationOccurred('success');
  nav('scr-main');
}

export async function togglePrivateProfile() {
  const toggle    = document.getElementById('private-profile-toggle');
  const isChecked = toggle.checked;
  const response  = await apiFetch('/api/user/set-private', {
    method: 'POST',
    body: JSON.stringify({ tg_id: state.user.tg_id, is_private: isChecked }),
  });
  if (response?.success) {
    state.user.private_profile = isChecked;
  } else {
    toggle.checked = !isChecked;
  }
}
