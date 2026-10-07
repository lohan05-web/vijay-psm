"""Role registry: built-in and custom roles, access levels, membership."""
from ..utils import constants as C
from ..utils.helpers import make_id, now_str
from .excel_service import count, find_all, find_one, insert, update

TABLE = "roles"


def all_roles():
    return find_all(TABLE)


def names():
    return [str(r.get("name", "")) for r in all_roles() if r.get("name")]


def get_role(name):
    key = str(name or "").strip().lower()
    if not key:
        return None
    for row in all_roles():
        if str(row.get("name", "")).strip().lower() == key:
            return row
    return None


def exists(name):
    return get_role(name) is not None


def canonical(name):
    row = get_role(name)
    return str(row.get("name")) if row else None


def access_for(role_name):
    """Base access level for a role name (admin / employee / developer)."""
    row = get_role(role_name)
    if row:
        access = str(row.get("access") or "").strip()
        return access if access in C.ALL_ROLES else C.ROLE_EMPLOYEE
    return role_name if role_name in C.ALL_ROLES else C.ROLE_EMPLOYEE


def member_count(role_name):
    return count("employees", role=canonical(role_name) or role_name)


def members_of(role_name):
    return find_all("employees", role=canonical(role_name) or role_name)


def create(name, access, description="", built_in="No"):
    row = {
        "id": make_id("role_"),
        "name": name,
        "access": access,
        "description": description,
        "built_in": built_in,
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert(TABLE, row)
    return dict(row)


def rename_members(old_name, new_name):
    """Re-point every employee holding ``old_name`` after a role rename."""
    for member in members_of(old_name):
        update("employees", member.get("id"), {"role": new_name})


def to_public(row, members=None):
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "access": row.get("access") or C.ROLE_EMPLOYEE,
        "description": row.get("description", ""),
        "built_in": str(row.get("built_in", "No")) == "Yes",
        "member_count": member_count(row.get("name")) if members is None else members,
        "created_at": row.get("created_at", ""),
        "updated_at": row.get("updated_at", ""),
    }
