"""Role based access control middleware."""
from functools import wraps

from .auth import current_user
from ..services.role_service import access_for
from ..utils import constants as C
from ..utils.helpers import err


def roles_required(*allowed_roles):
    """Restrict a view to the given roles. Must be stacked under token_required.

    Custom roles are resolved to their base access level first, so a
    "Data Scientist" (access: developer) is treated like a developer.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return err(C.MSG_UNAUTHORIZED, 401)
            if access_for(user.get("role")) not in allowed_roles:
                return err(C.MSG_FORBIDDEN, 403)
            return fn(*args, **kwargs)

        return wrapper

    return decorator


admin_required = roles_required(C.ROLE_ADMIN)
staff_required = roles_required(C.ROLE_ADMIN, C.ROLE_EMPLOYEE)
any_role_required = roles_required(C.ROLE_ADMIN, C.ROLE_EMPLOYEE, C.ROLE_DEVELOPER)


def can_edit(user, owner_id=None):
    """Admins can edit anything; others only their own records."""
    if not user:
        return False
    if access_for(user.get("role")) == C.ROLE_ADMIN:
        return True
    return owner_id is not None and str(owner_id) == str(user.get("id"))
