import json
from flask import request, jsonify
from server import app
from models.user_model import get_user_by_id, update_inventory_after_shop_transaction

@app.route('/api/shop/items', methods=['GET'])
def shop_items():
    # Загружаем цены из файла prices.json
    try:
        with open('../prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except FileNotFoundError:
        print("Файл prices.json не найден. Используем цены по умолчанию.")
        prices = {
            "plant_acorn": {"buy": 1000, "sell": 800},
            "acorn": {"buy": 200, "sell": 150}
        }

    items = [
        {
            "id": "acorn",
            "name": "Желудь",
            "icon": "acorn.png",
            "buy_price": prices.get("acorn", {}).get("buy", 200),
            "sell_price": prices.get("acorn", {}).get("sell", 150)
        },
        {
            "id": "plant_acorn",
            "name": "Росток",
            "icon": "plant_acorn.png",
            "buy_price": prices.get("plant_acorn", {}).get("buy", 1000),
            "sell_price": prices.get("plant_acorn", {}).get("sell", 800)
        }
    ]
    
    return jsonify(items)

@app.route('/api/shop/buy', methods=['POST'])
def buy_item():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    item_id = data.get('item_id')
    quantity = data.get('quantity', 1)

    user = get_user_by_id(tg_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Загружаем цены
    try:
        with open('../prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except FileNotFoundError:
        prices = {
            "plant_acorn": {"buy": 1000, "sell": 800},
            "acorn": {"buy": 200, "sell": 150}
        }

    item_price = prices.get(item_id, {}).get("buy", 0)
    total_cost = item_price * quantity

    if user['balance'] < total_cost:
        return jsonify({'error': 'Недостаточно средств'}), 400

    # Обновляем инвентарь и баланс
    new_balance, new_acorns, new_plant_acorns = update_inventory_after_shop_transaction(
        tg_id, item_id, quantity, total_cost, is_buy=True
    )

    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'new_acorns': new_acorns,
        'new_plant_acorns': new_plant_acorns,
        'message': f'Успешно куплено {quantity}x {item_id}'
    })

@app.route('/api/shop/sell', methods=['POST'])
def sell_item():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    item_id = data.get('item_id')
    quantity = data.get('quantity', 1)

    user = get_user_by_id(tg_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Проверяем наличие достаточного количества предметов
    current_item_count = user[item_id] if item_id in ['acorns', 'plant_acorns'] else 0
    if current_item_count < quantity:
        return jsonify({'error': 'Недостаточно предметов для продажи'}), 400

    # Загружаем цены
    try:
        with open('../prices.json', 'r', encoding='utf-8') as f:
            prices = json.load(f)
    except FileNotFoundError:
        prices = {
            "plant_acorn": {"buy": 1000, "sell": 800},
            "acorn": {"buy": 200, "sell": 150}
        }

    item_price = prices.get(item_id, {}).get("sell", 0)
    total_revenue = item_price * quantity

    # Обновляем инвентарь и баланс
    new_balance, new_acorns, new_plant_acorns = update_inventory_after_shop_transaction(
        tg_id, item_id, -quantity, -total_revenue, is_buy=False
    )

    return jsonify({
        'success': True,
        'new_balance': new_balance,
        'new_acorns': new_acorns,
        'new_plant_acorns': new_plant_acorns,
        'message': f'Успешно продано {quantity}x {item_id}'
    })