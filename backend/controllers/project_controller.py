"""Project management controller: projects, tasks, updates, assignments."""
from flask import g, request

from ..middleware.auth import log_activity
from ..services import project_service
from ..services.excel_service import find_all, find_by_id
from ..utils import constants as C
from ..utils.helpers import apply_filters, err, get_payload, ok, paginate, sort_rows
from ..utils.validators import validate_project, validate_task

PROJECT_FILTERS = {"status": "status", "priority": "priority",
                   "company_id": "company_id", "manager_id": "manager_id"}
PROJECT_SORTABLE = ("name", "status", "priority", "progress", "budget", "created_at", "end_date")


def list_projects():
    rows = project_service.list_projects()
    rows = apply_filters(rows, PROJECT_FILTERS)
    search = (request.args.get("q") or "").strip().lower()
    if search:
        rows = [r for r in rows if search in str(r.get("name", "")).lower()
                or search in str(r.get("company_name", "")).lower()]
    if request.args.get("mine") == "1":
        uid = str(g.current_user.get("id"))
        rows = [r for r in rows if str(r.get("manager_id")) == uid]
    rows = sort_rows(rows, PROJECT_SORTABLE)
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def get_project(project_id):
    row = project_service.get_project(project_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row)


def create_project():
    data = get_payload()
    errors = validate_project(data)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    row = project_service.create_project(data, g.current_user)
    return ok(row, "Project created", 201)


def update_project(project_id):
    if not find_by_id("projects", project_id):
        return err(C.MSG_NOT_FOUND, 404)
    data = get_payload()
    errors = validate_project(data, partial=True)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    row = project_service.update_project(project_id, data)
    log_activity(g.current_user, "update", entity="project", entity_id=project_id)
    return ok(row, "Project updated")


def delete_project(project_id):
    if not find_by_id("projects", project_id):
        return err(C.MSG_NOT_FOUND, 404)
    project_service.delete_project(project_id)
    log_activity(g.current_user, "delete", entity="project", entity_id=project_id)
    return ok(None, "Project deleted")


# ---------------------------------------------------------------- tasks
def list_tasks():
    rows = find_all("project_tasks")
    project_map = {p["id"]: p for p in find_all("projects")}
    emp_map = {e["id"]: e for e in find_all("employees")}
    for row in rows:
        row["project_name"] = project_map.get(str(row.get("project_id")), {}).get("name", "")
        row["assigned_to_name"] = emp_map.get(str(row.get("assigned_to")), {}).get("name", "")
    status = (request.args.get("status") or "").strip()
    if status:
        rows = [r for r in rows if str(r.get("status")) == status]
    if request.args.get("mine") == "1":
        uid = str(g.current_user.get("id"))
        rows = [r for r in rows if str(r.get("assigned_to")) == uid]
    rows = sorted(rows, key=lambda r: str(r.get("due_date") or "9999-12-31"))
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def create_task(project_id):
    data = get_payload()
    if project_id:
        data["project_id"] = project_id
    errors = validate_task(data)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    row = project_service.add_task(project_id, data, g.current_user)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Task created", 201)


def update_task(task_id):
    if not find_by_id("project_tasks", task_id):
        return err(C.MSG_NOT_FOUND, 404)
    row = project_service.update_task(task_id, get_payload())
    return ok(row, "Task updated")


def delete_task(task_id):
    if not project_service.delete_task(task_id):
        return err(C.MSG_NOT_FOUND, 404)
    return ok(None, "Task deleted")


# -------------------------------------------------------------- updates
def create_update(project_id):
    data = get_payload()
    if not data.get("message"):
        return err("message is required", 422)
    row = project_service.add_update(project_id, data, g.current_user)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Update posted", 201)


def list_updates():
    rows = find_all("project_updates")
    project_map = {p["id"]: p for p in find_all("projects")}
    emp_map = {e["id"]: e for e in find_all("employees")}
    for row in rows:
        row["project_name"] = project_map.get(str(row.get("project_id")), {}).get("name", "")
        row["author_name"] = emp_map.get(str(row.get("author_id")), {}).get("name", "")
    rows = sorted(rows, key=lambda r: str(r.get("created_at", "")), reverse=True)
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


# --------------------------------------------------------- assignments
def list_assignments():
    rows = find_all("project_assignments")
    project_map = {p["id"]: p for p in find_all("projects")}
    dev_map = {d["id"]: d for d in find_all("developers")}
    for row in rows:
        row["project_name"] = project_map.get(str(row.get("project_id")), {}).get("name", "")
        row["developer_name"] = dev_map.get(str(row.get("developer_id")), {}).get("name", "")
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def create_assignment(project_id):
    data = get_payload()
    if not data.get("developer_id"):
        return err("developer_id is required", 422)
    row = project_service.assign_developer(project_id, data)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Developer assigned", 201)


def release_assignment(assignment_id):
    row = project_service.release_assignment(assignment_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Assignment released")


def delete_assignment(assignment_id):
    if not project_service.delete_assignment(assignment_id):
        return err(C.MSG_NOT_FOUND, 404)
    return ok(None, "Assignment removed")


# ------------------------------------------------------------- team members
def create_member(project_id):
    data = get_payload()
    employee_id = str(data.get("employee_id") or "").strip()
    if not employee_id:
        return err("employee_id is required", 422)
    if not find_by_id("employees", employee_id):
        return err("Employee not found", 404)
    if project_service.active_member(project_id, employee_id):
        return err("Employee is already on this project team", 422)
    row = project_service.assign_member(project_id, data, g.current_user)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Employee added to project", 201)


def list_members(project_id):
    if not find_by_id("projects", project_id):
        return err(C.MSG_NOT_FOUND, 404)
    rows = find_all("project_members", project_id=str(project_id))
    emp_map = {e["id"]: e for e in find_all("employees")}
    for row in rows:
        row["employee_name"] = emp_map.get(str(row.get("employee_id")), {}).get("name", "")
    return ok(rows)


def release_member(member_id):
    row = project_service.release_member(member_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Member released")


def delete_member(member_id):
    if not project_service.delete_member(member_id):
        return err(C.MSG_NOT_FOUND, 404)
    return ok(None, "Member removed")
