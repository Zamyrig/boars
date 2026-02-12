import { tg } from './modules/global_state.js';
import { resetShopState } from './components/shop_component.js';
import { loadShopItems } from './components/shop_component.js';
import { loadRank } from './components/rank_component.js';

function nav(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    // Обновляем фон
    document.getElementById('bg-main').style.display = 'block';
    document.getElementById('bg-fight').style.display = 'none';
    document.getElementById('bg-inventory').style.display = 'none';
    document.getElementById('bg-shop').style.display = 'none';
    if (id === 'scr-fight') {
        document.getElementById('bg-main').style.display = 'none';
        document.getElementById('bg-fight').style.display = 'block';
    } else if (id === 'scr-inventory') {
        document.getElementById('bg-main').style.display = 'none';
        document.getElementById('bg-inventory').style.display = 'block';
    } else if (id === 'scr-shop') {
        document.getElementById('bg-main').style.display = 'none';
        document.getElementById('bg-shop').style.display = 'block';
        // ✅ ИСПРАВЛЕНИЕ: Сброс состояния магазина при входе
        resetShopState();
        loadShopItems(); // Загружаем предметы при открытии магазина
    }
    const isCardScreen = ['scr-bet', 'scr-inventory', 'scr-shop', 'scr-profile', 'scr-rank', 'scr-load'].includes(id);
    document.body.classList.toggle('dimmed', isCardScreen);
    // --- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Устанавливаем класс для главного экрана ---
    document.body.classList.toggle('show-main-screen', id === 'scr-main');
    // ---------------------------------------------------------------
    // Показываем кнопку профиля только на главном экране (это дублирует CSS, но надёжнее)
    if (id === 'scr-main') {
        document.body.classList.add('show-profile-btn');
    } else {
        document.body.classList.remove('show-profile-btn');
    }
    // Загрузка рейтинга
    if (id === 'scr-rank') loadRank(); // Загружаем рейтинг при открытии экрана
    tg.HapticFeedback.impactOccurred('light');
}

export { nav };