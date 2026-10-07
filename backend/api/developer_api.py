"""Developer routes: /api/developers."""
from flask import Blueprint

from ..controllers import developer_controller
from ..middleware.auth import token_required
from ..middleware.roles import admin_required

developer_bp = Blueprint("developers", __name__, url_prefix="/api/developers")


@developer_bp.get("")
@token_required
def list_developers():
    return developer_controller.list_developers()


@developer_bp.post("")
@token_required
@admin_required
def create_developer():
    return developer_controller.create_developer()


@developer_bp.get("/<developer_id>")
@token_required
def get_developer(developer_id):
    return developer_controller.get_developer(developer_id)


@developer_bp.put("/<developer_id>")
@token_required
@admin_required
def update_developer(developer_id):
    return developer_controller.update_developer(developer_id)


@developer_bp.delete("/<developer_id>")
@token_required
@admin_required
def delete_developer(developer_id):
    return developer_controller.delete_developer(developer_id)
