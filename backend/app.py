"""CRM Flask application entry point.

Run from the project root:
    python backend/app.py
    python -m backend.app
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from flask import Flask, jsonify, request, send_from_directory  # noqa: E402
from flask_cors import CORS  # noqa: E402
from werkzeug.utils import secure_filename  # noqa: E402

from backend.middleware.logger import logger, register_middleware  # noqa: E402
from backend.middleware.auth import token_required  # noqa: E402
from backend.services import excel_service  # noqa: E402
from backend.utils import constants as C  # noqa: E402
from backend.utils.config import (APP_HOST, APP_PORT, FLASK_DEBUG,  # noqa: E402
                                  FRONTEND_DIR, UPLOAD_DIR)
from backend.utils.helpers import err, make_id, ok, now_str  # noqa: E402

UPLOAD_CATEGORIES = ("project_documents", "proposals", "invoices", "call_recordings")
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".pdf", ".doc", ".docx",
                      ".xls", ".xlsx", ".csv", ".mp3", ".mp4", ".wav", ".zip", ".txt"}


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
    app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
    CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*"}})

    register_middleware(app)

    from backend.api.auth_api import auth_bp
    from backend.api.employee_api import employee_bp, role_bp
    from backend.api.lead_api import call_bp, followup_bp, lead_bp
    from backend.api.company_api import company_bp
    from backend.api.project_api import project_bp
    from backend.api.developer_api import developer_bp
    from backend.api.report_api import report_bp

    for blueprint in (auth_bp, employee_bp, role_bp, lead_bp, followup_bp, call_bp,
                      company_bp, project_bp, developer_bp, report_bp):
        app.register_blueprint(blueprint)

    _register_frontend(app)
    _register_uploads(app)

    with app.app_context():
        excel_service.seed_defaults()
    logger.info("CRM backend ready on http://%s:%s", APP_HOST, APP_PORT)
    return app


def _register_frontend(app):
    pages_dir = os.path.join(FRONTEND_DIR, "pages")

    @app.get("/")
    def index():
        return send_from_directory(pages_dir, "login.html")

    @app.get("/pages/<path:filename>")
    def pages(filename):
        return send_from_directory(pages_dir, filename)

    @app.get("/components/<path:filename>")
    def components(filename):
        return send_from_directory(os.path.join(FRONTEND_DIR, "components"), filename)

    @app.get("/css/<path:filename>")
    def css(filename):
        return send_from_directory(os.path.join(FRONTEND_DIR, "css"), filename)

    @app.get("/js/<path:filename>")
    def js(filename):
        return send_from_directory(os.path.join(FRONTEND_DIR, "js"), filename)

    @app.get("/assets/<path:filename>")
    def assets(filename):
        return send_from_directory(os.path.join(FRONTEND_DIR, "assets"), filename)

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "crm-backend"})


def _register_uploads(app):
    @app.post("/api/uploads/<category>")
    @token_required
    def upload_file(category):
        if category not in UPLOAD_CATEGORIES:
            return err(f"Unknown upload category '{category}'", 404)
        file = request.files.get("file")
        if not file or not file.filename:
            return err("No file provided", 400)
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return err(f"File type '{ext}' is not allowed", 415)
        directory = os.path.join(UPLOAD_DIR, category)
        os.makedirs(directory, exist_ok=True)
        filename = f"{make_id('upl_')}_{secure_filename(file.filename)}"
        path = os.path.join(directory, filename)
        file.save(path)
        return ok({
            "filename": filename,
            "category": category,
            "path": os.path.relpath(path, ROOT).replace("\\", "/"),
            "size": os.path.getsize(path),
            "uploaded_at": now_str(),
        }, "File uploaded", 201)

    @app.get("/api/uploads/<category>")
    @token_required
    def list_uploads(category):
        if category not in UPLOAD_CATEGORIES:
            return err(f"Unknown upload category '{category}'", 404)
        directory = os.path.join(UPLOAD_DIR, category)
        os.makedirs(directory, exist_ok=True)
        files = []
        for name in sorted(os.listdir(directory)):
            full = os.path.join(directory, name)
            if os.path.isfile(full):
                files.append({"filename": name, "size": os.path.getsize(full),
                              "path": os.path.relpath(full, ROOT).replace("\\", "/")})
        return ok(files)


app = create_app()

if __name__ == "__main__":
    try:
        app.run(host=APP_HOST, port=APP_PORT, debug=FLASK_DEBUG)
    except OSError as exc:
        print(f"\n[CRM] Could not bind to port {APP_PORT}: {exc}")
        print("[CRM] Another process is already using that port.")
        print(f"[CRM] Stop it, or set a different port in .env (APP_PORT=5001) and rerun.\n")
        raise SystemExit(1)
