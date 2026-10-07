"""JWT authentication middleware."""
import jwt
from flask import g, request

from ..services.excel_service import find_by_id, find_one
from ..utils import constants as C
from ..utils.helpers import err, make_id, now_str


def create_token(user, expires_minutes=None):
    from datetime import datetime, timedelta, timezone

    from ..utils.config import JWT_ALGORITHM, JWT_EXPIRES_MINUTES, JWT_SECRET
    issued = datetime.now(timezone.utc)
    ttl = expires_minutes or JWT_EXPIRES_MINUTES
    payload = {
        "sub": str(user.get("id")),
        "role": user.get("role", ""),
        "name": user.get("name", ""),
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(minutes=ttl)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token):
    from ..utils.config import JWT_SECRET, JWT_ALGORITHM
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def get_token():
    header = request.headers.get(C.TOKEN_HEADER, "")
    if header.startswith(C.TOKEN_PREFIX):
        return header[len(C.TOKEN_PREFIX):].strip()
    return request.args.get("token") or ""


def current_user():
    return getattr(g, "current_user", None)


def token_required(fn):
    """Decorator: validates the bearer token and loads g.current_user."""
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = get_token()
        if not token:
            return err(C.MSG_UNAUTHORIZED, 401)
        try:
            payload = decode_token(token)
        except Exception:
            return err(C.MSG_UNAUTHORIZED, 401)
        user = find_by_id("employees", payload.get("sub"))
        if not user:
            return err(C.MSG_UNAUTHORIZED, 401)
        if str(user.get("status", "Active")) != "Active":
            return err(C.MSG_INACTIVE, 403)
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def log_activity(user, action, entity="", entity_id="", details=""):
    """Append a row to activity_logs.xlsx (never raises)."""
    try:
        row = {
            "id": make_id("log_"),
            "user_id": (user or {}).get("id", ""),
            "user_name": (user or {}).get("name", "system"),
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "details": details,
            "created_at": now_str(),
        }
        from ..services.excel_service import insert
        insert("activity_logs", row)
    except Exception:
        pass
