from models.database import init_db, migrate_from_json_on_startup

def initialize_app():
    """Initialize the application by setting up the database"""
    migrate_from_json_on_startup()
    init_db()