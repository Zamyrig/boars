from flask import request, jsonify
from server import app
from models.user_model import get_user_by_id, update_user_balance_and_add_to_battle_history
from datetime import datetime

@app.route('/api/battle/watch', methods=['POST'])
def watch_battle():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))

    user = get_user_by_id(tg_id)

    if user is not None:
        reward = 1
        update_user_balance_and_add_to_battle_history(
            tg_id, reward, f"Оппонент_{datetime.now().strftime('%S')}", 0, 1
        )
        
        # Возвращаем обновленный баланс
        updated_user = get_user_by_id(tg_id)
        return jsonify({
            'success': True,
            'new_balance': updated_user['balance'],
            'acorns': updated_user['acorns'],
            'plant_acorns': updated_user['plant_acorns'],
            'reward': reward
        })
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/battle/result', methods=['POST'])
def battle_result():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    is_win = data.get('is_win')
    bet_amount = data.get('bet_amount')

    user = get_user_by_id(tg_id)

    if user is not None:
        bet = int(bet_amount) if bet_amount else 0
        if is_win:
            # Победа - увеличиваем баланс на ставку
            new_balance = user['balance'] + bet
            update_user_balance_and_add_to_battle_history(
                tg_id, bet, f"Оппонент_{datetime.now().strftime('%S')}", 1, 0
            )
        else:
            # Поражение - уменьшаем баланс на ставку
            new_balance = user['balance'] - bet
            update_user_balance_and_add_to_battle_history(
                tg_id, -bet, f"Оппонент_{datetime.now().strftime('%S')}", 0, 0
            )

        # ВАЖНО: Возвращаем обновленный баланс и инвентарь
        updated_user = get_user_by_id(tg_id)
        return jsonify({
            'success': True,
            'new_balance': updated_user['balance'],
            'acorns': updated_user['acorns'],
            'plant_acorns': updated_user['plant_acorns']
        })
    else:
        return jsonify({'error': 'User not found'}), 404