from flask import send_file, send_from_directory
import os
from server import app

@app.route('/')
def index():
    frontend_path = os.path.join(os.path.dirname(__file__), '../index.html')
    if os.path.exists(frontend_path):
        return send_file(frontend_path)
    return 'Сервер КАБАНОВ запущен! API доступно по адресу /api/...'

@app.route('/assets/<path:filename>')
def serve_static(filename):
    return send_from_directory('../assets', filename)