from flask import Flask
from flask_cors import CORS
import os

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
PORT = 3000
DB_PATH = './database.db'
STATIC_PATH = os.path.join(os.path.dirname(__file__), 'assets')

CORS(app)

# Import routes after app initialization to avoid circular imports
from routes.main_routes import *
from routes.auth_routes import *
from routes.battle_routes import *
from routes.leaderboard_routes import *
from routes.user_routes import *
from routes.shop_routes import *

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)