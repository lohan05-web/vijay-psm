"""Project routes: /api/projects (+ tasks, updates, assignments)."""
from flask import Blueprint

from ..controllers import project_controller
from ..middleware.auth import token_required
from ..middleware.roles import roles_required

project_bp = Blueprint("projects", __name__, url_prefix="/api/projects")


@project_bp.get("")
@token_required
def list_projects():
    return project_controller.list_projects()


@project_bp.post("")
@token_required
@roles_required("admin", "employee")
def create_project():
    return project_controller.create_project()


@project_bp.get("/<project_id>")
@token_required
def get_project(project_id):
    return project_controller.get_project(project_id)


@project_bp.put("/<project_id>")
@token_required
@roles_required("admin", "employee")
def update_project(project_id):
    return project_controller.update_project(project_id)


@project_bp.delete("/<project_id>")
@token_required
@roles_required("admin")
def delete_project(project_id):
    return project_controller.delete_project(project_id)


@project_bp.post("/<project_id>/tasks")
@token_required
@roles_required("admin", "employee")
def create_task(project_id):
    return project_controller.create_task(project_id)


@project_bp.get("/<project_id>/tasks")
@token_required
def project_tasks(project_id):
    from ..services.excel_service import find_all
    from ..utils.helpers import ok
    return ok(find_all("project_tasks", project_id=str(project_id)))


@project_bp.post("/<project_id>/updates")
@token_required
def create_update(project_id):
    return project_controller.create_update(project_id)


@project_bp.get("/<project_id>/updates")
@token_required
def project_updates(project_id):
    from ..services.excel_service import find_all
    from ..utils.helpers import ok
    return ok(find_all("project_updates", project_id=str(project_id)))


@project_bp.post("/<project_id>/assignments")
@token_required
@roles_required("admin", "employee")
def create_assignment(project_id):
    return project_controller.create_assignment(project_id)


@project_bp.get("/<project_id>/assignments")
@token_required
def project_assignments(project_id):
    from ..services.excel_service import find_all
    from ..utils.helpers import ok
    return ok(find_all("project_assignments", project_id=str(project_id)))


# ------------------------------------------------- global task endpoints
@project_bp.get("/tasks/all")
@token_required
def all_tasks():
    return project_controller.list_tasks()


@project_bp.put("/tasks/<task_id>")
@token_required
def update_task(task_id):
    return project_controller.update_task(task_id)


@project_bp.delete("/tasks/<task_id>")
@token_required
@roles_required("admin", "employee")
def delete_task(task_id):
    return project_controller.delete_task(task_id)


@project_bp.get("/updates/all")
@token_required
def all_updates():
    return project_controller.list_updates()


@project_bp.get("/assignments/all")
@token_required
def all_assignments():
    return project_controller.list_assignments()


@project_bp.put("/assignments/<assignment_id>/release")
@token_required
@roles_required("admin", "employee")
def release_assignment(assignment_id):
    return project_controller.release_assignment(assignment_id)


@project_bp.delete("/assignments/<assignment_id>")
@token_required
@roles_required("admin", "employee")
def delete_assignment(assignment_id):
    return project_controller.delete_assignment(assignment_id)


# ---------------------------------------------------------- team members
@project_bp.post("/<project_id>/members")
@token_required
@roles_required("admin", "employee")
def create_member(project_id):
    return project_controller.create_member(project_id)


@project_bp.get("/<project_id>/members")
@token_required
def project_members(project_id):
    return project_controller.list_members(project_id)


@project_bp.put("/members/<member_id>/release")
@token_required
@roles_required("admin", "employee")
def release_member(member_id):
    return project_controller.release_member(member_id)


@project_bp.delete("/members/<member_id>")
@token_required
@roles_required("admin", "employee")
def delete_member(member_id):
    return project_controller.delete_member(member_id)
