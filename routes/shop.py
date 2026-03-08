import json
from flask import Blueprint, request, jsonify
from db.database import get_db_connection

shop_bp = Blueprint('shop', __name__)

DEFAULT_PRICES = {
    "plant_acorn": {"buy": 1000, "sell": 800},
    "acorn":       {"buy": 200,  "sell": 150},
}


def _load_prices():
    try:
        with open('prices.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return DEFAULT_PRICES


@shop_bp.route('/api/shop/items', methods=['GET'])
def shop_items():
    prices = _load_prices()
    items = [
        {
            "id": "acorn",
            "name": "Желудь",
            "icon": "acorn.png",
            "price":      prices.get("acorn", {}).get("buy",  DEFAULT_PRICES["acorn"]["buy"]),
            "sell_price": prices.get("acorn", {}).get("sell", DEFAULT_PRICES["acorn"]["sell"]),
        },
        {
            "id": "plant_acorn",
            "name": "Росток",
            "icon": "plant_acorn.png",
            "price":      prices.get("plant_acorn", {}).get("buy",  DEFAULT_PRICES["plant_acorn"]["buy"]),
            "sell_price": prices.get("plant_acorn", {}).get("sell", DEFAULT_PRICES["plant_acorn"]["sell"]),
        },
    ]
    return jsonify(items)


@shop_bp.route('/api/shop/buy', methods=['POST'])
def shop_buy():
    data = request.get_json()
    tg_id    = str(data.get('tg_id'))
    item_id  = data.get('item_id')
    quantity = int(data.get('quantity', 1))

    if quantity <= 0:
        return jsonify({'error': 'Quantity must be > 0'}), 400

    prices = _load_prices()
    price_per_unit = prices.get(item_id, {}).get("buy", 0)
    if not price_per_unit:
        return jsonify({'error': 'Invalid item_id or no buy price defined'}), 400

    total_cost = price_per_unit * quantity

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT balance, acorns, plant_acorns FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    if user['balance'] < total_cost:
        conn.close()
        return jsonify({'error': 'Not enough gold'}), 400

    new_balance      = user['balance'] - total_cost
    new_acorns       = user['acorns']
    new_plant_acorns = user['plant_acorns']

    if item_id == 'acorn':
        new_acorns += quantity
        cursor.execute(
            'UPDATE users SET balance = ?, acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
            (new_balance, new_acorns, tg_id)
        )
    elif item_id == 'plant_acorn':
        new_plant_acorns += quantity
        cursor.execute(
            'UPDATE users SET balance = ?, plant_acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
            (new_balance, new_plant_acorns, tg_id)
        )
    else:
        conn.close()
        return jsonify({'error': 'Unknown item'}), 400

    conn.commit()
    conn.close()
    return jsonify({'success': True, 'new_balance': new_balance,
                    'new_acorns': new_acorns, 'new_plant_acorns': new_plant_acorns})


@shop_bp.route('/api/shop/sell', methods=['POST'])
def shop_sell():
    data = request.get_json()
    tg_id    = str(data.get('tg_id'))
    item_id  = data.get('item_id')
    quantity = int(data.get('quantity', 1))

    if quantity <= 0:
        return jsonify({'error': 'Quantity must be > 0'}), 400

    prices = _load_prices()
    sell_price = prices.get(item_id, {}).get("sell", 0)
    if not sell_price:
        return jsonify({'error': 'Invalid item_id or no sell price defined'}), 400

    total_reward = sell_price * quantity

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT balance, acorns, plant_acorns, max_balance FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    if item_id == 'acorn' and user['acorns'] < quantity:
        conn.close()
        return jsonify({'error': 'Not enough acorns'}), 400
    if item_id == 'plant_acorn' and user['plant_acorns'] < quantity:
        conn.close()
        return jsonify({'error': 'Not enough plant_acorns'}), 400

    new_balance      = user['balance'] + total_reward
    new_acorns       = user['acorns']
    new_plant_acorns = user['plant_acorns']

    if new_balance > user['max_balance']:
        cursor.execute('UPDATE users SET max_balance = ? WHERE tg_id = ?', (new_balance, tg_id))

    if item_id == 'acorn':
        new_acorns -= quantity
        cursor.execute(
            'UPDATE users SET balance = ?, acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
            (new_balance, new_acorns, tg_id)
        )
    elif item_id == 'plant_acorn':
        new_plant_acorns -= quantity
        cursor.execute(
            'UPDATE users SET balance = ?, plant_acorns = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
            (new_balance, new_plant_acorns, tg_id)
        )
    else:
        conn.close()
        return jsonify({'error': 'Unknown item'}), 400

    conn.commit()
    conn.close()
    return jsonify({'success': True, 'new_balance': new_balance,
                    'new_acorns': new_acorns, 'new_plant_acorns': new_plant_acorns})
