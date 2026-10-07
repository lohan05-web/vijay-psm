"""Project domain logic: projects, tasks, updates, developer assignments."""
from ..utils import constants as C
from ..utils.helpers import make_id, now_str, within_period
from .excel_service import delete as db_delete, find_all, find_by_id, insert, update
from . import notification_service


def _name(table, row_id):
    if not row_id:
        return ""
    row = find_by_id(table, row_id)
    return row.get("name", "") if row else ""


def enrich(project):
    row = dict(project)
    row["company_name"] = _name("companies", project.get("company_id"))
    row["manager_name"] = _name("employees", project.get("manager_id"))
    try:
        row["task_count"] = len(find_all("project_tasks", project_id=str(project.get("id"))))
        row["done_tasks"] = len(find_all(
            "project_tasks", project_id=str(project.get("id")), status="Done"))
    except Exception:
        row["task_count"] = 0
        row["done_tasks"] = 0
    return row


def list_projects():
    return [enrich(p) for p in find_all("projects")]


def get_project(project_id):
    project = find_by_id("projects", project_id)
    if not project:
        return None
    row = enrich(project)
    row["tasks"] = find_all("project_tasks", project_id=str(project_id))
    row["updates"] = sorted(
        find_all("project_updates", project_id=str(project_id)),
        key=lambda r: str(r.get("created_at", "")), reverse=True,
    )
    row["assignments"] = find_all("project_assignments", project_id=str(project_id))
    for assignment in row["assignments"]:
        assignment["developer_name"] = _name("developers", assignment.get("developer_id"))
    row["members"] = find_all("project_members", project_id=str(project_id))
    for member in row["members"]:
        member["employee_name"] = _name("employees", member.get("employee_id"))
    return row


def create_project(data, user=None):
    project_id = make_id("prj_")
    row = {
        "id": project_id,
        "name": data.get("name", "").strip(),
        "company_id": data.get("company_id", ""),
        "lead_id": data.get("lead_id", ""),
        "manager_id": data.get("manager_id", "") or (user or {}).get("id", ""),
        "status": data.get("status") or "Planning",
        "priority": data.get("priority") or "Medium",
        "budget": data.get("budget", ""),
        "start_date": data.get("start_date", ""),
        "end_date": data.get("end_date", ""),
        "description": data.get("description", ""),
        "progress": data.get("progress", 0),
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert("projects", row)
    if row["manager_id"]:
        notification_service.notify(
            row["manager_id"], "Project assigned",
            f'You are now managing project "{row["name"]}".', "project",
        )
    if user:
        from ..middleware.auth import log_activity
        log_activity(user, "create", entity="project", entity_id=project_id, details=row["name"])
    return enrich(row)


def update_project(project_id, data):
    allowed = {k: v for k, v in data.items() if k in C.TABLE_SCHEMAS["projects"] and k != "id"}
    row = update("projects", project_id, allowed)
    return enrich(row) if row else None


def delete_project(project_id):
    for table in ("project_tasks", "project_updates", "project_assignments",
                  "project_members"):
        for row in find_all(table, project_id=str(project_id)):
            db_delete(table, row["id"])
    return db_delete("projects", project_id)


def add_task(project_id, data, user=None):
    if not find_by_id("projects", project_id):
        return None
    task_id = make_id("tsk_")
    row = {
        "id": task_id,
        "project_id": str(project_id),
        "title": data.get("title", "").strip(),
        "assigned_to": data.get("assigned_to", ""),
        "status": data.get("status") or "To Do",
        "priority": data.get("priority") or "Medium",
        "due_date": data.get("due_date", ""),
        "description": data.get("description", ""),
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert("project_tasks", row)
    if row["assigned_to"]:
        project = find_by_id("projects", project_id)
        notification_service.notify(
            row["assigned_to"], "New task assigned",
            f'Task "{row["title"]}" in project "{project.get("name") if project else ""}".', "task",
        )
    return row


def update_task(task_id, data):
    allowed = {k: v for k, v in data.items() if k in C.TABLE_SCHEMAS["project_tasks"] and k != "id"}
    allowed["updated_at"] = now_str()
    row = update("project_tasks", task_id, allowed)
    if row and data.get("status") == "Done":
        _recalculate_progress(row.get("project_id"))
    return row


def delete_task(task_id):
    return db_delete("project_tasks", task_id)


def add_update(project_id, data, user=None):
    if not find_by_id("projects", project_id):
        return None
    row = {
        "id": make_id("upd_"),
        "project_id": str(project_id),
        "author_id": (user or {}).get("id", ""),
        "update_type": data.get("update_type") or "General",
        "message": data.get("message", ""),
        "progress": data.get("progress", ""),
        "created_at": now_str(),
    }
    insert("project_updates", row)
    if row["progress"] not in ("", None):
        update("projects", project_id, {"progress": row["progress"]})
    return row


def assign_developer(project_id, data):
    if not find_by_id("projects", project_id):
        return None
    row = {
        "id": make_id("asg_"),
        "project_id": str(project_id),
        "developer_id": data.get("developer_id", ""),
        "role": data.get("role") or "Developer",
        "allocated_hours": data.get("allocated_hours", ""),
        "assigned_at": now_str(),
        "released_at": "",
        "status": data.get("status") or "Active",
    }
    insert("project_assignments", row)
    notification_service.notify(
        row["developer_id"], "Added to project",
        f'You have been assigned to project id {project_id}.', "project",
    )
    return row


def release_assignment(assignment_id):
    return update("project_assignments", assignment_id,
                  {"status": "Released", "released_at": now_str()})


def delete_assignment(assignment_id):
    return db_delete("project_assignments", assignment_id)


def assign_member(project_id, data, user=None):
    if not find_by_id("projects", project_id):
        return None
    row = {
        "id": make_id("mem_"),
        "project_id": str(project_id),
        "employee_id": data.get("employee_id", ""),
        "assigned_at": now_str(),
        "released_at": "",
        "status": data.get("status") or "Active",
    }
    insert("project_members", row)
    project = find_by_id("projects", project_id)
    notification_service.notify(
        row["employee_id"], "Added to project team",
        f'You have been added to project "{project.get("name") if project else project_id}".',
        "project", created_by=(user or {}).get("id", ""),
    )
    return row


def release_member(member_id):
    return update("project_members", member_id,
                  {"status": "Released", "released_at": now_str()})


def delete_member(member_id):
    return db_delete("project_members", member_id)


def active_member(project_id, employee_id):
    for row in find_all("project_members", project_id=str(project_id)):
        if (str(row.get("employee_id")) == str(employee_id)
                and row.get("status") != "Released"):
            return row
    return None


def _recalculate_progress(project_id):
    if not project_id:
        return
    tasks = find_all("project_tasks", project_id=str(project_id))
    if not tasks:
        return
    done = len([t for t in tasks if t.get("status") == "Done"])
    update("projects", project_id, {"progress": round(done / len(tasks) * 100, 1)})


def project_stats():
    projects = find_all("projects")
    stats = {"total": len(projects), "by_status": {}, "budget_total": 0.0,
             "active": 0, "completed": 0}
    for project in projects:
        status = project.get("status") or "Planning"
        stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
        try:
            stats["budget_total"] += float(project.get("budget") or 0)
        except (TypeError, ValueError):
            pass
        if status == "Completed":
            stats["completed"] += 1
        elif status not in ("Cancelled",):
            stats["active"] += 1
    return stats


def projects_created_in(period):
    return [r for r in find_all("projects") if within_period(r.get("created_at"), period)]
