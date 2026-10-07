"""Request payload validators. Each returns a list of error strings."""
import re

from .constants import (
    ALL_ROLES, COMPANY_STATUS, EMPLOYEE_STATUS, LEAD_PRIORITY,
    LEAD_SOURCES as LEAD_SOURCE, LEAD_STATUS, PROJECT_PRIORITY,
    PROJECT_STATUS, TASK_STATUS,
)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[\d\s\-()]{6,20}$")


def is_email(value):
    return bool(EMAIL_RE.match(str(value or "").strip()))


def is_phone(value):
    return not value or bool(PHONE_RE.match(str(value).strip()))


def required(payload, fields):
    errors = []
    for field in fields:
        value = payload.get(field)
        if value is None or str(value).strip() == "":
            errors.append(f"{field} is required")
    return errors


def check_email(payload, field="email", required_field=True):
    value = payload.get(field)
    if not value:
        return [f"{field} is required"] if required_field else []
    return [] if is_email(value) else [f"{field} must be a valid email address"]


def check_phone(payload, field="phone"):
    return [] if is_phone(payload.get(field)) else [f"{field} must be a valid phone number"]


def check_choice(payload, field, choices, required_field=False):
    value = payload.get(field)
    if value in (None, ""):
        return [f"{field} is required"] if required_field else []
    return [] if value in choices else [f"{field} must be one of: {', '.join(choices)}"]


def validate_employee(payload, partial=False, allowed_roles=None):
    errors = []
    if not partial:
        errors += required(payload, ["name", "email", "password", "role"])
    errors += check_email(payload) if payload.get("email") or not partial else []
    errors += check_phone(payload)
    choices = tuple(allowed_roles) if allowed_roles else ALL_ROLES
    errors += check_choice(payload, "role", choices, required_field=not partial)
    errors += check_choice(payload, "status", EMPLOYEE_STATUS)
    if payload.get("password") and len(str(payload["password"])) < 6:
        errors.append("password must be at least 6 characters")
    return errors


ROLE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 &.'\-_/]{1,39}$")


def validate_role(payload, partial=False):
    errors = []
    name = str(payload.get("name") or "").strip()
    if not partial or payload.get("name") not in (None, ""):
        if not name:
            errors.append("name is required")
        elif not ROLE_NAME_RE.match(name):
            errors.append("name must be 2-40 characters using only letters, digits, spaces, & . ' - _ /")
    access = payload.get("access")
    if not partial or access not in (None, ""):
        if access not in ALL_ROLES:
            errors.append("access must be one of: " + ", ".join(ALL_ROLES))
    if payload.get("description") and len(str(payload["description"])) > 200:
        errors.append("description must be 200 characters or fewer")
    return errors


def validate_developer(payload, partial=False):
    errors = []
    if not partial:
        errors += required(payload, ["name", "email"])
    if payload.get("email") or not partial:
        errors += check_email(payload)
    errors += check_phone(payload)
    return errors


def validate_company(payload, partial=False):
    errors = []
    if not partial:
        errors += required(payload, ["name"])
    errors += check_email(payload, required_field=False)
    errors += check_phone(payload)
    errors += check_choice(payload, "status", COMPANY_STATUS)
    return errors


def validate_lead(payload, partial=False):
    errors = []
    if not partial:
        errors += required(payload, ["name"])
    if payload.get("email"):
        errors += check_email(payload, required_field=False)
    errors += check_phone(payload)
    errors += check_choice(payload, "source", LEAD_SOURCE)
    errors += check_choice(payload, "status", LEAD_STATUS)
    errors += check_choice(payload, "priority", LEAD_PRIORITY)
    if payload.get("value") not in (None, ""):
        try:
            float(payload["value"])
        except (TypeError, ValueError):
            errors.append("value must be a number")
    return errors


def validate_project(payload, partial=False):
    errors = []
    if not partial:
        errors += required(payload, ["name"])
    errors += check_choice(payload, "status", PROJECT_STATUS)
    errors += check_choice(payload, "priority", PROJECT_PRIORITY)
    for field in ("budget", "progress"):
        if payload.get(field) not in (None, ""):
            try:
                float(payload[field])
            except (TypeError, ValueError):
                errors.append(f"{field} must be a number")
    return errors


def validate_task(payload, partial=False):
    errors = []
    if not partial:
        errors += required(payload, ["title", "project_id"])
    errors += check_choice(payload, "status", TASK_STATUS)
    return errors
