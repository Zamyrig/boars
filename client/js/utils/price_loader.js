import { prices, setPrices } from '../modules/global_state.js';

async function loadPrices() {
    try {
        const response = await fetch('prices.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const newPrices = await response.json();
        setPrices(newPrices);
        console.log("Цены загружены:", newPrices);
    } catch (error) {
        console.error("Ошибка загрузки prices.json:", error);
        // Устанавливаем цены по умолчанию в случае ошибки
        const defaultPrices = {
            "plant_acorn": {"buy": 1000, "sell": 800},
            "acorn": {"buy": 200, "sell": 150}
        };
        setPrices(defaultPrices);
    }
}

export { loadPrices, prices };