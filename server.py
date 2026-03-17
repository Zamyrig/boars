import os
from flask import Flask, send_file, send_from_directory, jsonify
from flask_cors import CORS
from db.database import init_db, migrate_from_json_on_startup, migrate_from_json_manual_call
from routes.user import auth_bp, user_bp
from routes.battle import battle_bp
from routes.shop import shop_bp
from routes.leaderboard import leaderboard_bp
from routes.farm import farm_bp
from routes.forest import forest_bp

# ── CONFIG ────────────────────────────────────────────────────────────────────
PORT     = int(os.environ.get('PORT', 3000))
APP_ROOT = os.environ.get('APP_ROOT', '')  # например '/boar-game-dev' или '/boar-game'
BASE_DIR = os.path.dirname(__file__)

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# ── BLUEPRINTS (без префикса) ─────────────────────────────────────────────────
app.register_blueprint(auth_bp)
app.register_blueprint(user_bp)
app.register_blueprint(battle_bp)
app.register_blueprint(shop_bp)
app.register_blueprint(leaderboard_bp)
app.register_blueprint(farm_bp)
app.register_blueprint(forest_bp)

# ── BLUEPRINTS (с префиксом APP_ROOT) ────────────────────────────────────────
if APP_ROOT:
    app.register_blueprint(auth_bp,        url_prefix=APP_ROOT, name='auth_bp_prefixed')
    app.register_blueprint(user_bp,        url_prefix=APP_ROOT, name='user_bp_prefixed')
    app.register_blueprint(battle_bp,      url_prefix=APP_ROOT, name='battle_bp_prefixed')
    app.register_blueprint(shop_bp,        url_prefix=APP_ROOT, name='shop_bp_prefixed')
    app.register_blueprint(leaderboard_bp, url_prefix=APP_ROOT, name='leaderboard_bp_prefixed')
    app.register_blueprint(farm_bp,        url_prefix=APP_ROOT, name='farm_bp_prefixed')
    app.register_blueprint(forest_bp,      url_prefix=APP_ROOT, name='forest_bp_prefixed')

# ── STATIC (без префикса) ─────────────────────────────────────────────────────
@app.route('/')
def index():
    frontend_path = os.path.join(BASE_DIR, 'index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return 'Сервер КАБАНОВ запущен!'

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'assets'), filename)

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'js'), filename)

@app.route('/prices.json')
def serve_prices():
    return send_file(os.path.join(BASE_DIR, 'prices.json'))

@app.route('/items.json')
def serve_items():
    return send_file(os.path.join(BASE_DIR, 'items.json'))

# ── STATIC (с префиксом APP_ROOT) ────────────────────────────────────────────
if APP_ROOT:
    @app.route(f'{APP_ROOT}')
    def index_prefixed():
        return send_file(os.path.join(BASE_DIR, 'index.html'))

    @app.route(f'{APP_ROOT}/')
    def index_prefixed_slash():
        return send_file(os.path.join(BASE_DIR, 'index.html'))

    @app.route(f'{APP_ROOT}/assets/<path:filename>')
    def serve_assets_prefixed(filename):
        return send_from_directory(os.path.join(BASE_DIR, 'assets'), filename)

    @app.route(f'{APP_ROOT}/css/<path:filename>')
    def serve_css_prefixed(filename):
        return send_from_directory(os.path.join(BASE_DIR, 'css'), filename)

    @app.route(f'{APP_ROOT}/js/<path:filename>')
    def serve_js_prefixed(filename):
        return send_from_directory(os.path.join(BASE_DIR, 'js'), filename)

    @app.route(f'{APP_ROOT}/prices.json')
    def serve_prices_prefixed():
        return send_file(os.path.join(BASE_DIR, 'prices.json'))

    @app.route(f'{APP_ROOT}/items.json')
    def serve_items_prefixed():
        return send_file(os.path.join(BASE_DIR, 'items.json'))

# ── MISC ──────────────────────────────────────────────────────────────────────
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
    app.run(host='0.0.0.0', port=PORT, debug=True)
