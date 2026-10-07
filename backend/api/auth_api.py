"""Auth routes: /api/auth/*"""
from flask import Blueprint, g, request

from ..controllers import auth_controller
from ..middleware.auth import token_required
from ..middleware.roles import admin_required
from ..services import notification_service
from ..services.excel_service import find_one
from ..utils.helpers import err, get_payload, ok

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/login")
def login():
    return auth_controller.login()


# Only admins may create accounts: passwords are set by the admin.
@auth_bp.post("/register")
@token_required
@admin_required
def register():
    return auth_controller.register()


@auth_bp.get("/me")
@token_required
def me():
    return auth_controller.me()


@auth_bp.put("/profile")
@token_required
def update_profile():
    return auth_controller.update_profile()


# Password changes are admin-only; admins reset them from the Employees page.
@auth_bp.put("/change-password")
@token_required
@admin_required
def change_password():
    return auth_controller.change_password()


# ------------------------------------------------------------ notifications
# Admin sends a message to an employee's notification inbox.
@auth_bp.post("/notifications")
@token_required
@admin_required
def send_notification():
    data = get_payload()
    user_id = str(data.get("user_id") or "").strip()
    message = str(data.get("message") or "").strip()
    title = str(data.get("title") or "").strip() or "Message from the admin"
    if not user_id or not message:
        return err("Employee and message are required", 422)
    if not find_one("employees", id=user_id):
        return err("Employee not found", 404)
    row = notification_service.notify(user_id, title, message, "message",
                                      created_by=g.current_user["id"])
    return ok(row, "Message sent", 201)


# Any signed-in role can reply to a message sent to them.
@auth_bp.post("/notifications/<notification_id>/reply")
@token_required
def reply_notification(notification_id):
    row = notification_service.find_by_id(notification_id)
    if not row or str(row.get("user_id")) != str(g.current_user["id"]):
        return err("Notification not found", 404)
    sender = str(row.get("created_by") or "")
    if not sender:
        return err("This message cannot be replied to", 422)
    data = get_payload()
    message = str(data.get("message") or "").strip()
    if not message:
        return err("Reply message is required", 422)
    reply = notification_service.notify(
        sender, "Re: " + str(row.get("title") or "your message"), message,
        "reply", created_by=g.current_user["id"])
    return ok(reply, "Reply sent", 201)


@auth_bp.get("/notifications")
@token_required
def notifications():
    unread_only = str(request.args.get("unread", "")).lower() == "1"
    rows = notification_service.list_for_user(g.current_user["id"], unread_only)
    return ok({"items": rows[:100], "unread": notification_service.unread_count(g.current_user["id"])})


@auth_bp.put("/notifications/read-all")
@token_required
def read_all_notifications():
    return ok({"count": notification_service.mark_all_read(g.current_user["id"])},
              "Notifications marked as read")


@auth_bp.put("/notifications/<notification_id>/read")
@token_required
def read_notification(notification_id):
    row = notification_service.mark_read(notification_id, g.current_user["id"])
    if not row:
        return err("Notification not found", 404)
    return ok(row, "Marked as read")


@auth_bp.delete("/notifications/<notification_id>")
@token_required
def delete_notification(notification_id):
    if not notification_service.remove(notification_id):
        return err("Notification not found", 404)
    return ok(None, "Notification deleted")
