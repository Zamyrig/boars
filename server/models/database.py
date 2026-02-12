import sqlite3
import os
from datetime import datetime

DB_PATH = './database.db'

def get_db_connection():
    """Получение подключения к базе данных"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

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
                cursor.execute('''
                    INSERT INTO users
                    (tg_id, username, display_name, balance, total_games, wins, lose, private_profile)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                ''', (
                    tg_id_clean,
                    str(user_data.get('username', '')).strip(),
                    str(user_data.get('display_name', 'Аноним')).strip(),
                    int(user_data.get('balance', 1000)),
                    int(user_data.get('total_games', 0)),
                    int(user_data.get('wins', 0)),
                    int(user_data.get('lose', 0))
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

def init_db():
    """Инициализация базы данных и создание/обновление таблиц"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # --- СОЗДАНИЕ ТАБЛИЦЫ USERS ---
    # Создаём таблицу с минимальной структурой (без acorns и plant_acorns), если её нет
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

    # --- ПРОВЕРКА И ДОБАВЛЕНИЕ СТОЛБЦОВ acorns и plant_acorns ---
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]
    if 'acorns' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN acorns INTEGER DEFAULT 0')
        print("Столбец 'acorns' добавлен в таблицу 'users'.")
    if 'plant_acorns' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN plant_acorns INTEGER DEFAULT 0')
        print("Столбец 'plant_acorns' добавлен в таблицу 'users'.")

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