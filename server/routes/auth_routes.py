from flask import request, jsonify
from server import app
from models.user_model import get_user_by_id, create_user, update_username

@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    username = data.get('username', '')
    first_name = data.get('first_name', '')

    user = get_user_by_id(tg_id)

    if user is None:
        display_name = first_name or username or 'Аноним'
        create_user(tg_id, username or '', display_name)
        user = get_user_by_id(tg_id)
    else:
        if username and user['username'] != username:
            update_username(tg_id, username)
            user = get_user_by_id(tg_id)

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
        'plant_acorns': user['plant_acorns']
    })