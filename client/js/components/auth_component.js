import { tg, setUser } from './modules/global_state.js';
import { apiFetch } from './api/api_client.js';
import { updateUI } from './utils/ui_updater.js';
import { nav } from './utils/navigation.js';

async function auth() {
    const tgUser = tg.initDataUnsafe?.user || {id: "dev_user", username: "kaban", first_name: "Хряк"};
    const userData = await apiFetch('/api/auth', {
        method: 'POST',
        body: JSON.stringify({tg_id: tgUser.id, username: tgUser.username, first_name: tgUser.first_name})
    });
    if (userData) {
        setUser(userData);
        updateUI();
        nav('scr-main');
    }
}

export { auth };