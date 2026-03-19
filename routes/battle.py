import random
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from db.database import get_db_connection, check_update_max_balance

battle_bp = Blueprint('battle', __name__)

WATCH_REWARD = 200           
WATCH_COOLDOWN_HOURS = 2


@battle_bp.route('/api/battle/watch', methods=['POST'])
def watch_battle():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()

        if not user:
            conn.rollback(); conn.close()
            return jsonify({'error': 'User not found'}), 404

        now = datetime.utcnow()
        can_reward = True

        if user['last_watch_reward_at']:
            try:
                last_watch = datetime.fromisoformat(str(user['last_watch_reward_at']))
                if now < last_watch + timedelta(hours=WATCH_COOLDOWN_HOURS):
                    can_reward = False
            except Exception:
                pass

        reward = 0
        new_balance = user['balance']
        new_last_watch = user['last_watch_reward_at']

        if can_reward:
            reward = WATCH_REWARD
            new_balance += reward
            new_last_watch = now.isoformat()
            check_update_max_balance(cursor, tg_id, new_balance)

        cursor.execute('''
            UPDATE users
            SET balance = ?, watched_battles = watched_battles + 1,
                last_watch_reward_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (new_balance, new_last_watch, tg_id))

        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, 0, 1, ?)
        ''', (tg_id, f"Оппонент_{now.strftime('%S')}", int(can_reward)))

        conn.commit()

        watch_cooldown_remaining = 0
        if new_last_watch:
            try:
                last_watch_dt = datetime.fromisoformat(str(new_last_watch))
                remaining = (last_watch_dt + timedelta(hours=WATCH_COOLDOWN_HOURS) - now).total_seconds()
                watch_cooldown_remaining = max(0, int(remaining))
            except Exception:
                pass

        cursor.execute(
            'SELECT balance, acorns, plant_acorns, max_balance, watched_battles FROM users WHERE tg_id = ?',
            (tg_id,)
        )
        updated = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'new_balance': updated['balance'],
            'acorns': updated['acorns'],
            'plant_acorns': updated['plant_acorns'],
            'max_balance': updated['max_balance'],
            'watched_battles': updated['watched_battles'],
            'reward': reward,
            'reward_given': can_reward,
            'watch_cooldown_remaining': watch_cooldown_remaining,
        })

    except Exception as e:
        conn.rollback(); conn.close()
        print(f"Watch battle error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@battle_bp.route('/api/battle/init', methods=['POST'])
def battle_init():
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
            conn.rollback(); conn.close()
            return jsonify({'error': 'User not found'}), 404

        if user['balance'] < bet_amount:
            conn.rollback(); conn.close()
            return jsonify({'error': 'Insufficient balance'}), 400

        new_balance = user['balance'] - bet_amount
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

        cursor.execute(
            'SELECT balance, acorns, plant_acorns, max_balance, watched_battles FROM users WHERE tg_id = ?',
            (tg_id,)
        )
        updated = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'is_win': is_win,
            'reward': reward,
            'new_balance': updated['balance'],
            'acorns': updated['acorns'],
            'plant_acorns': updated['plant_acorns'],
            'max_balance': updated['max_balance'],
            'watched_battles': updated['watched_battles'],
            'opponent': opponent,
        })

    except Exception as e:
        conn.rollback(); conn.close()
        print(f"Battle init error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@battle_bp.route('/api/battle/rpg-result', methods=['POST'])
def rpg_result():
    """Сохраняет результат RPG боя и начисляет награду."""
    data = request.get_json()
    tg_id  = str(data.get('tg_id'))
    is_win = bool(data.get('is_win', False))
    reward = int(data.get('reward', 0))
    enemy  = str(data.get('enemy', 'mine_grunt'))

    if reward < 0 or reward > 10000:
        return jsonify({'error': 'Invalid reward'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()
        if not user:
            conn.rollback(); conn.close()
            return jsonify({'error': 'User not found'}), 404

        new_balance = user['balance'] + reward

        if is_win:
            cursor.execute('''
                UPDATE users SET balance = ?, total_games = total_games + 1,
                wins = wins + 1, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?
            ''', (new_balance, tg_id))
        else:
            cursor.execute('''
                UPDATE users SET total_games = total_games + 1,
                lose = lose + 1, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?
            ''', (tg_id,))
            new_balance = user['balance']

        check_update_max_balance(cursor, tg_id, new_balance)

        cursor.execute('''
            INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
            VALUES (?, ?, 0, ?, ?)
        ''', (tg_id, enemy, int(is_win), int(is_win and reward > 0)))

        conn.commit()
        cursor.execute('SELECT balance, total_games, wins, lose FROM users WHERE tg_id = ?', (tg_id,))
        updated = cursor.fetchone()
        conn.close()

        return jsonify({
            'success':     True,
            'new_balance': updated['balance'],
            'total_games': updated['total_games'],
            'wins':        updated['wins'],
            'lose':        updated['lose'],
        })

    except Exception as e:
        conn.rollback(); conn.close()
        print(f"rpg-result error: {e}")
        return jsonify({'error': 'Internal server error'}), 500