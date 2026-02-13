from flask import Flask, request, jsonify, send_file, send_from_directory
import os
import sqlite3
from datetime import datetime, timedelta
import random
# Включение CORS
from flask_cors import CORS
import json

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
PORT = 3000
DB_PATH = './database.db'
STATIC_PATH = os.path.join(os.path.dirname(__file__), 'assets')

CORS(app)

### --- НАЧАЛО: ОПРЕДЕЛЕНИЕ ФУНКЦИЙ ---

def migrate_from_json_manual_call():
    """Миграция данных из старого database.json в SQLite (для внутреннего использования)."""
    import json
    json_path = './database.json'
    if not os.path.exists(json_path):
        return {'error': 'database.json not found'}
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            old_data = json.load(f)

        conn = get_db_connection()
        cursor = conn.cursor()

        migrated = 0
        for tg_id, user_data in old_data.get('users', {}).items():
            tg_id_clean = tg_id.strip()
            cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id_clean,))
            exists = cursor.fetchone()

            if not exists:
                balance = int(user_data.get('balance', 1000))
                # Добавлены столбцы last_watched_timestamp и watched_cooldown_ends
                cursor.execute('''
                    INSERT INTO users
                    (tg_id, username, display_name, balance, total_games, wins, lose, private_profile, max_balance, watched_battles, last_watched_timestamp, watched_cooldown_ends)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, NULL, NULL)
                ''', (
                    tg_id_clean,
                    str(user_data.get('username', '')).strip(),
                    str(user_data.get('display_name', 'Аноним')).strip(),
                    balance,
                    int(user_data.get('total_games', 0)),
                    int(user_data.get('wins', 0)),
                    int(user_data.get('lose', 0)),
                    balance # Изначальный max_balance равен текущему
                ))
                migrated += 1
            else:
                print(f"Пользователь {tg_id_clean} уже существует в базе данных, пропускаем.")

        conn.commit()
        conn.close()

        if migrated > 0:
            return {
                'success': True,
                'migrated': migrated,
                'message': f'Успешно перенесено {migrated} новых пользователей'
            }
        else:
            return {
                'success': True,
                'migrated': 0,
                'message': 'Все пользователи из JSON уже существовали в базе данных.'
            }

    except Exception as e:
        print(f"Ошибка миграции: {e}")
        return {'error': str(e)}

def migrate_from_json_on_startup():
    """
    Функция для автоматического вызова миграции при запуске сервера.
    """
    json_path = './database.json'
    if os.path.exists(json_path):
        print("Найден старый файл database.json, запускаем миграцию...")
        result = migrate_from_json_manual_call()
        if result and result.get('success'):
            print("Миграция завершена успешно.")
            try:
                os.remove(json_path)
                print("Старый файл database.json удален.")
            except OSError as e:
                print(f"Ошибка при удалении database.json: {e}")
        else:
            print("Миграция не удалась или не была выполнена.")
    else:
        print("Файл database.json не найден, миграция не требуется.")

def get_db_connection():
    """Получение подключения к базе данных"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Инициализация базы данных и создание/обновление таблиц"""
    conn = get_db_connection()
    cursor = conn.cursor()
    # --- СОЗДАНИЕ ТАБЛИЦЫ USERS ---
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
    tg_id TEXT PRIMARY KEY,
    username TEXT DEFAULT '',
    display_name TEXT NOT NULL,
    balance INTEGER DEFAULT 1000,
    total_games INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    lose INTEGER DEFAULT 0,
    private_profile BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    # --- ПРОВЕРКА И ДОБАВЛЕНИЕ НОВЫХ СТОЛБЦОВ ---
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]

    if 'acorns' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN acorns INTEGER DEFAULT 0')
        print("Столбец 'acorns' добавлен.")
    if 'plant_acorns' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN plant_acorns INTEGER DEFAULT 0')
        print("Столбец 'plant_acorns' добавлен.")
    if 'max_balance' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN max_balance INTEGER DEFAULT 1000')
        # Обновим max_balance для существующих пользователей, чтобы он был равен текущему балансу
        cursor.execute('UPDATE users SET max_balance = balance WHERE max_balance = 1000 AND balance > 1000')
        print("Столбец 'max_balance' добавлен.")
    if 'watched_battles' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN watched_battles INTEGER DEFAULT 0')
        print("Столбец 'watched_battles' добавлен.")
    # --- НОВЫЕ СТОЛБЦЫ ДЛЯ КУЛАКА ПРОСМОТРА ---
    if 'last_watched_timestamp' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN last_watched_timestamp TIMESTAMP DEFAULT NULL')
        print("Столбец 'last_watched_timestamp' добавлен.")
    if 'watched_cooldown_ends' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN watched_cooldown_ends TIMESTAMP DEFAULT NULL')
        print("Столбец 'watched_cooldown_ends' добавлен.")

    # --- СОЗДАНИЕ ТАБЛИЦЫ battle_history ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS battle_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id TEXT NOT NULL,
            opponent_display_name TEXT,
            bet_amount INTEGER DEFAULT 0,
            is_win BOOLEAN NOT NULL,
            reward_given BOOLEAN DEFAULT 0,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tg_id) REFERENCES users (tg_id)
        )
    ''')

    conn.commit()
    conn.close()
    print("База данных инициализирована/обновлена.")

def update_user_timestamp(tg_id):
    """Обновление времени последнего обновления пользователя"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (tg_id,))
    conn.commit()
    conn.close()

# Вспомогательная функция для проверки и обновления максимального баланса
def check_update_max_balance(cursor, tg_id, new_balance):
    cursor.execute('SELECT max_balance FROM users WHERE tg_id = ?', (tg_id,))
    res = cursor.fetchone()
    current_max = res['max_balance'] if res else 0
    if new_balance > current_max:
        cursor.execute('UPDATE users SET max_balance = ? WHERE tg_id = ?', (new_balance, tg_id))

### --- КОНЕЦ: ОПРЕДЕЛЕНИЕ ФУНКЦИЙ ---

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
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is None:
        display_name = first_name or username or 'Аноним'
        cursor.execute('''
            INSERT INTO users (tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles, last_watched_timestamp, watched_cooldown_ends)
            VALUES (?, ?, ?, 1000, 0, 0, 0, 0, 0, 0, 1000, 0, NULL, NULL)
        ''', (tg_id, username or '', display_name))
        conn.commit()
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()
    else:
        if username and user['username'] != username:
            cursor.execute('''
                UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP
                WHERE tg_id = ?
            ''', (username, tg_id))
            conn.commit()
            cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
            user = cursor.fetchone()

    conn.close()

    # Преобразование дат в строки для JSON (исправлено)
    # Теперь мы работаем со строками, возвращёнными SQLite, и не пытаемся вызывать isoformat()
    last_watch_str = user['last_watched_timestamp'] if user['last_watched_timestamp'] else None
    cooldown_end_str = user['watched_cooldown_ends'] if user['watched_cooldown_ends'] else None

    return jsonify({
        'tg_id': user['tg_id'],
        'username': user['username'],
        'display_name': user['display_name'],
        'balance': user['balance'],
        'total_games': user['total_games'],
        'wins': user['wins'],
        'lose': user['lose'],
        'private_profile': bool(user['private_profile']),
        'acorns': user['acorns'],
        'plant_acorns': user['plant_acorns'],
        'max_balance': user['max_balance'],
        'watched_battles': user['watched_battles'],
        # Новые поля для клиента
        'last_watched_timestamp': last_watch_str,
        'watched_cooldown_ends': cooldown_end_str
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

# 4.1 Установка приватности профиля
@app.route('/api/user/set-private', methods=['POST'])
def set_private():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_private = bool(data.get('is_private'))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
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

# 5. Просмотр боя
@app.route('/api/battle/watch', methods=['POST'])
def watch_battle():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        # Проверяем кулдаун
        now = datetime.now() # Используем datetime.now() для корректного формата
        cooldown_ends_str = user['watched_cooldown_ends']
        if cooldown_ends_str:
            # Преобразуем строку в datetime объект для сравнения
            cooldown_ends = datetime.fromisoformat(cooldown_ends_str.replace('Z', '+00:00').replace('Z', ''))
            if now < cooldown_ends:
                # Кулдаун ещё не прошёл
                conn.close()
                return jsonify({
                    'success': False,
                    'error': 'Cooldown not finished',
                    'remaining_time': (cooldown_ends - now).total_seconds()
                }), 400

        # Кулдаун прошёл или не был установлен
        reward = 200 # Изменённое значение награды
        new_balance = user['balance'] + reward
        
        # Вычисляем время окончания кулдауна (через 2 часа)
        cooldown_duration = timedelta(hours=2)
        new_cooldown_ends = now + cooldown_duration

        # Обновляем баланс, счётчик просмотров и таймеры
        cursor.execute('''
            UPDATE users
            SET balance = ?,
                watched_battles = watched_battles + 1,
                last_watched_timestamp = ?,
                watched_cooldown_ends = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, now.isoformat(), new_cooldown_ends.isoformat(), tg_id))
        
        # Проверяем на рекорд баланса
        check_update_max_balance(cursor, tg_id, new_balance)

        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, 0, 1, 1)
        ''', (tg_id, f"Оппонент_{datetime.now().strftime('%S')}"))
        
        conn.commit()
        
        cursor.execute('SELECT balance, acorns, plant_acorns, max_balance, watched_battles, last_watched_timestamp, watched_cooldown_ends FROM users WHERE tg_id = ?', (tg_id,))
        updated_user = cursor.fetchone()
        conn.close()

        # Преобразование дат в строки для JSON (исправлено)
        last_watch_str = updated_user['last_watched_timestamp'] if updated_user['last_watched_timestamp'] else None
        cooldown_end_str = updated_user['watched_cooldown_ends'] if updated_user['watched_cooldown_ends'] else None

        return jsonify({
            'success': True,
            'new_balance': updated_user['balance'],
            'acorns': updated_user['acorns'],
            'plant_acorns': updated_user['plant_acorns'],
            'max_balance': updated_user['max_balance'],
            'watched_battles': updated_user['watched_battles'],
            'reward': reward,
            'last_watched_timestamp': last_watch_str,
            'watched_cooldown_ends': cooldown_end_str
        })
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

# 6. Новый эндпоинт для начала боя - SERVER SIDE AUTHORITY
@app.route('/api/battle/start', methods=['POST'])
def start_battle():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    bet_amount = int(data.get('bet_amount'))

    if bet_amount <= 0:
        return jsonify({'error': 'Bet amount must be greater than 0'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT balance FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is None:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    if user['balance'] < bet_amount:
        conn.close()
        return jsonify({'error': 'Not enough balance'}), 400

    # Рассчитываем исход боя на сервере
    is_win = random.choice([True, False])

    # Обновляем баланс сразу
    new_balance = user['balance']
    if is_win:
        new_balance += bet_amount
        # Проверяем на рекорд баланса только при победе
        check_update_max_balance(cursor, tg_id, new_balance)
    else:
        new_balance -= bet_amount

    # Обновляем статистику
    cursor.execute('''
        UPDATE users
        SET total_games = total_games + 1,
            balance = ?,
            wins = wins + ?,
            lose = lose + ?
        WHERE tg_id = ?
    ''', (new_balance, 1 if is_win else 0, 0 if is_win else 1, tg_id))

    # Сохраняем историю боя
    cursor.execute('''
        INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
        VALUES (?, ?, ?, ?, 0)
    ''', (tg_id, f"Оппонент_{datetime.now().strftime('%S')}", bet_amount, int(is_win)))

    conn.commit()
    conn.close()

    # Возвращаем результат
    reward = bet_amount if is_win else -bet_amount
    return jsonify({
        'success': True,
        'is_win': is_win,
        'new_balance': new_balance,
        'reward': reward,
        'bet_amount': bet_amount
    })

# 7. Рейтинг (Топ 10)
@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles
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
        'private_profile': bool(row['private_profile']),
        'acorns': row['acorns'],
        'plant_acorns': row['plant_acorns'],
        'max_balance': row['max_balance'],
        'watched_battles': row['watched_battles']
    } for row in players]
    return jsonify(result)

# 8. Полный рейтинг
@app.route('/api/leaderboard/full', methods=['GET'])
def full_leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles
    FROM users
    ORDER BY balance DESC
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
        'private_profile': bool(row['private_profile']),
        'acorns': row['acorns'],
        'plant_acorns': row['plant_acorns'],
        'max_balance': row['max_balance'],
        'watched_battles': row['watched_battles']
    } for row in players]
    return jsonify(result)

# 9. Получение информации о пользователе
@app.route('/api/user/<tg_id>', methods=['GET'])
def get_user(tg_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()
    if user is not None:
        # Преобразование дат в строки для JSON (исправлено)
        last_watch_str = user['last_watched_timestamp'] if user['last_watched_timestamp'] else None
        cooldown_end_str = user['watched_cooldown_ends'] if user['watched_cooldown_ends'] else None

        return jsonify({
            'tg_id': user['tg_id'],
            'username': user['username'],
            'display_name': user['display_name'],
            'balance': user['balance'],
            'total_games': user['total_games'],
            'wins': user['wins'],
            'lose': user['lose'],
            'private_profile': bool(user['private_profile']),
            'acorns': user['acorns'],
            'plant_acorns': user['plant_acorns'],
            'max_balance': user['max_balance'],
            'watched_battles': user['watched_battles'],
            'created_at': user['created_at'],
            'updated_at': user['updated_at'],
            # Новые поля для клиента
            'last_watched_timestamp': last_watch_str,
            'watched_cooldown_ends': cooldown_end_str
        })
    else:
        return jsonify({'error': 'User not found'}), 404

# 10. Миграция из JSON (API)
@app.route('/api/migrate', methods=['POST'])
def migrate_from_json():
    result = migrate_from_json_manual_call()
    if result.get('success'):
        return jsonify(result)
    else:
        return jsonify(result), 500

### === ЭНДПИНТЫ ДЛЯ МАГАЗИНА ===

# 11. Получение списка предметов магазина
@app.route('/api/shop/items', methods=['GET'])
def shop_items():
    try:
        with open('prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except FileNotFoundError:
        print("Файл prices.json не найден.")
        prices = {}
    except json.JSONDecodeError:
        print("Ошибка чтения prices.json.")
        prices = {}

    # Defaults
    def_prices = {
          "plant_acorn": { "buy": 1000,  "sell": 800},
          "acorn": { "buy": 200,  "sell": 150}
    }

    items = [
        {
              "id":  "acorn",
              "name":  "Желудь",
              "icon":  "acorn.png",
              "price": prices.get("acorn", {}).get("buy", def_prices["acorn"]["buy"]),
              "sell_price": prices.get("acorn", {}).get("sell", def_prices["acorn"]["sell"]),
              "description":  "Основной ресурс для выращивания."
        },
        {
              "id":  "plant_acorn",
              "name":  "Росток",
              "icon":  "plant_acorn.png",
              "price": prices.get("plant_acorn", {}).get("buy", def_prices["plant_acorn"]["buy"]),
              "sell_price": prices.get("plant_acorn", {}).get("sell", def_prices["plant_acorn"]["sell"]),
              "description":  "Готовый к посадке росток."
        }
    ]
    return jsonify(items)

# 12. Получение инвентаря пользователя
@app.route('/api/user/inventory', methods=['GET'])
def user_inventory():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT acorns, plant_acorns FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()

    if user:
        return jsonify({
            'acorns': user['acorns'],
            'plant_acorns': user['plant_acorns']
        })
    else:
        return jsonify({'error': 'User not found'}), 404

# 13. Покупка предмета
@app.route('/api/shop/buy', methods=['POST'])
def shop_buy():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    item_id = data.get('item_id')
    quantity = int(data.get('quantity', 1))

    if quantity <= 0:
        return jsonify({'error': 'Quantity must be > 0'}), 400

    try:
        with open('prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except:
        prices = {
              "plant_acorn": { "buy": 1000,  "sell": 800},
              "acorn": { "buy": 200,  "sell": 150}
        }

    price_per_unit = prices.get(item_id, {}).get("buy", 0)
    if price_per_unit == 0:
        return jsonify({'error': 'Invalid item_id or no buy price defined'}), 400

    total_cost = price_per_unit * quantity

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT balance, acorns, plant_acorns FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    if user['balance'] < total_cost:
        conn.close()
        return jsonify({'error': 'Not enough gold'}), 400

    new_balance = user['balance'] - total_cost
    if item_id == 'acorn':
        new_acorns = user['acorns'] + quantity
        cursor.execute('''
            UPDATE users SET balance = ?, acorns = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, new_acorns, tg_id))
    elif item_id == 'plant_acorn':
        new_plant_acorns = user['plant_acorns'] + quantity
        cursor.execute('''
            UPDATE users SET balance = ?, plant_acorns = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, new_plant_acorns, tg_id))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'new_balance':  new_balance,
        'new_acorns': new_acorns if item_id == 'acorn' else user['acorns'],
        'new_plant_acorns': new_plant_acorns if item_id == 'plant_acorn' else user['plant_acorns']
    })

# 14. Продажа предмета
@app.route('/api/shop/sell', methods=['POST'])
def shop_sell():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    item_id = data.get('item_id')
    quantity = int(data.get('quantity', 1))

    if quantity <= 0:
        return jsonify({'error': 'Quantity must be > 0'}), 400

    try:
        with open('prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except:
        prices = {
              "plant_acorn": { "buy": 1000,  "sell": 800},
              "acorn": { "buy": 200,  "sell": 150}
        }

    sell_price_per_unit = prices.get(item_id, {}).get("sell", 0)
    if sell_price_per_unit == 0:
        return jsonify({'error': 'Invalid item_id or no sell price defined'}), 400

    total_reward = sell_price_per_unit * quantity

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT balance, acorns, plant_acorns, max_balance FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    if item_id == 'acorn' and user['acorns'] < quantity:
        conn.close()
        return jsonify({'error': 'Not enough acorns'}), 400
    if item_id == 'plant_acorn' and user['plant_acorns'] < quantity:
        conn.close()
        return jsonify({'error': 'Not enough plant_acorns'}), 400

    new_balance = user['balance'] + total_reward

    # Обновление макс баланса при продаже
    if new_balance > user['max_balance']:
        cursor.execute('UPDATE users SET max_balance = ? WHERE tg_id = ?', (new_balance, tg_id))

    if item_id == 'acorn':
        new_acorns = user['acorns'] - quantity
        cursor.execute('''
            UPDATE users SET balance = ?, acorns = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, new_acorns, tg_id))
    elif item_id == 'plant_acorn':
        new_plant_acorns = user['plant_acorns'] - quantity
        cursor.execute('''
            UPDATE users SET balance = ?, plant_acorns = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, new_plant_acorns, tg_id))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'new_acorns': new_acorns if item_id == 'acorn' else user['acorns'],
        'new_plant_acorns': new_plant_acorns if item_id == 'plant_acorn' else user['plant_acorns']
    })

### --- ИНИЦИАЛИЗАЦИЯ И ЗАПУСК ПРИЛОЖЕНИЯ ---

if __name__ == '__main__':
    init_db()
    migrate_from_json_on_startup()
    print(f'Сервер запущен: http://localhost:{PORT}')
    print(f'База данных: {DB_PATH}')
    print(f'Статика раздается из: {STATIC_PATH}')
    print(f'Папка существует? {os.path.exists(STATIC_PATH)}')
    app.run(host='0.0.0.0', port=PORT, debug=True)