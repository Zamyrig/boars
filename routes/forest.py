import random
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from db.database import get_db_connection, check_update_max_balance

forest_bp = Blueprint('forest', __name__)

# ── Константы ─────────────────────────────────────────────────────────────────
RAID_MAX_HOURS   = 10          # максимум в походе
RAID_REST_HOURS  = 4           # отдых после возвращения
ACORN_CHANCE     = 0.50        # шанс найти что-то за каждый час
# Распределение кол-ва желудей за «удачный» час:
ACORN_ROLLS = [(1, 0.75), (2, 0.20), (3, 0.05)]


def _roll_raid_acorns(hours_away: int) -> int:
    """Считает сколько желудей нашёл кабан за hours_away часов."""
    total = 0
    for _ in range(hours_away):
        if random.random() < ACORN_CHANCE:
            roll = random.random()
            cumulative = 0.0
            for amount, chance in ACORN_ROLLS:
                cumulative += chance
                if roll < cumulative:
                    total += amount
                    break
    return total


def _ensure_raid_table(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS boar_raid (
            tg_id       TEXT PRIMARY KEY,
            raid_start  TIMESTAMP,
            raid_end    TIMESTAMP,
            rest_until  TIMESTAMP,
            returned    INTEGER DEFAULT 0,
            acorns_found INTEGER DEFAULT 0
        )
    ''')
    conn.commit()


def _get_raid(cursor, tg_id: str) -> dict | None:
    cursor.execute('SELECT * FROM boar_raid WHERE tg_id = ?', (tg_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def _raid_status(raid: dict | None, now: datetime) -> dict:
    """Возвращает текущий статус похода в удобном виде."""
    if not raid:
        return {'state': 'idle'}

    raid_start  = datetime.fromisoformat(str(raid['raid_start']))  if raid.get('raid_start')  else None
    raid_end    = datetime.fromisoformat(str(raid['raid_end']))    if raid.get('raid_end')    else None
    rest_until  = datetime.fromisoformat(str(raid['rest_until'])) if raid.get('rest_until')  else None

    # Кабан отдыхает
    if rest_until and now < rest_until:
        return {
            'state': 'resting',
            'rest_seconds_left': max(0, int((rest_until - now).total_seconds())),
            'acorns_found': raid.get('acorns_found', 0),
        }

    # Кабан в походе — авто-возврат через RAID_MAX_HOURS
    if raid_end and not raid.get('returned') and now < raid_end:
        hours_away = int((now - raid_start).total_seconds() // 3600)
        return {
            'state': 'raiding',
            'raid_start': raid['raid_start'],
            'raid_end':   raid['raid_end'],
            'seconds_left': max(0, int((raid_end - now).total_seconds())),
            'hours_away': hours_away,
        }

    # Поход завершён но не забран (авто-возврат истёк)
    if raid_end and not raid.get('returned') and now >= raid_end:
        return {
            'state': 'raid_done',
            'acorns_found': raid.get('acorns_found', 0),
        }

    return {'state': 'idle'}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@forest_bp.route('/api/forest/state', methods=['GET'])
def forest_state():
    tg_id = request.args.get('tg_id')
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400

    conn = get_db_connection()
    _ensure_raid_table(conn)
    cursor = conn.cursor()

    _auto_complete_raid(cursor, conn, tg_id)

    raid = _get_raid(cursor, tg_id)
    conn.close()

    now = datetime.utcnow()
    return jsonify(_raid_status(raid, now))


@forest_bp.route('/api/forest/raid/start', methods=['POST'])
def raid_start():
    data  = request.get_json()
    tg_id = str(data.get('tg_id', ''))
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400

    conn = get_db_connection()
    _ensure_raid_table(conn)
    cursor = conn.cursor()

    now = datetime.utcnow()
    _auto_complete_raid(cursor, conn, tg_id)
    raid = _get_raid(cursor, tg_id)
    status = _raid_status(raid, now)

    if status['state'] == 'raiding':
        conn.close()
        return jsonify({'error': 'Кабан уже в походе'}), 400
    if status['state'] == 'resting':
        conn.close()
        return jsonify({'error': f'Кабан устал, отдыхает ещё {status["rest_seconds_left"]//60} мин'}), 400

    raid_end = now + timedelta(hours=RAID_MAX_HOURS)

    cursor.execute('''
        INSERT INTO boar_raid (tg_id, raid_start, raid_end, rest_until, returned, acorns_found)
        VALUES (?, ?, ?, NULL, 0, 0)
        ON CONFLICT(tg_id) DO UPDATE SET
            raid_start=excluded.raid_start,
            raid_end=excluded.raid_end,
            rest_until=NULL,
            returned=0,
            acorns_found=0
    ''', (tg_id, now.isoformat(), raid_end.isoformat()))
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'raid_start': now.isoformat(),
        'raid_end':   raid_end.isoformat(),
        'seconds_left': RAID_MAX_HOURS * 3600,
    })


@forest_bp.route('/api/forest/raid/return', methods=['POST'])
def raid_return():
    """Игрок вручную возвращает кабана из похода."""
    data  = request.get_json()
    tg_id = str(data.get('tg_id', ''))
    if not tg_id:
        return jsonify({'error': 'tg_id required'}), 400

    conn = get_db_connection()
    _ensure_raid_table(conn)
    cursor = conn.cursor()

    now = datetime.utcnow()
    raid = _get_raid(cursor, tg_id)
    status = _raid_status(raid, now)

    if status['state'] not in ('raiding', 'raid_done'):
        conn.close()
        return jsonify({'error': 'Кабан не в походе'}), 400

    raid_start = datetime.fromisoformat(str(raid['raid_start']))
    hours_away = max(1, int((now - raid_start).total_seconds() // 3600))
    hours_away = min(hours_away, RAID_MAX_HOURS)

    acorns = _roll_raid_acorns(hours_away)
    rest_until = now + timedelta(hours=RAID_REST_HOURS)

    # Начисляем желуди
    cursor.execute('''
        UPDATE users SET acorns = acorns + ?, updated_at = CURRENT_TIMESTAMP
        WHERE tg_id = ?
    ''', (acorns, tg_id))

    cursor.execute('''
        UPDATE boar_raid SET returned=1, acorns_found=?, rest_until=?
        WHERE tg_id=?
    ''', (acorns, rest_until.isoformat(), tg_id))
    conn.commit()

    cursor.execute('SELECT acorns FROM users WHERE tg_id=?', (tg_id,))
    user = cursor.fetchone()
    conn.close()

    return jsonify({
        'success': True,
        'hours_away': hours_away,
        'acorns_found': acorns,
        'new_acorns': user['acorns'],
        'rest_until': rest_until.isoformat(),
        'rest_seconds': RAID_REST_HOURS * 3600,
    })


def _auto_complete_raid(cursor, conn, tg_id: str):
    """Авто-завершение если кабан пробыл 10 часов и никто не забрал."""
    raid = _get_raid(cursor, tg_id)
    if not raid or raid.get('returned'):
        return
    raid_end = datetime.fromisoformat(str(raid['raid_end'])) if raid.get('raid_end') else None
    if raid_end and datetime.utcnow() >= raid_end:
        acorns = _roll_raid_acorns(RAID_MAX_HOURS)
        rest_until = datetime.utcnow() + timedelta(hours=RAID_REST_HOURS)
        cursor.execute('''
            UPDATE users SET acorns = acorns + ?, updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (acorns, tg_id))
        cursor.execute('''
            UPDATE boar_raid SET returned=1, acorns_found=?, rest_until=?
            WHERE tg_id=?
        ''', (acorns, rest_until.isoformat(), tg_id))
        conn.commit()