from flask import Blueprint, jsonify
from db.database import get_db_connection

leaderboard_bp = Blueprint('leaderboard', __name__)

_FIELDS = 'tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns, max_balance, watched_battles'


def _serialize(rows):
    return [dict(row) | {'private_profile': bool(row['private_profile'])} for row in rows]


@leaderboard_bp.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f'SELECT {_FIELDS} FROM users ORDER BY balance DESC LIMIT 10')
    rows = cursor.fetchall()
    conn.close()
    return jsonify(_serialize(rows))


@leaderboard_bp.route('/api/leaderboard/full', methods=['GET'])
def full_leaderboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f'SELECT {_FIELDS} FROM users ORDER BY balance DESC')
    rows = cursor.fetchall()
    conn.close()
    return jsonify(_serialize(rows))
