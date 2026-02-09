const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Путь к статике — папка assets рядом с server.js
const staticPath = path.join(__dirname, 'assets');
app.use('/assets', express.static(staticPath));

// Имитация базы данных
const DB_FILE = './database.json';

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) return { users: {} };
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return data ? JSON.parse(data) : { users: {} };
    } catch (e) {
        console.error("Ошибка чтения базы данных:", e);
        return { users: {} };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Ошибка записи в базу данных:", e);
    }
}

// Корневой путь
app.get('/', (req, res) => {
    const frontendPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(frontendPath)) {
        res.sendFile(frontendPath);
    } else {
        res.send('Сервер КАБАНОВ запущен! API доступно по адресу /api/...');
    }
});

// 1. Авторизация
app.post('/api/auth', (req, res) => {
    const { tg_id, username, first_name } = req.body;
    const db = readDB();

    if (!db.users[tg_id]) {
        db.users[tg_id] = {
            tg_id,
            username: username || "",
            display_name: first_name || username || "Аноним",
            balance: 1000,
            total_games: 0,
            wins: 0,
            lose: 0
        };
        writeDB(db);
    } else {
        if (username) db.users[tg_id].username = username;
        writeDB(db);
    }

    res.json(db.users[tg_id]);
});

// 2. Обновление имени
app.post('/api/user/update-name', (req, res) => {
    const { tg_id, display_name } = req.body;
    const db = readDB();

    if (db.users[tg_id]) {
        db.users[tg_id].display_name = display_name;
        writeDB(db);
        res.json({ success: true, display_name });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// 3. Результат боя
app.post('/api/battle/result', (req, res) => {
    const { tg_id, is_win, bet_amount } = req.body;
    const db = readDB();
    const user = db.users[tg_id];

    if (user) {
        const bet = parseInt(bet_amount) || 0;
        user.total_games += 1;
        if (is_win) {
            user.wins += 1;
            user.balance += bet;
        } else {
            user.lose += 1;
            user.balance -= bet;
        }
        writeDB(db);
        res.json({ success: true, new_balance: user.balance });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// 4. Рейтинг (Топ 10)
app.get('/api/leaderboard', (req, res) => {
    const db = readDB();
    const players = Object.values(db.users)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10)
        .map(u => ({
            display_name: u.display_name,
            username: u.username,
            balance: u.balance,
            total_games: u.total_games,
            wins: u.wins,
            lose: u.lose
        }));
    res.json(players);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`Статика раздается из: ${staticPath}`);
    console.log(`Папка существует? ${fs.existsSync(staticPath)}`);
});