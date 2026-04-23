from flask import Blueprint, request, jsonify
from db.database import get_db_connection

skins_bp = Blueprint('skins', __name__)

# ── Список всех скинов ────────────────────────────────────────
SKINS_CATALOG = [
    {
        'id':          'boar_sobchak',
        'name':        'Нормис',
        'description': 'Лучше сын нормис чем дочь в сауне',
        'price':       0,
        'is_free':     True,
        'sort_order':  1,
    },
    {
        'id':          'boar_pink',
        'name':        'Розови',
        'description': 'Бро, это самый мужской скин. итд. Он кстати бесплатный до 1 мая будет. Потом плати деньги.',
        'price':       10000,
        'is_free':     False,
        'sort_order':  2,
    },
]


def _get_owned_skins(cursor, tg_id):
    cursor.execute('SELECT skin_id FROM user_skins WHERE tg_id = ?', (tg_id,))
    rows = cursor.fetchall()
    owned = {r['skin_id'] for r in rows}
    for s in SKINS_CATALOG:
        if s['is_free']:
            owned.add(s['id'])
    return owned


# ── GET /api/skins ────────────────────────────────────────────

@skins_bp.route('/api/skins', methods=['GET'])
def get_skins():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT skin_id FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    active_skin = user['skin_id'] or 'boar_sobchak'
    owned       = _get_owned_skins(cursor, tg_id)

    for s in SKINS_CATALOG:
        if s['is_free']:
            cursor.execute(
                'INSERT OR IGNORE INTO user_skins (tg_id, skin_id, price_paid) VALUES (?, ?, 0)',
                (tg_id, s['id'])
            )
    conn.commit()
    conn.close()

    skins = [
        {**s, 'owned': s['id'] in owned}
        for s in sorted(SKINS_CATALOG, key=lambda x: x['sort_order'])
    ]

    return jsonify({'active_skin': active_skin, 'skins': skins})


# ── POST /api/skins/select ────────────────────────────────────

@skins_bp.route('/api/skins/select', methods=['POST'])
def select_skin():
    data    = request.get_json()
    tg_id   = str(data.get('tg_id'))
    skin_id = data.get('skin_id')

    if not tg_id or not skin_id:
        return jsonify({'error': 'tg_id and skin_id required'}), 400

    skin_cfg = next((s for s in SKINS_CATALOG if s['id'] == skin_id), None)
    if not skin_cfg:
        return jsonify({'error': 'Скин не найден'}), 404

    conn   = get_db_connection()
    cursor = conn.cursor()

    if not skin_cfg['is_free']:
        cursor.execute(
            'SELECT 1 FROM user_skins WHERE tg_id = ? AND skin_id = ?', (tg_id, skin_id)
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
    return jsonify({'success': True, 'active_skin': skin_id})


# ── POST /api/skins/buy ───────────────────────────────────────

@skins_bp.route('/api/skins/buy', methods=['POST'])
def buy_skin():
    data    = request.get_json()
    tg_id   = str(data.get('tg_id'))
    skin_id = data.get('skin_id')

    if not tg_id or not skin_id:
        return jsonify({'error': 'tg_id and skin_id required'}), 400

    skin_cfg = next((s for s in SKINS_CATALOG if s['id'] == skin_id), None)
    if not skin_cfg:
        return jsonify({'error': 'Скин не найден'}), 404

    conn   = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT balance, skin_id FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    cursor.execute(
        'SELECT 1 FROM user_skins WHERE tg_id = ? AND skin_id = ?', (tg_id, skin_id)
    )
    already_owned = cursor.fetchone()

    if not already_owned and not skin_cfg['is_free']:
        if user['balance'] < skin_cfg['price']:
            conn.close()
            return jsonify({'error': 'Недостаточно монет'}), 400

        cursor.execute(
            'UPDATE users SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
            (skin_cfg['price'], tg_id)
        )
        cursor.execute(
            'INSERT OR IGNORE INTO user_skins (tg_id, skin_id, price_paid) VALUES (?, ?, ?)',
            (tg_id, skin_id, skin_cfg['price'])
        )

    cursor.execute(
        'UPDATE users SET skin_id = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?',
        (skin_id, tg_id)
    )
    conn.commit()

    cursor.execute('SELECT balance FROM users WHERE tg_id = ?', (tg_id,))
    updated = cursor.fetchone()
    conn.close()

    return jsonify({
        'success':     True,
        'active_skin': skin_id,
        'new_balance': updated['balance'],
    })


# ── POST /api/skins/grant-all ─────────────────────────────────

@skins_bp.route('/api/skins/grant-all', methods=['POST'])
def grant_all():
    data    = request.get_json()
    skin_id = data.get('skin_id')
    if not skin_id:
        return jsonify({'error': 'skin_id required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT tg_id FROM users')
    users = cursor.fetchall()
    for u in users:
        cursor.execute(
            'INSERT OR IGNORE INTO user_skins (tg_id, skin_id, price_paid) VALUES (?, ?, 0)',
            (u['tg_id'], skin_id)
        )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'granted_to': len(users)})


# ── POST /api/skins/revoke ────────────────────────────────────

@skins_bp.route('/api/skins/revoke', methods=['POST'])
def revoke_skin():
    data    = request.get_json()
    skin_id = data.get('skin_id')
    tg_id   = data.get('tg_id')

    if not skin_id:
        return jsonify({'error': 'skin_id required'}), 400

    conn   = get_db_connection()
    cursor = conn.cursor()

    if tg_id:
        tg_id = str(tg_id)
        cursor.execute(
            'DELETE FROM user_skins WHERE tg_id = ? AND skin_id = ?', (tg_id, skin_id)
        )
        cursor.execute(
            "UPDATE users SET skin_id = 'boar_sobchak', updated_at = CURRENT_TIMESTAMP "
            'WHERE tg_id = ? AND skin_id = ?',
            (tg_id, skin_id)
        )
    else:
        cursor.execute('DELETE FROM user_skins WHERE skin_id = ?', (skin_id,))
        cursor.execute(
            "UPDATE users SET skin_id = 'boar_sobchak', updated_at = CURRENT_TIMESTAMP "
            'WHERE skin_id = ?',
            (skin_id,)
        )

    conn.commit()
    conn.close()
    return jsonify({'success': True})