"""Company routes: /api/companies."""
from flask import Blueprint, g

from ..controllers import lead_controller
from ..middleware.auth import token_required
from ..middleware.roles import admin_required, any_role_required

company_bp = Blueprint("companies", __name__, url_prefix="/api/companies")


@company_bp.get("")
@token_required
def list_companies():
    return lead_controller.list_companies()


@company_bp.post("")
@token_required
@any_role_required
def create_company():
    return lead_controller.create_company()


@company_bp.get("/<company_id>")
@token_required
def get_company(company_id):
    return lead_controller.get_company(company_id)


@company_bp.put("/<company_id>")
@token_required
@any_role_required
def update_company(company_id):
    return lead_controller.update_company(company_id)


@company_bp.delete("/<company_id>")
@token_required
@admin_required
def delete_company(company_id):
    return lead_controller.delete_company(company_id)
