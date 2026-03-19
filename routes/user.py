from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from db.database import get_db_connection

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


def _user_to_dict(user, watch_cooldown_remaining=None):
    if watch_cooldown_remaining is None:
        watch_cooldown_remaining = _calc_watch_cooldown(user['last_watch_reward_at'])
    return {
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
        'last_seen': user['last_seen'],
        'potion_hp': user['potion_hp'] if 'potion_hp' in user.keys() else 0,
        'potion_sta': user['potion_sta'] if 'potion_sta' in user.keys() else 0,
    }


# ── AUTH ──────────────────────────────────────────────────────

@auth_bp.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    username = data.get('username', '')
    first_name = data.get('first_name', '')

    conn = get_db_connection()
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
             last_watch_reward_at, last_seen, potion_hp, potion_sta)
            VALUES (?, ?, ?, 1000, 0, 0, 0, 0, 0, 0, 1000, 0, NULL, ?, 0, 0)
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

    conn.close()
    return jsonify(_user_to_dict(user))


# ── USER ──────────────────────────────────────────────────────

@user_bp.route('/api/user/<tg_id>', methods=['GET'])
def get_user(tg_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    result = _user_to_dict(user)
    result['created_at'] = user['created_at']
    result['updated_at'] = user['updated_at']
    return jsonify(result)


@user_bp.route('/api/user/update-name', methods=['POST'])
def update_name():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    display_name = data.get('display_name')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    cursor.execute('UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
                   (display_name, tg_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'display_name': display_name})


@user_bp.route('/api/user/set-private', methods=['POST'])
def set_private():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_private = bool(data.get('is_private'))
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users WHERE tg_id = ?', (tg_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'error': 'User not found'}), 404
    cursor.execute('UPDATE users SET private_profile = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
                   (1 if is_private else 0, tg_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'is_private': is_private})


@user_bp.route('/api/user/inventory', methods=['GET'])
def user_inventory():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400
    conn = get_db_connection()
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
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(_user_to_dict(user))


@user_bp.route('/api/user/update-potions', methods=['POST'])
def update_potions():
    """Сохраняет количество зелий игрока в БД."""
    data = request.get_json()
    tg_id      = str(data.get('tg_id'))
    potion_hp  = int(data.get('potion_hp',  0))
    potion_sta = int(data.get('potion_sta', 0))

    if potion_hp < 0 or potion_sta < 0:
        return jsonify({'error': 'Invalid potion count'}), 400

    conn = get_db_connection()
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