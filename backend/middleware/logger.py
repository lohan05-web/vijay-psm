"""Request / error logging middleware."""
import logging
import os
import time
from logging.handlers import RotatingFileHandler

from .auth import current_user, log_activity

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)


def build_logger():
    logger = logging.getLogger("crm")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    file_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, "app.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    logger.addHandler(file_handler)
    logger.addHandler(stream)
    logger.propagate = False
    return logger


logger = build_logger()


def register_middleware(app):
    @app.before_request
    def _start_timer():
        from flask import g
        g.started_at = time.time()

    @app.after_request
    def _log_request(response):
        from flask import g, request
        duration = int((time.time() - getattr(g, "started_at", time.time())) * 1000)
        user = current_user()
        who = user.get("name") if user else "anonymous"
        logger.info(
            "%s %s -> %s (%sms) [%s]",
            request.method, request.path, response.status_code, duration, who,
        )
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and response.status_code < 500:
            if user and not request.path.startswith("/api/auth/login"):
                if not (request.method == "DELETE"
                        and request.path.startswith("/api/reports/activity")):
                    log_activity(
                        user, request.method, entity=request.path,
                        details=f"{response.status_code}",
                    )
        return response

    @app.errorhandler(404)
    def _not_found(e):
        from ..utils.helpers import err
        return err("Endpoint not found", 404)

    @app.errorhandler(405)
    def _method_not_allowed(e):
        from ..utils.helpers import err
        return err("Method not allowed", 405)

    @app.errorhandler(500)
    def _server_error(e):
        logger.exception("Unhandled server error")
        from ..utils.helpers import err
        return err("Internal server error", 500)
