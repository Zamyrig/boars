from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from db.database import get_db_connection
import json

WATCH_COOLDOWN_HOURS = 2
WATCH_REWARD = 200

auth_bp = Blueprint('auth', __name__)
user_bp = Blueprint('user', __name__)


def _calc_watch_cooldown(last_watch_reward_at):
    if not last_watch_reward_at:
        return 0
    try:
        last_watch = datetime.fromisoformat(str(last_watch_reward_at))
        cooldown_end = last_watch + timedelta(hours=WATCH_COOLDOWN_HOURS)
        remaining = (cooldown_end - datetime.utcnow()).total_seconds()
        return max(0, int(remaining))
    except Exception:
        return 0


def _parse_defeated_bosses(raw):
    try:
        result = json.loads(raw) if raw else []
        return result if isinstance(result, list) else []
    except Exception:
        return []


def _get_owned_skins(cursor, tg_id):
    """Возвращает список skin_id, которые открыты у пользователя."""
    cursor.execute('SELECT skin_id FROM user_skins WHERE tg_id = ?', (tg_id,))
    rows = cursor.fetchall()
    skins = [r['skin_id'] for r in rows]
    # Дефолтный скин всегда доступен
    if 'boar_sobchak' not in skins:
        skins.insert(0, 'boar_sobchak')
    return skins


def _user_to_dict(user, cursor=None, watch_cooldown_remaining=None):
    if watch_cooldown_remaining is None:
        watch_cooldown_remaining = _calc_watch_cooldown(user['last_watch_reward_at'])
    keys = user.keys()

    owned_skins = ['boar_sobchak']
    if cursor:
        owned_skins = _get_owned_skins(cursor, user['tg_id'])

    return {
        'tg_id':                    user['tg_id'],
        'username':                 user['username'],
        'display_name':             user['display_name'],
        'balance':                  user['balance'],
        'total_games':              user['total_games'],
        'wins':                     user['wins'],
        'lose':                     user['lose'],
        'private_profile':          bool(user['private_profile']),
        'acorns':                   user['acorns'],
        'plant_acorns':             user['plant_acorns'],
        'max_balance':              user['max_balance'],
        'watched_battles':          user['watched_battles'],
        'watch_cooldown_remaining': watch_cooldown_remaining,
        'watch_reward':             WATCH_REWARD,
        'last_seen':                user['last_seen'],
        'potion_hp':                user['potion_hp']  if 'potion_hp'  in keys else 0,
        'potion_sta':               user['potion_sta'] if 'potion_sta' in keys else 0,
        'defeated_bosses':          _parse_defeated_bosses(
                                        user['defeated_bosses'] if 'defeated_bosses' in keys else '[]'
                                    ),
        'skin_id':                  user['skin_id'] if 'skin_id' in keys and user['skin_id']
                                        else 'boar_sobchak',
        'owned_skins':              owned_skins,
    }


# ── AUTH ──────────────────────────────────────────────────────

@auth_bp.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json()
    tg_id      = str(data.get('tg_id'))
    username   = data.get('username', '')
    first_name = data.get('first_name', '')

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    now = datetime.utcnow().isoformat()

    if user is None:
        display_name = first_name or username or 'Аноним'
        cursor.execute('''
            INSERT INTO users
            (tg_id, username, display_name, balance, total_games, wins, lose,
             private_profile, acorns, plant_acorns, max_balance, watched_battles,
             last_watch_reward_at, last_seen, potion_hp, potion_sta,
             defeated_bosses, skin_id)
            VALUES (?, ?, ?, 1000, 0, 0, 0, 0, 0, 0, 1000, 0, NULL, ?, 0, 0, '[]', 'boar_sobchak')
        ''', (tg_id, username or '', display_name, now))
        conn.commit()
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()
    else:
        update_fields = ['last_seen = ?', 'updated_at = CURRENT_TIMESTAMP']
        update_values = [now]
        if username and user['username'] != username:
            update_fields.append('username = ?')
            update_values.append(username)
        update_values.append(tg_id)
        cursor.execute(
            f'UPDATE users SET {", ".join(update_fields)} WHERE tg_id = ?',
            update_values
        )
        conn.commit()
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()

    result = _user_to_dict(user, cursor=cursor)
    conn.close()
    return jsonify(result)


# ── USER ──────────────────────────────────────────────────────

@user_bp.route('/api/user/<tg_id>', methods=['GET'])
def get_user(tg_id):
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    if user is None:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    result = _user_to_dict(user, cursor=cursor)
    result['created_at'] = user['created_at']
    result['updated_at'] = user['updated_at']
    conn.close()
    return jsonify(result)


@user_bp.route('/api/user/update-name', methods=['POST'])
def update_name():
    data         = request.get_json()
    tg_id        = str(data.get('tg_id'))
    display_name = data.get('display_name')
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    cursor.execute(
        'UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
        (display_name, tg_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'display_name': display_name})


@user_bp.route('/api/user/set-private', methods=['POST'])
def set_private():
    data       = request.get_json()
    tg_id      = str(data.get('tg_id'))
    is_private = bool(data.get('is_private'))
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    cursor.execute(
        'UPDATE users SET private_profile = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
        (1 if is_private else 0, tg_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'is_private': is_private})


@user_bp.route('/api/user/inventory', methods=['GET'])
def user_inventory():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT acorns, plant_acorns FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'acorns': user['acorns'], 'plant_acorns': user['plant_acorns']})


@user_bp.route('/api/user/info', methods=['GET'])
def user_info():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400
    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    if user is None:
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    result = _user_to_dict(user, cursor=cursor)
    conn.close()
    return jsonify(result)


@user_bp.route('/api/user/update-potions', methods=['POST'])
def update_potions():
    data       = request.get_json()
    tg_id      = str(data.get('tg_id'))
    potion_hp  = int(data.get('potion_hp',  0))
    potion_sta = int(data.get('potion_sta', 0))

    if potion_hp < 0 or potion_sta < 0:
        return jsonify({'error': 'Invalid potion count'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    cursor.execute('''
        UPDATE users SET potion_hp = ?, potion_sta = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tg_id = ?
    ''', (potion_hp, potion_sta, tg_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'potion_hp': potion_hp, 'potion_sta': potion_sta})


# ── СКИНЫ ─────────────────────────────────────────────────────

@user_bp.route('/api/user/buy-skin', methods=['POST'])
def buy_skin():
    """Покупка скина: списывает монеты, пишет в user_skins."""
    data       = request.get_json()
    tg_id      = str(data.get('tg_id'))
    skin_id    = str(data.get('skin_id'))
    price      = int(data.get('price', 0))

    if not skin_id or price < 0:
        return jsonify({'error': 'skin_id and price required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT balance FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    # Проверить: уже куплен?
    cursor.execute(
        'SELECT skin_id FROM user_skins WHERE tg_id = ? AND skin_id = ?',
        (tg_id, skin_id)
    )
    if cursor.fetchone():
        conn.close()
        return jsonify({'error': 'Скин уже куплен'}), 400

    if user['balance'] < price:
        conn.close()
        return jsonify({'error': 'Недостаточно монет'}), 400

    new_balance = user['balance'] - price
    cursor.execute(
        'UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
        (new_balance, tg_id)
    )
    cursor.execute(
        'INSERT INTO user_skins (tg_id, skin_id, price_paid) VALUES (?, ?, ?)',
        (tg_id, skin_id, price)
    )
    conn.commit()

    owned_skins = _get_owned_skins(cursor, tg_id)
    conn.close()
    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'owned_skins': owned_skins,
    })


@user_bp.route('/api/user/set-skin', methods=['POST'])
def set_skin():
    """Выбор активного скина (должен быть куплен)."""
    data    = request.get_json()
    tg_id   = str(data.get('tg_id'))
    skin_id = str(data.get('skin_id'))

    if not skin_id:
        return jsonify({'error': 'skin_id required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()

    # Дефолтный скин не требует проверки
    if skin_id != 'boar_sobchak':
        cursor.execute(
            'SELECT skin_id FROM user_skins WHERE tg_id = ? AND skin_id = ?',
            (tg_id, skin_id)
        )
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'Скин не куплен'}), 403

    cursor.execute(
        'UPDATE users SET skin_id = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
        (skin_id, tg_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'skin_id': skin_id})


# ── ПРОГРЕСС ──────────────────────────────────────────────────

@user_bp.route('/api/progress/boss', methods=['POST'])
def defeat_boss():
    data    = request.get_json()
    tg_id   = str(data.get('tg_id'))
    boss_id = str(data.get('boss_id'))

    if not tg_id or not boss_id:
        return jsonify({'error': 'tg_id and boss_id required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT defeated_bosses FROM users WHERE tg_id = ?', (tg_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    try:
        bosses = json.loads(row['defeated_bosses'] or '[]')
        if not isinstance(bosses, list):
            bosses = []
    except Exception:
        bosses = []

    if boss_id not in bosses:
        bosses.append(boss_id)
        cursor.execute(
            'UPDATE users SET defeated_bosses = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
            (json.dumps(bosses), tg_id)
        )
        conn.commit()

    conn.close()
    return jsonify({'success': True, 'defeated_bosses': bosses})