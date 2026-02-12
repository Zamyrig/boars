import { currentShopItem, currentShopQuantity, currentAction, prices, setCurrentShopItem, setCurrentShopQuantity, setCurrentAction } from '../modules/global_state.js';
import { loadPrices } from '../utils/price_loader.js';
import { tg } from '../modules/global_state.js';
import { user } from '../modules/global_state.js';
import { apiFetch } from '../api/api_client.js';
import { updateUI } from '../utils/ui_updater.js';
import { showToast } from '../utils/toast.js';

// ✅ НОВАЯ ФУНКЦИЯ: Сброс состояния магазина (вызов при входе и при нажатии НАЗАД)
function resetShopState() {
    setCurrentShopItem(null);
    setCurrentShopQuantity(1);
    document.getElementById('qty-input').value = '1';
    document.getElementById('detail-icon-placeholder').style.display = 'block';
    document.getElementById('detail-icon-big').style.display = 'none';
    document.getElementById('detail-name').innerText = 'Выберите предмет';
    document.getElementById('detail-price').innerText = 'Цена: -';
    document.getElementById('total-cost').style.display = 'none';
    // Снять выделение со всех предметов
    document.querySelectorAll('#shop-items-container .shop-item').forEach(el => el.classList.remove('selected'));
    // Сбросить тумблер в режим "КУПИТЬ" и цвет в зелёный
    const toggle = document.getElementById('action-toggle');
    toggle.checked = false;
    setCurrentAction('buy');
    document.querySelector('.slider').style.backgroundColor = 'var(--win)';
    document.querySelector('.slider-thumb').style.transform = 'translateX(0)';
    updateTradeButton();
    updatePriceDisplay();
}

// --- НОВАЯ ФУНКЦИЯ: Загрузка предметов магазина ---
async function loadShopItems() {
    // Сначала загружаем цены
    await loadPrices();
    const container = document.getElementById('shop-items-container');
    container.innerHTML = ""; // Очищаем контейнер
    // Используем жесто закодированные id предметов, но с ценами из prices.json
    const itemIds = ["acorn", "plant_acorn"];
    for (const itemId of itemIds) {
        const item = {
            id: itemId,
            name: itemId === "acorn" ? "Желудь" : "Росток",
            icon: itemId === "acorn" ? "acorn.png" : "plant_acorn.png",
            price: prices[itemId]?.buy || 0, // Цена покупки из JSON
            sell_price: prices[itemId]?.sell || 0 // Цена продажи из JSON
        };
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.onclick = () => selectShopItem(item);
        div.innerHTML = `
                <img class="shop-item-icon" src="assets/${item.icon}" onerror="this.src='https://placehold.co/40x40?text=?'">
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-price">${currentAction === 'buy' ? item.price : item.sell_price} 💰</div>
        `;
        container.appendChild(div);
    }
}

// --- НОВАЯ ФУНКЦИЯ: Выбор предмета в магазине ---
function selectShopItem(item) {
    setCurrentShopItem(item);
    setCurrentShopQuantity(1);
    document.getElementById('qty-input').value = currentShopQuantity;
    // Переключаем иконку
    document.getElementById('detail-icon-placeholder').style.display = 'none';
    document.getElementById('detail-icon-big').src = `assets/${item.icon}`;
    document.getElementById('detail-icon-big').style.display = 'block';
    document.getElementById('detail-name').innerText = item.name;
    updatePriceDisplay();
    // Подсветка
    document.querySelectorAll('#shop-items-container .shop-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

// --- НОВАЯ ФУНКЦИЯ: Переключение действия (КУПИТЬ/ПРОДАТЬ) ---
function toggleAction() {
    const checkbox = document.getElementById('action-toggle');
    const thumb = document.querySelector('#scr-shop .slider-thumb');
    setCurrentAction(checkbox.checked ? 'sell' : 'buy');
    updatePriceDisplay(); // Обновляем цену под предметом
    updateShopItemPrices(); // Обновляем цены в сетке магазина
    updateTradeButton(); // Обновляем текст кнопки сделки
    // Анимация thumb
    if (thumb) {
        thumb.style.transform = checkbox.checked ? 'translateX(76px)' : 'translateX(0)';
    }
    // ✅ ИСПРАВЛЕНИЕ: Обновляем цвет фона тумблера
    const slider = document.querySelector('.slider');
    slider.style.backgroundColor = currentAction === 'buy' ? 'var(--win)' : 'var(--lose)';
}

// --- НОВАЯ ФУНКЦИЯ: Обновление текста кнопки сделки ---
function updateTradeButton() {
    const button = document.querySelector('#scr-shop .btn-trade');
    button.innerText = currentAction === 'buy' ? 'КУПИТЬ' : 'ПРОДАТЬ';
    button.classList.toggle('sell-mode', currentAction === 'sell');
}

// --- НОВАЯ ФУНКЦИЯ: Обновление цен в сетке магазина ---
function updateShopItemPrices() {
    const items = document.querySelectorAll('#shop-items-container .shop-item');
    items.forEach((el, index) => {
        const itemIds = ["acorn", "plant_acorn"];
        const itemId = itemIds[index];
        const item = {
            id: itemId,
            name: itemId === "acorn" ? "Желудь" : "Росток",
            icon: itemId === "acorn" ? "acorn.png" : "plant_acorn.png",
            price: prices[itemId]?.buy || 0,
            sell_price: prices[itemId]?.sell || 0
        };
        el.querySelector('.shop-item-price').innerText = `${currentAction === 'buy' ? item.price : item.sell_price} 💰`;
    });
}

// --- НОВАЯ ФУНКЦИЯ: Обновление текста цены под предметом и итоговой суммы ---
function updatePriceDisplay() {
    const totalCostEl = document.getElementById('total-cost');
    if (!currentShopItem) {
        document.getElementById('detail-price').innerText = 'Цена: -';
        totalCostEl.style.display = 'none';
        return;
    }
    const price = currentAction === 'buy' ? currentShopItem.price : currentShopItem.sell_price;
    const total = price * currentShopQuantity;
    document.getElementById('detail-price').innerText = `Цена: ${price} 💰 / шт.`;
    totalCostEl.innerHTML = `${price} 💰 × ${currentShopQuantity} = ${total} 💰`;
    totalCostEl.style.display = 'block';
}

// --- НОВАЯ ФУНКЦИЯ: Обработка ввода в поле ---
function onQtyInput(value) {
    let newQty = parseInt(value) || 1;
    if (newQty < 1) newQty = 1;
    if (newQty > 999999) newQty = 999999;
    setCurrentShopQuantity(newQty);
    updatePriceDisplay(); // Обновляем итоговую сумму
}

// --- НОВАЯ ФУНКЦИЯ: Совершение транзакции ---
async function performTransaction() {
    if (!currentShopItem) {
        tg.HapticFeedback.notificationOccurred('error');
        showToast("Выберите предмет");
        return;
    }
    const endpoint = currentAction === 'buy' ? '/api/shop/buy' : '/api/shop/sell';
    const payload = {
        tg_id: user.tg_id,
        item_id: currentShopItem.id,
        quantity: currentShopQuantity
    };
    const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    if (response && response.success) {
        // Обновляем локальные данные пользователя
        user.balance = response.new_balance;
        user.acorns = response.new_acorns;
        user.plant_acorns = response.new_plant_acorns;
        // Обновляем UI
        updateUI();
        tg.HapticFeedback.notificationOccurred('success');
        showToast(`${currentAction === 'buy' ? 'Куплено' : 'Продано'} ${currentShopQuantity}x ${currentShopItem.name}`);
    } else {
        tg.HapticFeedback.notificationOccurred('error');
        showToast(response?.error || "Ошибка операции");
    }
}

export { resetShopState, loadShopItems, selectShopItem, toggleAction, updateTradeButton, updateShopItemPrices, updatePriceDisplay, onQtyInput, performTransaction };