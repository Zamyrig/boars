from flask import jsonify
from server import app
from models.user_model import get_top_users, get_all_users

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    players = get_top_users(10)

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
        'plant_acorns': row['plant_acorns']
    } for row in players]

    return jsonify(result)

@app.route('/api/leaderboard/full', methods=['GET'])
def full_leaderboard():
    players = get_all_users()

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
        'plant_acorns': row['plant_acorns']
    } for row in players]

    return jsonify(result)