"""Notification service backed by notifications.xlsx."""
from ..utils.helpers import make_id, now_str, ok, err
from .excel_service import delete as db_delete, find_all, find_one, insert, update


def notify(user_id, title, message, type="info", created_by=None):
    if not user_id:
        return None
    return insert("notifications", {
        "id": make_id("ntf_"),
        "user_id": str(user_id),
        "title": title,
        "message": message,
        "type": type,
        "is_read": "No",
        "created_by": str(created_by or ""),
        "created_at": now_str(),
    })


def notify_role(role, title, message, type="info"):
    from .excel_service import find_all as rows
    created = []
    for employee in rows("employees", role=role, status="Active"):
        created.append(notify(employee["id"], title, message, type))
    return created


def notify_many(user_ids, title, message, type="info"):
    return [notify(uid, title, message, type) for uid in user_ids if uid]


def list_for_user(user_id, unread_only=False):
    rows = find_all("notifications", user_id=str(user_id))
    if unread_only:
        rows = [r for r in rows if str(r.get("is_read")).lower() in ("no", "false", "0")]
    return sorted(rows, key=lambda r: str(r.get("created_at", "")), reverse=True)


def unread_count(user_id):
    return len([r for r in list_for_user(user_id) if str(r.get("is_read")).lower() in ("no", "false", "0")])


def mark_read(notification_id, user_id=None):
    row = find_by_id(notification_id)
    if not row:
        return None
    if user_id and str(row.get("user_id")) != str(user_id):
        return None
    return update("notifications", notification_id, {"is_read": "Yes"})


def mark_all_read(user_id):
    count = 0
    for row in list_for_user(user_id):
        if str(row.get("is_read")).lower() in ("no", "false", "0"):
            update("notifications", row["id"], {"is_read": "Yes"})
            count += 1
    return count


def remove(notification_id):
    return db_delete("notifications", notification_id)


def find_by_id(notification_id):
    return find_one("notifications", id=str(notification_id))
