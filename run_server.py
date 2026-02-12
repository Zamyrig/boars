from server.utils.init_utils import initialize_app
from server import app

# Initialize the application
initialize_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=app.config.get('PORT', 3000))