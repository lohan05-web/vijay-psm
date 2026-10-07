"""Role registry controller: list, create, rename and delete roles."""
from flask import g

from ..middleware.auth import log_activity
from ..services import role_service
from ..utils import constants as C
from ..utils.helpers import err, get_payload, ok
from ..utils.validators import validate_role


def list_roles():
    rows = sorted(role_service.all_roles(), key=lambda r: (
        0 if str(r.get("built_in")) == "Yes" else 1,
        str(r.get("name", "")).lower()))
    return ok([role_service.to_public(r) for r in rows])


def create_role(user=None):
    data = get_payload()
    errors = validate_role(data)
    name = str(data.get("name") or "").strip()
    if not errors and role_service.exists(name):
        errors.append("a role with this name already exists")
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    row = role_service.create(
        name=name,
        access=str(data.get("access")),
        description=str(data.get("description") or "").strip(),
    )
    log_activity(user or g.current_user, "create", entity="role",
                 entity_id=row["id"], details=f"{name} (access: {row['access']})")
    return ok(role_service.to_public(row), "Role created", 201)


def update_role(role_id, user=None):
    row = _find(role_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    data = get_payload()
    builtin = str(row.get("built_in")) == "Yes"
    payload = {k: v for k, v in data.items() if v is not None}
    if builtin:
        payload.pop("name", None)
        payload.pop("access", None)
    errors = validate_role(payload, partial=True)
    if not errors and payload.get("name"):
        existing = role_service.get_role(payload["name"])
        if existing and str(existing.get("id")) != str(role_id):
            errors.append("a role with this name already exists")
    if errors:
        return err(C.MSG_INVALID, 422, errors)

    changes = {}
    if payload.get("name"):
        new_name = str(payload["name"]).strip()
        changes["name"] = new_name
    if payload.get("access"):
        changes["access"] = str(payload["access"])
    if "description" in payload:
        changes["description"] = str(payload.get("description") or "").strip()
    if not changes:
        return err("Nothing to update", 400)

    updated = _update(role_id, changes)
    if changes.get("name"):
        role_service.rename_members(row.get("name"), changes["name"])
    log_activity(user or g.current_user, "update", entity="role",
                 entity_id=role_id, details=changes.get("name") or row.get("name"))
    return ok(role_service.to_public(updated), "Role updated")


def delete_role(role_id, user=None):
    row = _find(role_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    if str(row.get("built_in")) == "Yes":
        return err("Built-in roles cannot be deleted", 400)
    members = role_service.member_count(row.get("name"))
    if members:
        return err(f"'{row.get('name')}' is still used by {members} employee(s). "
                   "Reassign them first.", 409)
    _delete(role_id)
    log_activity(user or g.current_user, "delete", entity="role",
                 entity_id=role_id, details=row.get("name", ""))
    return ok(None, "Role deleted")


def _find(role_id):
    from ..services.excel_service import find_by_id
    return find_by_id(role_service.TABLE, role_id)


def _update(role_id, changes):
    from ..services.excel_service import update as db_update
    return db_update(role_service.TABLE, role_id, changes)


def _delete(role_id):
    from ..services.excel_service import delete as db_delete
    return db_delete(role_service.TABLE, role_id)
