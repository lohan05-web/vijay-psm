"""Employee management controller (admin only)."""
from flask import request
from werkzeug.security import generate_password_hash

from ..middleware.auth import log_activity
from ..services import role_service
from ..services.excel_service import (delete as db_delete, find_all, find_by_id,
                                      find_one, insert, update)
from ..utils import constants as C
from ..utils.helpers import (apply_filters, err, get_payload, make_id, ok,
                             paginate, sort_rows, today_str, now_str)
from ..utils.validators import validate_employee

FILTERS = {"q": "name", "role": "role", "status": "status", "department": "department"}
SORTABLE = ("name", "email", "role", "joined_date", "created_at")


def _public(row):
    data = dict(row)
    data.pop("password", None)
    return data


def _workload(employee_id):
    """Lead / project / task counters for one employee."""
    employee_id = str(employee_id)
    leads = [l for l in find_all("leads") if str(l.get("assigned_to")) == employee_id]
    won = [l for l in leads if l.get("status") == "Won"]
    projects = [p for p in find_all("projects") if str(p.get("manager_id")) == employee_id]
    tasks = [t for t in find_all("project_tasks") if str(t.get("assigned_to")) == employee_id]
    calls = [c for c in find_all("call_logs") if str(c.get("employee_id")) == employee_id]
    return {
        "lead_count": len(leads),
        "won_leads": len(won),
        "project_count": len(projects),
        "task_count": len(tasks),
        "open_tasks": len([t for t in tasks if t.get("status") != "Done"]),
        "call_count": len(calls),
    }


def list_employees():
    leads = find_all("leads")
    projects = find_all("projects")
    tasks = find_all("project_tasks")
    calls = find_all("call_logs")
    rows = []
    for source in find_all("employees"):
        row = _public(source)
        uid = str(row.get("id"))
        row["lead_count"] = len([l for l in leads if str(l.get("assigned_to")) == uid])
        row["won_leads"] = len([l for l in leads if str(l.get("assigned_to")) == uid
                                and l.get("status") == "Won"])
        row["project_count"] = len([p for p in projects if str(p.get("manager_id")) == uid])
        row["task_count"] = len([t for t in tasks if str(t.get("assigned_to")) == uid])
        row["open_tasks"] = len([t for t in tasks if str(t.get("assigned_to")) == uid
                                 and t.get("status") != "Done"])
        row["call_count"] = len([c for c in calls if str(c.get("employee_id")) == uid])
        rows.append(row)
    rows = apply_filters(rows, FILTERS)
    search = (request.args.get("q") or "").strip().lower()
    if search:
        rows = [r for r in rows if search in str(r.get("name", "")).lower()
                or search in str(r.get("email", "")).lower()
                or search in str(r.get("department", "")).lower()
                or search in str(r.get("designation", "")).lower()]
    rows = sort_rows(rows, SORTABLE)
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def _work_items(employee_id):
    """Current workload detail for one employee (leads, tasks, projects)."""
    employee_id = str(employee_id)
    project_map = {str(p.get("id")): p for p in find_all("projects")}
    company_map = {str(c.get("id")): c for c in find_all("companies")}
    leads = [l for l in find_all("leads") if str(l.get("assigned_to")) == employee_id]
    tasks = [t for t in find_all("project_tasks") if str(t.get("assigned_to")) == employee_id]
    managed = [p for p in find_all("projects") if str(p.get("manager_id")) == employee_id]
    leads.sort(key=lambda r: str(r.get("next_followup") or "9999-12-31"))
    tasks.sort(key=lambda r: str(r.get("due_date") or "9999-12-31"))
    return {
        "assigned_leads": [{
            "id": l.get("id"),
            "name": l.get("name"),
            "company_name": company_map.get(str(l.get("company_id")), {}).get("name", ""),
            "status": l.get("status"),
            "priority": l.get("priority"),
            "value": l.get("value"),
            "source": l.get("source"),
            "next_followup": l.get("next_followup", ""),
        } for l in leads],
        "open_tasks": [{
            "id": t.get("id"),
            "title": t.get("title"),
            "project_id": t.get("project_id"),
            "project_name": project_map.get(str(t.get("project_id")), {}).get("name", ""),
            "status": t.get("status"),
            "priority": t.get("priority"),
            "due_date": t.get("due_date", ""),
        } for t in tasks],
        "managed_projects": [{
            "id": p.get("id"),
            "name": p.get("name"),
            "status": p.get("status"),
            "priority": p.get("priority"),
            "progress": p.get("progress"),
            "end_date": p.get("end_date", ""),
        } for p in sorted(managed, key=lambda r: str(r.get("end_date") or "9999-12-31"))],
    }


def get_employee(employee_id):
    row = find_by_id("employees", employee_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    data = _public(row)
    data.update(_workload(employee_id))
    data.update(_work_items(employee_id))
    return ok(data)


def create_employee(user=None):
    data = get_payload()
    data["role"] = role_service.canonical(data.get("role")) or data.get("role")
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
    log_activity(user, "create", entity="employee", entity_id=row["id"], details=email)
    return ok(_public(row), "Employee created", 201)


def update_employee(employee_id, user=None):
    row = find_by_id("employees", employee_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    data = get_payload()
    data.setdefault("email", row.get("email"))
    data.setdefault("role", row.get("role"))
    data.setdefault("name", row.get("name"))
    data["role"] = role_service.canonical(data.get("role")) or data.get("role")
    errors = validate_employee(data, partial=True, allowed_roles=role_service.names())
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    email = str(data.get("email", row.get("email"))).strip().lower()
    existing = find_one("employees", email=email)
    if existing and str(existing.get("id")) != str(employee_id):
        return err(C.MSG_EMAIL_EXISTS, 409)
    changes = {k: v for k, v in data.items() if k in C.TABLE_SCHEMAS["employees"] and k not in ("id", "password")}
    changes["email"] = email
    if data.get("password"):
        changes["password"] = generate_password_hash(data["password"])
    updated = update("employees", employee_id, changes)
    log_activity(user, "update", entity="employee", entity_id=employee_id, details=email)
    return ok(_public(updated), "Employee updated")


def delete_employee(employee_id, user=None):
    from flask import g
    current = user or g.current_user
    if str(current.get("id")) == str(employee_id):
        return err("You cannot delete your own account", 400)
    row = find_by_id("employees", employee_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    db_delete("employees", employee_id)
    log_activity(current, "delete", entity="employee", entity_id=employee_id, details=row.get("email", ""))
    return ok(None, "Employee deleted")
