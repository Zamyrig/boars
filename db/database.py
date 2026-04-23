import os
import sqlite3
import json
from datetime import datetime

DB_PATH = os.environ.get('DB_PATH', './database.db')


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
        'acorns':               'INTEGER DEFAULT 0',
        'plant_acorns':         'INTEGER DEFAULT 1',
        'max_balance':          'INTEGER DEFAULT 1000',
        'watched_battles':      'INTEGER DEFAULT 0',
        'last_watch_reward_at': 'TIMESTAMP DEFAULT NULL',
        'last_seen':            'TIMESTAMP DEFAULT NULL',
        'potion_hp':            'INTEGER DEFAULT 0',
        'potion_sta':           'INTEGER DEFAULT 0',
        'mine_potion_drops':    'INTEGER DEFAULT 0',
        'defeated_bosses':      "TEXT DEFAULT '[]'",
        'farm_owned':           'INTEGER DEFAULT 0',
        'skin_id':              "TEXT DEFAULT 'boar_sobchak'",  # ← скин
    }

    for col, col_def in new_columns.items():
        if col not in columns:
            cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {col_def}')
            print(f"Столбец '{col}' добавлен.")
            if col == 'max_balance':
                cursor.execute(
                    'UPDATE users SET max_balance = balance '
                    'WHERE max_balance = 1000 AND balance > 1000'
                )

    # ── Таблица купленных скинов ──────────────────────────────
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_skins (
            tg_id TEXT NOT NULL,
            skin_id TEXT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            price_paid INTEGER DEFAULT 0,
            PRIMARY KEY (tg_id, skin_id)
        )
    ''')

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
        cursor.execute(
            'UPDATE users SET max_balance = ? WHERE tg_id = ?',
            (new_balance, tg_id)
        )


def migrate_from_json_manual_call():
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
                    (tg_id, username, display_name, balance, total_games, wins, lose,
                     private_profile, max_balance, watched_battles)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
                ''', (
                    tg_id_clean,
                    str(user_data.get('username', '')).strip(),
                    str(user_data.get('display_name', 'Аноним')).strip(),
                    balance,
                    int(user_data.get('total_games', 0)),
                    int(user_data.get('wins', 0)),
                    int(user_data.get('lose', 0)),
                    balance,
                ))
                migrated += 1

        conn.commit()
        conn.close()

        return {
            'success': True,
            'migrated': migrated,
            'message': f'Успешно перенесено {migrated} новых пользователей',
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