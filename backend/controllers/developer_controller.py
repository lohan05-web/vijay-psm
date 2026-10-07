"""Developer directory and allocation controller."""
from flask import g, request

from ..middleware.auth import log_activity
from ..services.excel_service import (delete as db_delete, find_all, find_by_id,
                                      find_one, insert, update)
from ..utils import constants as C
from ..utils.helpers import (apply_filters, err, get_payload, make_id, ok,
                             paginate, sort_rows, now_str)
from ..utils.validators import validate_developer

FILTERS = {"status": "status", "availability": "availability"}
SORTABLE = ("name", "experience", "hourly_rate", "availability", "created_at")


def list_developers():
    rows = find_all("developers")
    rows = apply_filters(rows, FILTERS)
    search = (request.args.get("q") or "").strip().lower()
    if search:
        rows = [r for r in rows if search in str(r.get("name", "")).lower()
                or search in str(r.get("skills", "")).lower()
                or search in str(r.get("email", "")).lower()]
    skill = (request.args.get("skill") or "").strip().lower()
    if skill:
        rows = [r for r in rows if skill in str(r.get("skills", "")).lower()]
    rows = sort_rows(rows, SORTABLE)
    for row in rows:
        row["project_count"] = len([
            a for a in find_all("project_assignments", developer_id=row.get("id"))
            if str(a.get("status")) == "Active"
        ])
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def get_developer(developer_id):
    row = find_by_id("developers", developer_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    data = dict(row)
    assignments = find_all("project_assignments", developer_id=developer_id)
    project_map = {p["id"]: p for p in find_all("projects")}
    for assignment in assignments:
        assignment["project_name"] = project_map.get(
            str(assignment.get("project_id")), {}).get("name", "")
    data["assignments"] = assignments
    data["active_projects"] = len([a for a in assignments if a.get("status") == "Active"])
    return ok(data)


def create_developer():
    data = get_payload()
    errors = validate_developer(data)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    email = str(data.get("email", "")).strip().lower()
    if email and find_one("developers", email=email):
        return err("Developer with this email already exists", 409)
    row = {
        "id": make_id("dev_"),
        "name": data["name"].strip(),
        "email": email,
        "phone": data.get("phone", ""),
        "skills": data.get("skills", ""),
        "experience": data.get("experience", ""),
        "availability": data.get("availability") or "Available",
        "status": data.get("status") or "Active",
        "hourly_rate": data.get("hourly_rate", ""),
        "github": data.get("github", ""),
        "notes": data.get("notes", ""),
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert("developers", row)
    log_activity(g.current_user, "create", entity="developer", entity_id=row["id"], details=row["name"])
    return ok(row, "Developer added", 201)


def update_developer(developer_id):
    if not find_by_id("developers", developer_id):
        return err(C.MSG_NOT_FOUND, 404)
    data = get_payload()
    errors = validate_developer(data, partial=True)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    if data.get("email"):
        data["email"] = str(data["email"]).strip().lower()
        existing = find_one("developers", email=data["email"])
        if existing and str(existing.get("id")) != str(developer_id):
            return err("Developer with this email already exists", 409)
    changes = {k: v for k, v in data.items()
               if k in C.TABLE_SCHEMAS["developers"] and k not in ("id", "created_at")}
    row = update("developers", developer_id, changes)
    log_activity(g.current_user, "update", entity="developer", entity_id=developer_id)
    return ok(row, "Developer updated")


def delete_developer(developer_id):
    if not find_by_id("developers", developer_id):
        return err(C.MSG_NOT_FOUND, 404)
    for assignment in find_all("project_assignments", developer_id=developer_id):
        db_delete("project_assignments", assignment["id"])
    db_delete("developers", developer_id)
    log_activity(g.current_user, "delete", entity="developer", entity_id=developer_id)
    return ok(None, "Developer deleted")
