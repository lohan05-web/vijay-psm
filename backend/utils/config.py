"""Environment configuration loaded from the project root .env file."""
import os

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
JWT_SECRET = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "720"))

FLASK_ENV = os.getenv("FLASK_ENV", "development")
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "1") == "1"
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "5000"))

EXCEL_DIR = os.path.join(BACKEND_DIR, os.getenv("EXCEL_DIR", "excel").replace("backend/", "").replace("backend\\", ""))
UPLOAD_DIR = os.path.join(PROJECT_ROOT, os.getenv("UPLOAD_DIR", "uploads"))
REPORTS_DIR = os.path.join(PROJECT_ROOT, os.getenv("REPORTS_DIR", "reports"))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, os.getenv("FRONTEND_DIR", "frontend"))

DEFAULT_ADMIN_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@crm.com")
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin@123")
