import random
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from db.database import get_db_connection, check_update_max_balance

farm_bp = Blueprint('farm', __name__)

# ── Конфиг слотов фермы ───────────────────────────────────────────────────
FARM_SLOTS = [
    { "slot": 1, "unlock_cost": { "acorns": 3,    "coins": 30,    "plant_acorns": 0  } },
    { "slot": 2, "unlock_cost": { "acorns": 5,    "coins": 50,    "plant_acorns": 0  } },
    { "slot": 3, "unlock_cost": { "acorns": 10,   "coins": 100,   "plant_acorns": 0  } },
    { "slot": 4, "unlock_cost": { "acorns": 100,  "coins": 1000,  "plant_acorns": 1  } },
    { "slot": 5, "unlock_cost": { "acorns": 300,  "coins": 3000,  "plant_acorns": 3  } },
    { "slot": 6, "unlock_cost": { "acorns": 1000, "coins": 10000, "plant_acorns": 10 } },
]

DROPS_CFG_PATH = './acorn_drops.cfg'


def _load_drops(item_id: str) -> dict:
    try:
        with open(DROPS_CFG_PATH, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"[farm] acorn_drops.cfg not found at {DROPS_CFG_PATH}")
        return {}

    in_section = False
    grow_time = 1.0
    plant_chance = 0.0
    drops = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        if stripped.startswith('['):
            section_name = stripped[1:stripped.index(']')]
            in_section = (section_name == item_id)
            continue
        if not in_section or '=' not in stripped:
            continue
        key, _, val = stripped.partition('=')
        key = key.strip().lower()
        val = val.strip()

        if key == 'grow_time_hours':
            grow_time = float(val)
        elif key == 'drop_plant_acorn_chance':
            plant_chance = float(val)
        elif key == 'drop':
            parts = [p.strip() for p in val.split(',')]
            if len(parts) == 4:
                try:
                    drops.append((int(parts[0]), float(parts[1]), int(parts[2]), int(parts[3])))
                except ValueError:
                    pass

    return {
        'grow_time_hours': grow_time,
        'drops': drops,
        'plant_acorn_chance': plant_chance,
    }


def _roll_drops(item_id: str) -> dict:
    table = _load_drops(item_id)
    if not table or not table['drops']:
        return {'acorns': 0, 'coins': 0, 'plant_acorn': 0}

    drops = table['drops']
    total = sum(d[1] for d in drops)
    roll = random.uniform(0, total)

    chosen = drops[0]
    cumulative = 0
    for d in drops:
        cumulative += d[1]
        if roll <= cumulative:
            chosen = d
            break

    acorns = chosen[0]
    coins = random.randint(chosen[2], chosen[3])

    bonus_plant = 0
    if random.uniform(0, 100) <= table['plant_acorn_chance']:
        bonus_plant = 1

    return {'acorns': acorns, 'coins': coins, 'plant_acorn': bonus_plant}


def _get_drop_table_display(item_id: str) -> list:
    table = _load_drops(item_id)
    if not table:
        return []

    result = []
    for acorns, chance, coins_min, coins_max in table['drops']:
        result.append({
            'acorns': acorns,
            'chance': chance,
            'coins_min': coins_min,
            'coins_max': coins_max,
        })

    return {
        'grow_time_hours': table['grow_time_hours'],
        'drops': result,
        'plant_acorn_chance': table['plant_acorn_chance'],
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

def _ensure_farm_tables(conn):
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS farm_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id TEXT NOT NULL,
            slot_num INTEGER NOT NULL,
            unlocked INTEGER DEFAULT 0,
            planted_item TEXT DEFAULT NULL,
            planted_at TIMESTAMP DEFAULT NULL,
            ready_at TIMESTAMP DEFAULT NULL,
            UNIQUE(tg_id, slot_num)
        )
    ''')
    conn.commit()


def _get_or_create_farm(cursor, tg_id: str) -> list:
    rows = []
    for slot_cfg in FARM_SLOTS:
        sn = slot_cfg['slot']
        cursor.execute(
            'SELECT * FROM farm_slots WHERE tg_id = ? AND slot_num = ?',
            (tg_id, sn)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.execute(
                'INSERT INTO farm_slots (tg_id, slot_num, unlocked) VALUES (?, ?, 0)',
                (tg_id, sn)
            )
            cursor.execute(
                'SELECT * FROM farm_slots WHERE tg_id = ? AND slot_num = ?',
                (tg_id, sn)
            )
            row = cursor.fetchone()
        rows.append(dict(row))
    return rows


def _slot_to_dict(slot: dict, now: datetime) -> dict:
    ready_at = None
    seconds_left = None
    if slot.get('ready_at'):
        try:
            ready_at_dt = datetime.fromisoformat(str(slot['ready_at']))
            seconds_left = max(0, int((ready_at_dt - now).total_seconds()))
            ready_at = slot['ready_at']
        except Exception:
            pass
    return {
        'slot_num': slot['slot_num'],
        'unlocked': bool(slot['unlocked']),
        'planted_item': slot.get('planted_item'),
        'planted_at': slot.get('planted_at'),
        'ready_at': ready_at,
        'seconds_left': seconds_left,
        'is_ready': seconds_left == 0 and slot.get('planted_item') is not None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@farm_bp.route('/api/farm/state', methods=['GET'])
def farm_state():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400

    conn = get_db_connection()
    _ensure_farm_tables(conn)
    cursor = conn.cursor()

    cursor.execute('SELECT acorns, plant_acorns, balance FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    slots = _get_or_create_farm(cursor, tg_id)
    conn.commit()
    conn.close()

    now = datetime.utcnow()
    return jsonify({
        'slots': [_slot_to_dict(s, now) for s in slots],
        'slot_configs': FARM_SLOTS,
        'acorns': user['acorns'],
        'plant_acorns': user['plant_acorns'],
        'balance': user['balance'],
    })


@farm_bp.route('/api/farm/unlock', methods=['POST'])
def farm_unlock():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    slot_num = int(data.get('slot_num', 1))

    cfg = next((s for s in FARM_SLOTS if s['slot'] == slot_num), None)
    if not cfg:
        return jsonify({'error': 'Invalid slot'}), 400

    conn = get_db_connection()
    _ensure_farm_tables(conn)
    cursor = conn.cursor()

    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute('SELECT acorns, plant_acorns, balance FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()
        if not user:
            conn.rollback(); conn.close()
            return jsonify({'error': 'User not found'}), 404

        cost = cfg['unlock_cost']
        if user['acorns'] < cost['acorns']:
            conn.rollback(); conn.close()
            return jsonify({'error': f'Нужно {cost["acorns"]} желудей'}), 400
        if user['balance'] < cost['coins']:
            conn.rollback(); conn.close()
            return jsonify({'error': f'Нужно {cost["coins"]} монет'}), 400
        if user['plant_acorns'] < cost['plant_acorns']:
            conn.rollback(); conn.close()
            return jsonify({'error': f'Нужно {cost["plant_acorns"]} ростков'}), 400

        slots = _get_or_create_farm(cursor, tg_id)
        conn.commit()
        slot = next((s for s in slots if s['slot_num'] == slot_num), None)
        if slot and slot['unlocked']:
            conn.close()
            return jsonify({'error': 'Слот уже разблокирован'}), 400

        cursor.execute('''
            UPDATE users SET
                acorns = acorns - ?,
                plant_acorns = plant_acorns - ?,
                balance = balance - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (cost['acorns'], cost['plant_acorns'], cost['coins'], tg_id))

        cursor.execute('''
            UPDATE farm_slots SET unlocked = 1 WHERE tg_id = ? AND slot_num = ?
        ''', (tg_id, slot_num))

        conn.commit()

        cursor.execute('SELECT acorns, plant_acorns, balance FROM users WHERE tg_id = ?', (tg_id,))
        updated = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'new_acorns': updated['acorns'],
            'new_plant_acorns': updated['plant_acorns'],
            'new_balance': updated['balance'],
        })

    except Exception as e:
        conn.rollback(); conn.close()
        print(f"Farm unlock error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@farm_bp.route('/api/farm/plant', methods=['POST'])
def farm_plant():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    slot_num = int(data.get('slot_num'))
    item_id = str(data.get('item_id'))

    drop_table = _load_drops(item_id)
    if not drop_table:
        return jsonify({'error': 'Unknown item'}), 400

    conn = get_db_connection()
    _ensure_farm_tables(conn)
    cursor = conn.cursor()

    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute('SELECT acorns, plant_acorns, balance FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()
        if not user:
            conn.rollback(); conn.close()
            return jsonify({'error': 'User not found'}), 404

        cursor.execute(
            'SELECT * FROM farm_slots WHERE tg_id = ? AND slot_num = ?',
            (tg_id, slot_num)
        )
        slot = cursor.fetchone()
        if not slot or not slot['unlocked']:
            conn.rollback(); conn.close()
            return jsonify({'error': 'Слот не разблокирован'}), 400
        if slot['planted_item']:
            conn.rollback(); conn.close()
            return jsonify({'error': 'Слот уже занят'}), 400

        if item_id == 'plant_acorn' and user['plant_acorns'] < 1:
            conn.rollback(); conn.close()
            return jsonify({'error': 'Нет ростков'}), 400

        cursor.execute('''
            UPDATE users SET plant_acorns = plant_acorns - 1, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (tg_id,))

        now = datetime.utcnow()
        ready_at = now + timedelta(hours=drop_table['grow_time_hours'])

        cursor.execute('''
            UPDATE farm_slots SET
                planted_item = ?, planted_at = ?, ready_at = ?
            WHERE tg_id = ? AND slot_num = ?
        ''', (item_id, now.isoformat(), ready_at.isoformat(), tg_id, slot_num))

        conn.commit()

        cursor.execute('SELECT plant_acorns FROM users WHERE tg_id = ?', (tg_id,))
        updated = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'planted_item': item_id,
            'ready_at': ready_at.isoformat(),
            'seconds_left': int(drop_table['grow_time_hours'] * 3600),
            'new_plant_acorns': updated['plant_acorns'],
        })

    except Exception as e:
        conn.rollback(); conn.close()
        print(f"Farm plant error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@farm_bp.route('/api/farm/harvest', methods=['POST'])
def farm_harvest():
    data = request.get_json()
    tg_id = str(data.get('tg_id'))
    slot_num = int(data.get('slot_num'))

    conn = get_db_connection()
    _ensure_farm_tables(conn)
    cursor = conn.cursor()

    try:
        cursor.execute('BEGIN IMMEDIATE')
        cursor.execute(
            'SELECT * FROM farm_slots WHERE tg_id = ? AND slot_num = ?',
            (tg_id, slot_num)
        )
        slot = cursor.fetchone()
        if not slot or not slot['planted_item']:
            conn.rollback(); conn.close()
            return jsonify({'error': 'Нечего собирать'}), 400

        now = datetime.utcnow()
        ready_at_dt = datetime.fromisoformat(str(slot['ready_at']))
        if now < ready_at_dt:
            conn.rollback(); conn.close()
            return jsonify({'error': 'Ещё не готово'}), 400

        item_id = slot['planted_item']
        drops = _roll_drops(item_id)

        cursor.execute('SELECT balance FROM users WHERE tg_id = ?', (tg_id,))
        user = cursor.fetchone()

        new_balance = user['balance'] + drops['coins']
        cursor.execute('''
            UPDATE users SET
                acorns = acorns + ?,
                plant_acorns = plant_acorns + ?,
                balance = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (drops['acorns'], drops['plant_acorn'], new_balance, tg_id))

        check_update_max_balance(cursor, tg_id, new_balance)

        cursor.execute('''
            UPDATE farm_slots SET planted_item = NULL, planted_at = NULL, ready_at = NULL
            WHERE tg_id = ? AND slot_num = ?
        ''', (tg_id, slot_num))

        conn.commit()

        cursor.execute(
            'SELECT balance, acorns, plant_acorns, max_balance FROM users WHERE tg_id = ?',
            (tg_id,)
        )
        updated = cursor.fetchone()
        conn.close()

        return jsonify({
            'success': True,
            'drops': drops,
            'new_balance': updated['balance'],
            'new_acorns': updated['acorns'],
            'new_plant_acorns': updated['plant_acorns'],
            'new_max_balance': updated['max_balance'],
        })

    except Exception as e:
        conn.rollback(); conn.close()
        print(f"Farm harvest error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@farm_bp.route('/api/farm/drops', methods=['GET'])
def farm_drops():
    item_id = request.args.get('item_id', 'plant_acorn')
    table = _get_drop_table_display(item_id)
    if not table:
        return jsonify({'error': 'Unknown item'}), 404
    return jsonify(table)