"""Lead, follow-up and call-log routes: /api/leads, /api/followups, /api/calls."""
from flask import Blueprint, g

from ..controllers import lead_controller
from ..middleware.auth import token_required
from ..middleware.roles import admin_required, any_role_required

lead_bp = Blueprint("leads", __name__, url_prefix="/api/leads")
followup_bp = Blueprint("followups", __name__, url_prefix="/api/followups")
call_bp = Blueprint("calls", __name__, url_prefix="/api/calls")


# ------------------------------------------------------------------ leads
@lead_bp.get("")
@token_required
def list_leads():
    return lead_controller.list_leads()


@lead_bp.post("")
@token_required
@any_role_required
def create_lead():
    return lead_controller.create_lead()


# Bulk upload of leads from a CSV/Excel file (admin only).
@lead_bp.post("/import")
@token_required
@admin_required
def import_leads():
    return lead_controller.import_leads()


@lead_bp.get("/<lead_id>")
@token_required
def get_lead(lead_id):
    return lead_controller.get_lead(lead_id)


@lead_bp.put("/<lead_id>")
@token_required
@any_role_required
def update_lead(lead_id):
    return lead_controller.update_lead(lead_id)


@lead_bp.delete("/<lead_id>")
@token_required
@any_role_required
def delete_lead(lead_id):
    return lead_controller.delete_lead(lead_id)


# Only the admin decides which employee owns a lead.
@lead_bp.post("/<lead_id>/assign")
@token_required
@admin_required
def assign_lead(lead_id):
    return lead_controller.assign_lead(lead_id)


@lead_bp.post("/<lead_id>/followups")
@token_required
@any_role_required
def create_followup(lead_id):
    return lead_controller.create_followup(lead_id)


@lead_bp.get("/<lead_id>/followups")
@token_required
def lead_followups(lead_id):
    from ..services.excel_service import find_all
    from ..utils.helpers import ok
    guard = lead_controller.ensure_lead_access(lead_id)
    if guard:
        return guard
    return ok(find_all("followups", lead_id=str(lead_id)))


@lead_bp.post("/<lead_id>/calls")
@token_required
@any_role_required
def create_call_log(lead_id):
    return lead_controller.create_call_log(lead_id)


@lead_bp.get("/<lead_id>/calls")
@token_required
def lead_calls(lead_id):
    from ..services.excel_service import find_all
    from ..utils.helpers import ok
    guard = lead_controller.ensure_lead_access(lead_id)
    if guard:
        return guard
    return ok(find_all("call_logs", lead_id=str(lead_id)))


# -------------------------------------------------------------- followups
@followup_bp.get("")
@token_required
def list_followups():
    return lead_controller.list_followups()


@followup_bp.put("/<followup_id>")
@token_required
@any_role_required
def update_followup(followup_id):
    return lead_controller.update_followup(followup_id)


@followup_bp.delete("/<followup_id>")
@token_required
@any_role_required
def delete_followup(followup_id):
    return lead_controller.delete_followup(followup_id)


# ------------------------------------------------------------------ calls
@call_bp.get("")
@token_required
def list_call_logs():
    return lead_controller.list_call_logs()
