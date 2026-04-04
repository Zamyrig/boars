// ============================================================
// assets.js — централизованные ссылки на ассеты игры
// Используй ASSETS.* везде вместо хардкода путей
// ============================================================

export const ASSETS = {
  coin:        'assets/boarcoin.png',
  acorn:       'assets/acorn.png',
  seed:        'assets/acorn_planter_1.png',   // росток
  boar:        'assets/boars/boar.png',
  boarOld:     'assets/boars/boar_old.png',
};

// ── Хелперы для inline-иконок ─────────────────────────────────

/** <img> монеты */
export function coinImg(size = '1.1em') {
  return `<img src="${BASE}/${ASSETS.coin}" style="width:${size};height:${size};vertical-align:middle;margin-bottom:2px;" alt="">`;
}

/** <img> желудя */
export function acornImg(size = '1em') {
  return `<img src="${BASE}/${ASSETS.acorn}" style="width:${size};height:${size};vertical-align:middle;margin-bottom:2px;" alt="">`;
}

/** <img> ростка */
export function seedImg(size = '1em') {
  return `<img src="${BASE}/${ASSETS.seed}" style="width:${size};height:${size};vertical-align:middle;margin-bottom:2px;" alt="">`;
}