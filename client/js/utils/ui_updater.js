import { user } from './modules/global_state.js';

function updateUI() {
    if (!user) return;
    // --- ИСПРАВЛЕНИЕ 2: Обновление баланса и желудей в интерфейсе ---
    document.getElementById('bal-val').innerText = user.balance.toLocaleString();
    document.getElementById('acorns-val').innerText = user.acorns.toLocaleString(); // Обновляем количество желудей
    // --- КОНЕЦ ИСПРАВЛЕНИЯ 2 ---
    document.getElementById('edit-name').value = user.display_name || user.username || "";
    document.getElementById('st-games').innerText = user.total_games || 0;
    document.getElementById('st-wins').innerText = user.wins || 0;
    document.getElementById('st-lose').innerText = user.lose || 0;
    const wr = user.total_games > 0 ? Math.round((user.wins / user.total_games) * 100) : 0;
    document.getElementById('st-wr').innerText = wr + "%";
    const toggle = document.getElementById('private-profile-toggle');
    if (toggle) toggle.checked = !!user.private_profile;
}

export { updateUI };