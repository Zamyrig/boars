from flask import request, jsonify
from server import app
from models.user_model import get_user_by_id, update_display_name, update_private_profile, update_inventory_item

@app.route('/api/user/update-name', methods=['POST'])
def update_name():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    display_name = data.get('display_name')

    user = get_user_by_id(tg_id)

    if user is not None:
        update_display_name(tg_id, display_name)
        return jsonify({'success': True, 'display_name': display_name})
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/user/set-private', methods=['POST'])
def set_private():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_private = bool(data.get('is_private'))

    user = get_user_by_id(tg_id)

    if user is not None:
        update_private_profile(tg_id, is_private)
        return jsonify({'success': True, 'is_private': is_private})
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/user/<tg_id>', methods=['GET'])
def get_user(tg_id):
    user = get_user_by_id(tg_id)

    if user is not None:
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
            'created_at': user['created_at'],
            'updated_at': user['updated_at']
        })
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/user/update-inventory', methods=['POST'])
def update_inventory():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    item_type = data.get('item_type')  # 'acorns' or 'plant_acorns'
    amount = data.get('amount', 0)

    user = get_user_by_id(tg_id)

    if user is not None:
        update_inventory_item(tg_id, item_type, amount)
        updated_user = get_user_by_id(tg_id)
        return jsonify({
            'success': True,
            'new_acorns': updated_user['acorns'],
            'new_plant_acorns': updated_user['plant_acorns'],
            'new_balance': updated_user['balance']
        })
    else:
        return jsonify({'error': 'User not found'}), 404