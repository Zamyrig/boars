// ============================================================
// api.js — HTTP-обёртки
// ============================================================
import { state } from './state.js';

export async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(BASE + endpoint, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    return await res.json();
  } catch (e) {
    console.error('apiFetch error:', endpoint, e);
    return null;
  }
}

export async function loadPrices() {
  try {
    const res = await fetch(BASE + '/prices.json');
    if (!res.ok) throw new Error('not found');
    state.prices = await res.json();
  } catch {
    state.prices = {
      plant_acorn: { buy: 1000, sell: 800 },
      acorn:       { buy: 200,  sell: 150 },
    };
  }
}

export async function loadItemDefs() {
  try {
    const res = await fetch(BASE + '/items.json');
    if (!res.ok) throw new Error('not found');
    state.itemDefs = await res.json();
  } catch {
    state.itemDefs = {
      acorn:       { name: 'Желудь', description: 'Основная валюта леса.',           icon: 'assets/acorn.png',           emoji: '🌰' },
      plant_acorn: { name: 'Росток', description: 'Посади на ферме и собери урожай.', icon: 'assets/acorn_planter_1.png', emoji: '🌱' },
    };
  }
}