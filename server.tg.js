const express = require('express');
const cors = require('cors');
const app = express();

// Настройки
const PORT = 5000;

app.use(cors()); 
app.use(express.json());

// Локальная база данных (в памяти, можно заменить на sqlite3)
let db = {
  users: {
    "test_user": { id: "test_user", name: "Боевой Кабан", balance: 5000, wins: 10, lose: 5, total_games: 15 }
  }
};

// Эндпоинт для получения данных игрока
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  if (!db.users[userId]) {
    // Если юзера нет, создаем нового в локальной базе
    db.users[userId] = { 
      id: userId, 
      name: "Новый Боец", 
      balance: 1000, 
      wins: 0, 
      lose: 0, 
      total_games: 0 
    };
  }
  console.log(`Данные запрошены для: ${userId}`);
  res.json(db.users[userId]);
});

// Эндпоинт для сохранения результатов боя
app.post('/api/save-result', (req, res) => {
  const { userId, newBalance, isWin } = req.body;
  
  if (db.users[userId]) {
    db.users[userId].balance = newBalance;
    db.users[userId].total_games += 1;
    if (isWin) {
      db.users[userId].wins += 1;
    } else {
      db.users[userId].lose += 1;
    }
    console.log(`Результат сохранен для ${userId}. Новый баланс: ${newBalance}`);
    res.json({ success: true, userData: db.users[userId] });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

// Эндпоинт для лидерборда
app.get('/api/leaderboard', (req, res) => {
  const players = Object.values(db.users)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);
  res.json(players);
});

app.listen(PORT, () => {
  console.log(`--- СЕРВЕР ЗАПУЩЕН ---`);
  console.log(`Локальный адрес: http://localhost:${PORT}`);
  console.log(`Для Telegram используй ngrok: ngrok http ${PORT}`);
});