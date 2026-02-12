from models.database import get_db_connection

def get_user_by_id(tg_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE tg_id = ?', (tg_id,))
    user = cursor.fetchone()
    conn.close()
    return user

def create_user(tg_id, username, display_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO users (tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns)
        VALUES (?, ?, ?, 1000, 0, 0, 0, 0, 0, 0)
    ''', (tg_id, username, display_name))
    conn.commit()
    conn.close()

def update_username(tg_id, username):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tg_id = ?
    ''', (username, tg_id))
    conn.commit()
    conn.close()

def update_display_name(tg_id, display_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tg_id = ?
    ''', (display_name, tg_id))
    conn.commit()
    conn.close()

def update_private_profile(tg_id, is_private):
    conn = get_db_connection()
    cursor = conn.cursor()
    private_int = 1 if is_private else 0
    cursor.execute('''
        UPDATE users SET private_profile = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tg_id = ?
    ''', (private_int, tg_id))
    conn.commit()
    conn.close()

def update_user_balance_and_add_to_battle_history(tg_id, balance_change, opponent_name, is_win, reward_given):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Update user balance and stats
    if is_win == 1:  # Win
        cursor.execute('''
            UPDATE users
            SET total_games = total_games + 1,
                wins = wins + 1,
                balance = balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (balance_change, tg_id))
    elif is_win == 0:  # Loss
        cursor.execute('''
            UPDATE users
            SET total_games = total_games + 1,
                lose = lose + 1,
                balance = balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (balance_change, tg_id))
    else:  # Watching mode
        cursor.execute('''
            UPDATE users
            SET balance = balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE tg_id = ?
        ''', (balance_change, tg_id))
    
    # Add battle history record
    cursor.execute('''
        INSERT INTO battle_history (tg_id, opponent_display_name, bet_amount, is_win, reward_given)
        VALUES (?, ?, 0, ?, ?)
    ''', (tg_id, opponent_name, is_win, reward_given))
    
    conn.commit()
    conn.close()

def get_top_users(limit):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns
        FROM users
        ORDER BY balance DESC
        LIMIT ?
    ''', (limit,))
    players = cursor.fetchall()
    conn.close()
    return players

def get_all_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT tg_id, username, display_name, balance, total_games, wins, lose, private_profile, acorns, plant_acorns
        FROM users
        ORDER BY balance DESC
    ''')
    players = cursor.fetchall()
    conn.close()
    return players

def update_inventory_item(tg_id, item_type, amount):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if item_type == 'acorns':
        cursor.execute('UPDATE users SET acorns = acorns + ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (amount, tg_id))
    elif item_type == 'plant_acorns':
        cursor.execute('UPDATE users SET plant_acorns = plant_acorns + ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?', (amount, tg_id))
    
    conn.commit()
    conn.close()

def update_inventory_after_shop_transaction(tg_id, item_id, quantity, balance_change, is_buy):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Update balance
    cursor.execute('UPDATE users SET balance = balance + ? WHERE tg_id = ?', (balance_change, tg_id))
    
    # Update inventory based on item type
    if item_id == 'acorn':
        cursor.execute('UPDATE users SET acorns = acorns + ? WHERE tg_id = ?', (quantity, tg_id))
    elif item_id == 'plant_acorn':
        cursor.execute('UPDATE users SET plant_acorns = plant_acorns + ? WHERE tg_id = ?', (quantity, tg_id))
    
    conn.commit()
    
    # Get updated values to return
    cursor.execute('SELECT balance, acorns, plant_acorns FROM users WHERE tg_id = ?', (tg_id,))
    updated_user = cursor.fetchone()
    
    conn.close()
    
    return updated_user['balance'], updated_user['acorns'], updated_user['plant_acorns']