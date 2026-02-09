from flask import Flask, request, jsonify, send_file, send_from_directory
import os
import sqlite3
from datetime import datetime
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
PORT = 3000
DB_PATH = './database.db'
STATIC_PATH = os.path.join(os.path.dirname(__file__), 'assets')

# Включение CORS
from flask_cors import CORS
CORS(app)

def get_db_connection():
    """Получение подключения к базе данных"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Инициализация базы данных и создание/обновление таблиц"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Проверяем, существует ли столбец private_profile
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'private_profile' not in columns:
        # Добавляем столбец, если его нет
        cursor.execute('ALTER TABLE users ADD COLUMN private_profile BOOLEAN DEFAULT 0')
        print("Столбец 'private_profile' добавлен в таблицу 'users'.")
    else:
        print("Столбец 'private_profile' уже существует в таблице 'users'.")

    # Обновляем основную структуру таблицы (CREATE TABLE IF NOT EXISTS всё равно выполнится, но не изменит существующую)
    # Лучше всего явно указать все колонки при ALTER, но для добавления новых это нормально.
    # Главное - убедиться, что таблица существует.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            tg_id TEXT PRIMARY KEY,
            username TEXT DEFAULT '',
            display_name TEXT NOT NULL,
            balance INTEGER DEFAULT 1000,
            total_games INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            lose INTEGER DEFAULT 0,
            private_profile BOOLEAN DEFAULT 0, -- Добавлено
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # --- НОВАЯ ТАБЛИЦА: История боёв ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS battle_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id TEXT NOT NULL,
            opponent_display_name TEXT, -- Имя оппонента (может быть рандомным)
            bet_amount INTEGER DEFAULT 0,
            is_win BOOLEAN NOT NULL,
            reward_given BOOLEAN DEFAULT 0, -- Для боёв без ставки
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tg_id) REFERENCES users (tg_id)
        )
    ''')
    # --- КОНЕЦ НОВОЙ ТАБЛИЦЫ ---

    conn.commit()
    conn.close()
    print("База данных инициализирована/обновлена.")

def update_user_timestamp(tg_id):
    """Обновление времени последнего обновления пользователя"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?
    ''', (tg_id,))
    conn.commit()
    conn.close()

# 1. Корневой путь
@app.route('/')
def index():
    frontend_path = os.path.join(os.path.dirname(__file__), 'index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return 'Сервер КАБАНОВ запущен! API доступно по адресу /api/...'

# 2. Статические файлы
@app.route('/assets/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_PATH, filename)

# 3. Авторизация
@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    username = data.get('username', '')
    first_name = data.get('first_name', '')
    conn = get_db_connection()
    cursor = conn.cursor()

    # Проверяем, существует ли пользователь
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is None:
        # Создаем нового пользователя
        display_name = first_name or username or 'Аноним'
        cursor.execute('''
            INSERT INTO users (tg_id, username, display_name, balance, total_games, wins, lose)
            VALUES (?, ?, ?, 1000, 0, 0, 0)
        ''', (tg_id, username or '', display_name))
        conn.commit()
        
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()
    else:
        # Обновляем username если он изменился
        if username and user['username'] != username:
            cursor.execute('''
                UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE tg_id = ?
            ''', (username, tg_id))
            conn.commit()
            cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
            user = cursor.fetchone()

    conn.close()

    return jsonify({
        'tg_id': user['tg_id'],
        'username': user['username'],
        'display_name': user['display_name'],
        'balance': user['balance'],
        'total_games': user['total_games'],
        'wins': user['wins'],
        'lose': user['lose'],
        'private_profile': bool(user['private_profile']) # Добавляем это поле
    })

# 4. Обновление имени
@app.route('/api/user/update-name', methods=['POST'])
def update_name():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    display_name = data.get('display_name')
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        cursor.execute('''
            UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE tg_id = ?
        ''', (display_name, tg_id))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'display_name': display_name})
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

# --- НОВЫЙ ЭНДПОИНТ ---
# 4.1 Установка приватности профиля
@app.route('/api/user/set-private', methods=['POST'])
def set_private():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_private = bool(data.get('is_private')) # Ожидается true или false
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        # Преобразуем boolean в integer для SQLite (False -> 0, True -> 1)
        private_int = 1 if is_private else 0
        cursor.execute('''
            UPDATE users SET private_profile = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE tg_id = ?
        ''', (private_int, tg_id))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'is_private': is_private})
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
# --- КОНЕЦ НОВОГО ЭНДПОИНТА ---

# ... (все остальные функции остаются без изменений) ...

# --- НОВЫЙ ЭНДПОИНТ: Просмотр боя ---
@app.route('/api/battle/watch', methods=['POST'])
def watch_battle():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        # Добавляем 1 кабанкойн за просмотр
        reward = 1  # Изменено с 10 на 1
        cursor.execute('''
            UPDATE users 
            SET balance = balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (reward, tg_id))

        # Записываем результат в историю
        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, 0, 1, 1) -- 0 ставка, win = 1, reward = 1
        ''', (tg_id, f"Оппонент_{datetime.now().strftime('%S')}")) # Просто имя для примера

        conn.commit()
        
        cursor.execute('SELECT balance FROM users WHERE tg_id = ?', (tg_id,))
        updated_user = cursor.fetchone()
        conn.close()
        
        return jsonify({'success': True, 'new_balance': updated_user['balance'], 'reward': reward})
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
# --- КОНЕЦ НОВОГО ЭНДПОИНТА ---
# 5. Результат боя (изменён)
@app.route('/api/battle/result', methods=['POST'])
def battle_result():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_win = data.get('is_win')
    bet_amount = data.get('bet_amount')
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        bet = int(bet_amount) if bet_amount else 0
        
        if is_win:
            # Победа
            cursor.execute('''
                UPDATE users 
                SET total_games = total_games + 1,
                    wins = wins + 1,
                    balance = balance + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tg_id = ?
            ''', (bet, tg_id))
        else:
            # Поражение
            cursor.execute('''
                UPDATE users 
                SET total_games = total_games + 1,
                    lose = lose + 1,
                    balance = balance - ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tg_id = ?
            ''', (bet, tg_id))
        
        # --- Запись в историю ---
        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, ?, ?, 0) -- reward = 0 для боёв со ставкой
        ''', (tg_id, f"Оппонент_{datetime.now().strftime('%S')}", bet, int(is_win))) # int для BOOLEAN
        # --- Конец записи ---
        
        conn.commit()
        
        cursor.execute('SELECT balance FROM users WHERE tg_id = ?', (tg_id,))
        updated_user = cursor.fetchone()
        conn.close()
        
        return jsonify({'success': True, 'new_balance': updated_user['balance']})
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

# 6. Рейтинг (Топ 10)
@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Включаем private_profile в выборку
    cursor.execute('''
        SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile
        FROM users
        ORDER BY balance DESC
        LIMIT 10
    ''')

    players = cursor.fetchall()
    conn.close()

    result = [{
        'tg_id': row['tg_id'],
        'username': row['username'],
        'display_name': row['display_name'],
        'balance': row['balance'],
        'total_games': row['total_games'],
        'wins': row['wins'],
        'lose': row['lose'],
        'private_profile': bool(row['private_profile']) # Преобразуем в boolean для JS
    } for row in players]

    return jsonify(result)

# 7. Получение информации о пользователе
@app.route('/api/user/<tg_id>', methods=['GET'])
def get_user(tg_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Включаем private_profile в выборку
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()

    if user is not None:
        return jsonify({
            'tg_id': user['tg_id'],
            'username': user['username'],
            'display_name': user['display_name'],
            'balance': user['balance'],
            'total_games': user['total_games'],
            'wins': user['wins'],
            'lose': user['lose'],
            'private_profile': bool(user['private_profile']), # Преобразуем в boolean для JS
            'created_at': user['created_at'],
            'updated_at': user['updated_at']
        })
    else:
        return jsonify({'error': 'User not found'}), 404

# 8. Миграция данных из JSON (если нужно)
@app.route('/api/migrate', methods=['POST'])
def migrate_from_json():
    """Миграция данных из старого database.json в SQLite"""
    import json
    json_path = './database.json'
    if not os.path.exists(json_path):
        return jsonify({'error': 'database.json not found'}), 404

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            old_data = json.load(f)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        migrated = 0
        for tg_id, user_data in old_data.get('users', {}).items():
            # Очищаем пробелы из ключей
            tg_id_clean = tg_id.strip()
            
            cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id_clean,))
            exists = cursor.fetchone()
            
            if not exists:
                cursor.execute('''
                    INSERT OR REPLACE INTO users 
                    (tg_id, username, display_name, balance, total_games, wins, lose, private_profile)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0) -- Добавляем default private_profile = 0
                ''', (
                    tg_id_clean,
                    str(user_data.get('username', '')).strip(),
                    str(user_data.get('display_name', 'Аноним')).strip(),
                    int(user_data.get('balance', 1000)),
                    int(user_data.get('total_games', 0)),
                    int(user_data.get('wins', 0)),
                    int(user_data.get('lose', 0))
                    # private_profile устанавливается в 0 по умолчанию
                ))
                migrated += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True, 
            'migrated': migrated,
            'message': f'Успешно перенесено {migrated} пользователей'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Инициализация базы данных при запуске
    init_db()
    print(f'Сервер запущен: http://localhost:{PORT}')
    print(f'База данных: {DB_PATH}')
    print(f'Статика раздается из: {STATIC_PATH}')
    print(f'Папка существует? {os.path.exists(STATIC_PATH)}')

    app.run(host='0.0.0.0', port=PORT, debug=True)