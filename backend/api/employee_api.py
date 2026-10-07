"""Employee and role routes: /api/employees, /api/roles."""
from flask import Blueprint, g

from ..controllers import employee_controller, role_controller
from ..middleware.auth import token_required
from ..middleware.roles import admin_required, roles_required

employee_bp = Blueprint("employees", __name__, url_prefix="/api/employees")
role_bp = Blueprint("roles", __name__, url_prefix="/api/roles")


@employee_bp.get("")
@token_required
def list_employees():
    return employee_controller.list_employees()


@employee_bp.post("")
@token_required
@admin_required
def create_employee():
    return employee_controller.create_employee(g.current_user)


@employee_bp.get("/<employee_id>")
@token_required
@roles_required("admin", "employee")
def get_employee(employee_id):
    return employee_controller.get_employee(employee_id)


@employee_bp.put("/<employee_id>")
@token_required
@admin_required
def update_employee(employee_id):
    return employee_controller.update_employee(employee_id, g.current_user)


@employee_bp.delete("/<employee_id>")
@token_required
@admin_required
def delete_employee(employee_id):
    return employee_controller.delete_employee(employee_id, g.current_user)


@role_bp.get("")
@token_required
def list_roles():
    return role_controller.list_roles()


@role_bp.post("")
@token_required
@admin_required
def create_role():
    return role_controller.create_role(g.current_user)


@role_bp.put("/<role_id>")
@token_required
@admin_required
def update_role(role_id):
    return role_controller.update_role(role_id, g.current_user)


@role_bp.delete("/<role_id>")
@token_required
@admin_required
def delete_role(role_id):
    return role_controller.delete_role(role_id, g.current_user)
