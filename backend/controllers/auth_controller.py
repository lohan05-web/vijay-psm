"""Authentication controller: login, register, profile, password change."""
from werkzeug.security import check_password_hash, generate_password_hash

from ..middleware.auth import create_token, log_activity, token_required
from ..middleware.roles import admin_required
from ..services import role_service
from ..services.excel_service import find_one, insert, update
from ..utils import constants as C
from ..utils.helpers import err, get_payload, make_id, ok, now_str, today_str
from ..utils.validators import validate_employee


def login():
    data = get_payload()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not email or not password:
        return err("Email and password are required", 400)
    user = find_one("employees", email=email)
    if not user or not check_password_hash(str(user.get("password", "")), password):
        return err(C.MSG_BAD_CREDENTIALS, 401)
    if str(user.get("status", "Active")) != "Active":
        return err(C.MSG_INACTIVE, 403)
    token = create_token(user)
    log_activity(user, "login", entity="auth", details=email)
    return ok({
        "token": token,
        "user": _public_user(user),
    }, "Logged in successfully")


def register():
    data = get_payload()
    data["role"] = role_service.canonical(data.get("role")) or data.get("role", C.ROLE_EMPLOYEE)
    errors = validate_employee(data, allowed_roles=role_service.names())
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    email = str(data["email"]).strip().lower()
    if find_one("employees", email=email):
        return err(C.MSG_EMAIL_EXISTS, 409)
    row = {
        "id": make_id("emp_"),
        "name": data["name"].strip(),
        "email": email,
        "password": generate_password_hash(data["password"]),
        "phone": data.get("phone", ""),
        "role": data.get("role", C.ROLE_EMPLOYEE),
        "status": data.get("status", "Active"),
        "department": data.get("department", ""),
        "designation": data.get("designation", ""),
        "joined_date": data.get("joined_date") or today_str(),
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert("employees", row)
    return ok(_public_user(row), "Employee created", 201)


def me():
    from flask import g
    return ok(_public_user(g.current_user))


def change_password():
    from flask import g
    data = get_payload()
    current = str(data.get("current_password", ""))
    new_password = str(data.get("new_password", ""))
    if len(new_password) < 6:
        return err("New password must be at least 6 characters", 422)
    user = g.current_user
    if not check_password_hash(str(user.get("password", "")), current):
        return err("Current password is incorrect", 400)
    update("employees", user["id"], {"password": generate_password_hash(new_password)})
    return ok(None, "Password changed successfully")


def update_profile():
    from flask import g
    data = get_payload()
    allowed = {k: v for k, v in data.items()
               if k in ("name", "phone", "department", "designation") and v is not None}
    row = update("employees", g.current_user["id"], allowed)
    return ok(_public_user(row), "Profile updated")


def _public_user(user):
    if not user:
        return None
    data = {k: user.get(k, "") for k in (
        "id", "name", "email", "phone", "role", "status",
        "department", "designation", "joined_date", "created_at",
    )}
    data["access"] = role_service.access_for(user.get("role"))
    return data
