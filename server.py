from flask import Flask, request, jsonify, send_file, send_from_directory
import os
import sqlite3
import random
from datetime import datetime, timedelta
from flask_cors import CORS
import json

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
app.config['APPLICATION_ROOT'] = os.environ.get('APP_ROOT', '/boar-game')
PORT = int(os.environ.get('PORT', 3000))
DB_PATH = os.environ.get('DB_PATH', './database.db')
STATIC_PATH = os.path.join(os.path.dirname(__file__), 'assets')
CORS(app)
WATCH_REWARD = 200
WATCH_COOLDOWN_HOURS = 2
# --- ФУНКЦИИ ---

def migrate_from_json_manual_call():
    """Миграция данных из старого database.json в SQLite."""
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
                cursor.execute('''
                    INSERT INTO users
                    (tg_id, username, display_name, balance, total_games, wins, lose, private_profile, max_balance, watched_battles)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
                ''', (
                    tg_id_clean,
                    str(user_data.get('username', '')).strip(),
                    str(user_data.get('display_name', 'Аноним')).strip(),
                    balance,
                    int(user_data.get('total_games', 0)),
                    int(user_data.get('wins', 0)),
                    int(user_data.get('lose', 0)),
                    balance
                ))
                migrated += 1

        conn.commit()
        conn.close()

        return {
            'success': True,
            'migrated': migrated,
            'message': f'Успешно перенесено {migrated} новых пользователей'
        }

    except Exception as e:
        print(f"Ошибка миграции: {e}")
        return {'error': str(e)}


def migrate_from_json_on_startup():
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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

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

    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]

    new_columns = {
        'acorns': 'INTEGER DEFAULT 0',
        'plant_acorns': 'INTEGER DEFAULT 0',
        'max_balance': 'INTEGER DEFAULT 1000',
        'watched_battles': 'INTEGER DEFAULT 0',
        'last_watch_reward_at': 'TIMESTAMP DEFAULT NULL',
    }

    for col, col_def in new_columns.items():
        if col not in columns:
            cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {col_def}')
            print(f"Столбец '{col}' добавлен.")
            if col == 'max_balance':
                cursor.execute('UPDATE users SET max_balance = balance WHERE max_balance = 1000 AND balance > 1000')

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


def check_update_max_balance(cursor, tg_id, new_balance):
    cursor.execute('SELECT max_balance FROM users WHERE tg_id = ?', (tg_id,))
    res = cursor.fetchone()
    current_max = res['max_balance'] if res else 0
    if new_balance > current_max:
        cursor.execute('UPDATE users SET max_balance = ? WHERE tg_id = ?', (new_balance, tg_id))


# --- РОУТЫ ---

@app.route('/')
def index():
    frontend_path = os.path.join(os.path.dirname(__file__), 'index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return 'Сервер КАБАНОВ запущен!'


@app.route('/assets/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_PATH, filename)


@app.route('/prices.json')
def serve_prices():
    prices_path = os.path.join(os.path.dirname(__file__), 'prices.json')
    return send_file(prices_path)


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
            INSERT INTO users (tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles, last_watch_reward_at)
            VALUES (?, ?, ?, 1000, 0, 0, 0, 0, 0, 0, 1000, 0, NULL)
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

    # Вычисляем секунды до конца кулдауна просмотра
    watch_cooldown_remaining = 0
    if user['last_watch_reward_at']:
        try:
            last_watch = datetime.fromisoformat(str(user['last_watch_reward_at']))
            cooldown_end = last_watch + timedelta(hours=WATCH_COOLDOWN_HOURS)
            remaining = (cooldown_end - datetime.utcnow()).total_seconds()
            watch_cooldown_remaining = max(0, int(remaining))
        except Exception:
            watch_cooldown_remaining = 0

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
        'watch_cooldown_remaining': watch_cooldown_remaining,
        'watch_reward': WATCH_REWARD,
    })


@app.route('/api/user/update-name', methods=['POST'])
def update_name():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    display_name = data.get('display_name')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        cursor.execute('UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (display_name, tg_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'display_name': display_name})
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404


@app.route('/api/user/set-private', methods=['POST'])
def set_private():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_private = bool(data.get('is_private'))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if user is not None:
        cursor.execute('UPDATE users SET private_profile = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (1 if is_private else 0, tg_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'is_private': is_private})
    else:
        conn.close()
        return jsonify({'error': 'User not found'}), 404


@app.route('/api/battle/watch', methods=['POST'])
def watch_battle():
    """
    Просмотр боя. Всегда разрешен.
    Награда 200 монет выдается только если прошло 2 часа с последнего вознаграждения.
    """
    data = request.get_json()
    tg_id = str(data.get('tg_id'))

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()

        if not user:
            conn.rollback()
            conn.close()
            return jsonify({'error': 'User not found'}), 404

        now = datetime.utcnow()
        reward_given = False
        reward = 0

        # Проверяем кулдаун
        can_reward = True
        if user['last_watch_reward_at']:
            try:
                last_watch = datetime.fromisoformat(str(user['last_watch_reward_at']))
                cooldown_end = last_watch + timedelta(hours=WATCH_COOLDOWN_HOURS)
                if now < cooldown_end:
                    can_reward = False
            except Exception:
                can_reward = True

        new_balance = user['balance']
        new_last_watch = user['last_watch_reward_at']

        if can_reward:
            reward = WATCH_REWARD
            new_balance += reward
            new_last_watch = now.isoformat()
            reward_given = True
            check_update_max_balance(cursor, tg_id, new_balance)

        cursor.execute('''
            UPDATE users
            SET balance = ?,
                watched_battles = watched_battles + 1,
                last_watch_reward_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, new_last_watch, tg_id))

        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, 0, 1, ?)
        ''', (tg_id, f"Оппонент_{now.strftime('%S')}", int(reward_given)))

        conn.commit()

        # Вычисляем новый кулдаун
        watch_cooldown_remaining = 0
        if new_last_watch:
            try:
                last_watch_dt = datetime.fromisoformat(str(new_last_watch))
                cooldown_end = last_watch_dt + timedelta(hours=WATCH_COOLDOWN_HOURS)
                remaining = (cooldown_end - now).total_seconds()
                watch_cooldown_remaining = max(0, int(remaining))
            except Exception:
                watch_cooldown_remaining = 0

        cursor.execute('SELECT balance, acorns, plant_acorns, max_balance, watched_battles FROM users WHERE tg_id = ?', (tg_id,))
        updated_user = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'new_balance': updated_user['balance'],
            'acorns': updated_user['acorns'],
            'plant_acorns': updated_user['plant_acorns'],
            'max_balance': updated_user['max_balance'],
            'watched_battles': updated_user['watched_battles'],
            'reward': reward,
            'reward_given': reward_given,
            'watch_cooldown_remaining': watch_cooldown_remaining,
        })

    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"Watch battle error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/battle/init', methods=['POST'])
def battle_init():
    """
    Инициализация боя:
    1. Проверяем баланс
    2. Списываем ставку АТОМАРНО
    3. Считаем результат
    4. Начисляем выигрыш если победа
    5. Возвращаем результат клиенту
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    tg_id = str(data.get('tg_id'))
    try:
        bet_amount = int(data.get('bet_amount', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid bet amount'}), 400

    if bet_amount < 10:
        return jsonify({'error': 'Minimum bet is 10'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()

        if not user:
            conn.rollback()
            conn.close()
            return jsonify({'error': 'User not found'}), 404

        if user['balance'] < bet_amount:
            conn.rollback()
            conn.close()
            return jsonify({'error': 'Insufficient balance'}), 400

        # Списываем ставку сразу
        new_balance = user['balance'] - bet_amount

        # Считаем результат
        is_win = random.choice([True, False])
        reward = 0
        opponent = "Клыкач"

        if is_win:
            reward = bet_amount * 2
            new_balance += reward
            cursor.execute('''
                UPDATE users
                SET balance = ?, total_games = total_games + 1, wins = wins + 1, updated_at = CURRENT_TIMESTAMP
                WHERE tg_id = ?
            ''', (new_balance, tg_id))
        else:
            cursor.execute('''
                UPDATE users
                SET balance = ?, total_games = total_games + 1, lose = lose + 1, updated_at = CURRENT_TIMESTAMP
                WHERE tg_id = ?
            ''', (new_balance, tg_id))

        check_update_max_balance(cursor, tg_id, new_balance)

        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, ?, ?, ?)
        ''', (tg_id, opponent, bet_amount, int(is_win), int(is_win)))

        conn.commit()

        cursor.execute('SELECT balance, acorns, plant_acorns, max_balance, watched_battles FROM users WHERE tg_id = ?', (tg_id,))
        updated_user = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'is_win': is_win,
            'reward': reward,
            'new_balance': updated_user['balance'],
            'acorns': updated_user['acorns'],
            'plant_acorns': updated_user['plant_acorns'],
            'max_balance': updated_user['max_balance'],
            'watched_battles': updated_user['watched_battles'],
            'opponent': opponent,
        })

    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"Battle init error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles
        FROM users ORDER BY balance DESC LIMIT 10
    ''')
    players = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) | {'private_profile': bool(row['private_profile'])} for row in players])


@app.route('/api/leaderboard/full', methods=['GET'])
def full_leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles
        FROM users ORDER BY balance DESC
    ''')
    players = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) | {'private_profile': bool(row['private_profile'])} for row in players])


@app.route('/api/user/<tg_id>', methods=['GET'])
def get_user(tg_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()

    if user is not None:
        watch_cooldown_remaining = 0
        if user['last_watch_reward_at']:
            try:
                last_watch = datetime.fromisoformat(str(user['last_watch_reward_at']))
                cooldown_end = last_watch + timedelta(hours=WATCH_COOLDOWN_HOURS)
                remaining = (cooldown_end - datetime.utcnow()).total_seconds()
                watch_cooldown_remaining = max(0, int(remaining))
            except Exception:
                pass

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
            'watch_cooldown_remaining': watch_cooldown_remaining,
            'created_at': user['created_at'],
            'updated_at': user['updated_at'],
        })
    else:
        return jsonify({'error': 'User not found'}), 404


@app.route('/api/migrate', methods=['POST'])
def migrate_from_json():
    result = migrate_from_json_manual_call()
    if result.get('success'):
        return jsonify(result)
    else:
        return jsonify(result), 500


@app.route('/api/shop/items', methods=['GET'])
def shop_items():
    try:
        with open('prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except Exception:
        prices = {}

    def_prices = {
        "plant_acorn": {"buy": 1000, "sell": 800},
        "acorn": {"buy": 200, "sell": 150}
    }

    items = [
        {
            "id": "acorn",
            "name": "Желудь",
            "icon": "acorn.png",
            "price": prices.get("acorn", {}).get("buy", def_prices["acorn"]["buy"]),
            "sell_price": prices.get("acorn", {}).get("sell", def_prices["acorn"]["sell"]),
        },
        {
            "id": "plant_acorn",
            "name": "Росток",
            "icon": "plant_acorn.png",
            "price": prices.get("plant_acorn", {}).get("buy", def_prices["plant_acorn"]["buy"]),
            "sell_price": prices.get("plant_acorn", {}).get("sell", def_prices["plant_acorn"]["sell"]),
        }
    ]
    return jsonify(items)


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
        return jsonify({'acorns': user['acorns'], 'plant_acorns': user['plant_acorns']})
    else:
        return jsonify({'error': 'User not found'}), 404


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
    except Exception:
        prices = {"plant_acorn": {"buy": 1000, "sell": 800}, "acorn": {"buy": 200, "sell": 150}}

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
    new_acorns = user['acorns']
    new_plant_acorns = user['plant_acorns']

    if item_id == 'acorn':
        new_acorns += quantity
        cursor.execute('UPDATE users SET balance = ?, acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (new_balance, new_acorns, tg_id))
    elif item_id == 'plant_acorn':
        new_plant_acorns += quantity
        cursor.execute('UPDATE users SET balance = ?, plant_acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (new_balance, new_plant_acorns, tg_id))
    else:
        conn.close()
        return jsonify({'error': 'Unknown item'}), 400

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'new_acorns': new_acorns,
        'new_plant_acorns': new_plant_acorns,
    })


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
    except Exception:
        prices = {"plant_acorn": {"buy": 1000, "sell": 800}, "acorn": {"buy": 200, "sell": 150}}

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
    new_acorns = user['acorns']
    new_plant_acorns = user['plant_acorns']

    if new_balance > user['max_balance']:
        cursor.execute('UPDATE users SET max_balance = ? WHERE tg_id = ?', (new_balance, tg_id))

    if item_id == 'acorn':
        new_acorns -= quantity
        cursor.execute('UPDATE users SET balance = ?, acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (new_balance, new_acorns, tg_id))
    elif item_id == 'plant_acorn':
        new_plant_acorns -= quantity
        cursor.execute('UPDATE users SET balance = ?, plant_acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (new_balance, new_plant_acorns, tg_id))
    else:
        conn.close()
        return jsonify({'error': 'Unknown item'}), 400

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'new_acorns': new_acorns,
        'new_plant_acorns': new_plant_acorns,
    })


if __name__ == '__main__':
    init_db()
    migrate_from_json_on_startup()
    print(f'Сервер запущен: http://localhost:{PORT}')
    print(f'База данных: {DB_PATH}')
    print(f'Статика: {STATIC_PATH}')
    app.run(host='0.0.0.0', port=PORT, debug=True)
