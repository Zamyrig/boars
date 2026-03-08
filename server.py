import os
from flask import Flask, send_file, send_from_directory, jsonify
from flask_cors import CORS

from db.database import init_db, migrate_from_json_on_startup, migrate_from_json_manual_call
from routes.user import auth_bp, user_bp
from routes.battle import battle_bp
from routes.shop import shop_bp
from routes.leaderboard import leaderboard_bp
from routes.farm import farm_bp


# ── CONFIG ────────────────────────────────────────────────────────────────────
PORT        = int(os.environ.get('PORT', 3000))
STATIC_PATH = os.path.join(os.path.dirname(__file__), 'assets')

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# ── BLUEPRINTS ────────────────────────────────────────────────────────────────
app.register_blueprint(auth_bp)
app.register_blueprint(user_bp)
app.register_blueprint(battle_bp)
app.register_blueprint(shop_bp)
app.register_blueprint(leaderboard_bp)
app.register_blueprint(farm_bp)

# ── STATIC / MISC ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    frontend_path = os.path.join(os.path.dirname(__file__), 'index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return 'Сервер КАБАНОВ запущен!'


@app.route('/assets/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_PATH, filename)


@app.route('/prices.json')
def serve_prices():
    prices_path = os.path.join(os.path.dirname(__file__), 'prices.json')
    return send_file(prices_path)


@app.route('/api/migrate', methods=['POST'])
def migrate():
    result = migrate_from_json_manual_call()
    if result.get('success'):
        return jsonify(result)
    return jsonify(result), 500


# ── ENTRY POINT ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    migrate_from_json_on_startup()
    print(f'Сервер запущен: http://localhost:{PORT}')
    print(f'Статика: {STATIC_PATH}')
    app.run(host='0.0.0.0', port=PORT, debug=True)
