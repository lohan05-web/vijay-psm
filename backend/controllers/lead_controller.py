"""Lead, company, follow-up and call-log controller."""
import csv
import io
from datetime import date, datetime

from flask import g, request

from ..middleware.auth import log_activity
from ..services import lead_service, role_service
from ..services.excel_service import (delete as db_delete, find_all, find_by_id,
                                      find_one, insert, update)
from ..utils import constants as C
from ..utils.helpers import (apply_filters, err, get_payload, make_id, ok,
                             paginate, sort_rows, now_str)
from ..utils.validators import validate_company, validate_lead

COMPANY_FILTERS = {"q": "name", "status": "status", "industry": "industry", "country": "country"}
LEAD_FILTERS = {"status": "status", "source": "source", "priority": "priority",
                "assigned_to": "assigned_to", "company_id": "company_id"}
LEAD_SORTABLE = ("name", "status", "priority", "value", "created_at", "next_followup")


def _is_admin():
    return role_service.access_for(g.current_user.get("role")) == C.ROLE_ADMIN


def _uid():
    return str(g.current_user.get("id"))


def _owns_lead(lead):
    return lead and str(lead.get("assigned_to")) == _uid()


def ensure_lead_access(lead_id):
    """None when the caller may see this lead, otherwise an error response."""
    lead = find_by_id("leads", lead_id)
    if not lead:
        return err(C.MSG_NOT_FOUND, 404)
    if not _is_admin() and not _owns_lead(lead):
        return err(C.MSG_NOT_FOUND, 404)
    return None


def _my_lead_ids():
    return {str(l.get("id")) for l in find_all("leads")
            if str(l.get("assigned_to")) == _uid()}


# ---------------------------------------------------------------- leads
def list_leads():
    rows = lead_service.list_leads()
    if not _is_admin():
        # Scoped visibility: employees only see leads assigned to them.
        rows = [r for r in rows if str(r.get("assigned_to")) == _uid()]
    elif request.args.get("mine") == "1":
        rows = [r for r in rows if str(r.get("assigned_to")) == _uid()]
    rows = apply_filters(rows, LEAD_FILTERS)
    search = (request.args.get("q") or "").strip().lower()
    if search:
        rows = [r for r in rows if search in str(r.get("name", "")).lower()
                or search in str(r.get("email", "")).lower()
                or search in str(r.get("phone", "")).lower()
                or search in str(r.get("company_name", "")).lower()]
    rows = sort_rows(rows, LEAD_SORTABLE)
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def get_lead(lead_id):
    guard = ensure_lead_access(lead_id)
    if guard:
        return guard
    row = lead_service.get_lead(lead_id)
    return ok(row)


def create_lead():
    data = get_payload()
    errors = validate_lead(data)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    if not _is_admin():
        # Employees can only create leads for themselves.
        data["assigned_to"] = _uid()
    row = lead_service.create_lead(data, g.current_user)
    return ok(row, "Lead created", 201)


def update_lead(lead_id):
    guard = ensure_lead_access(lead_id)
    if guard:
        return guard
    data = get_payload()
    if not _is_admin():
        # Only admins decide who a lead belongs to.
        data.pop("assigned_to", None)
    errors = validate_lead(data, partial=True)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    row = lead_service.update_lead(lead_id, data)
    log_activity(g.current_user, "update", entity="lead", entity_id=lead_id)
    return ok(row, "Lead updated")


def delete_lead(lead_id):
    guard = ensure_lead_access(lead_id)
    if guard:
        return guard
    lead_service.delete_lead(lead_id)
    log_activity(g.current_user, "delete", entity="lead", entity_id=lead_id)
    return ok(None, "Lead deleted")


def assign_lead(lead_id):
    data = get_payload()
    if "assigned_to" not in data:
        return err("assigned_to is required", 422)
    # An empty value clears the assignment (unassign).
    assigned_to = str(data.get("assigned_to") or "").strip()
    row = lead_service.assign_lead(lead_id, assigned_to, g.current_user)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    log_activity(g.current_user, "assign", entity="lead", entity_id=lead_id,
                 details=assigned_to or "unassigned")
    return ok(row, "Lead assigned" if assigned_to else "Lead unassigned")


# ------------------------------------------------------- bulk import
LEAD_IMPORT_FIELDS = {
    "name": ("name", "contact", "contact_name", "lead_name", "full_name"),
    "email": ("email", "email_address", "e_mail"),
    "phone": ("phone", "phone_number", "mobile", "contact_number"),
    "company": ("company", "company_name", "organisation", "organization"),
    "source": ("source", "lead_source"),
    "status": ("status", "lead_status"),
    "priority": ("priority",),
    "value": ("value", "lead_value", "deal_value", "budget"),
    "service": ("service", "service_needed", "interest"),
    "description": ("description", "notes", "message"),
    "next_followup": ("next_followup", "next_follow_up", "followup_date",
                      "follow_up_date"),
}
IMPORT_MAX_ROWS = 2000


def import_leads():
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return err("Choose a file to upload", 422)
    filename = upload.filename.lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx")):
        return err("Only CSV and Excel (.xlsx) files are supported", 422)
    assigned_to = str(request.form.get("assigned_to") or "").strip()
    if assigned_to and not find_by_id("employees", assigned_to):
        return err("Selected employee not found", 404)
    try:
        rows = _read_import_rows(upload, filename)
    except Exception:
        return err("Could not read the file. Use a CSV with a header row "
                   "or an .xlsx sheet.", 422)
    if not rows:
        return err("The file has no data rows", 422)
    if len(rows) > IMPORT_MAX_ROWS:
        return err(f"Maximum {IMPORT_MAX_ROWS} rows per import", 422)

    imported = 0
    failures = []
    for offset, raw in enumerate(rows):
        data = _normalize_import_row(raw, g.current_user)
        if assigned_to:
            data["assigned_to"] = assigned_to
        errors = validate_lead(data)
        if errors:
            failures.append({"row": offset + 2, "name": data.get("name", ""),
                             "errors": errors})
            continue
        lead_service.create_lead(data, g.current_user)
        imported += 1
    message = "Import complete" if imported else "No leads imported"
    return ok({"imported": imported, "failed": len(failures),
               "failures": failures[:20], "total_rows": len(rows)},
              message, 201 if imported else 200)


def _read_import_rows(upload, filename):
    if filename.endswith(".csv"):
        stream = io.TextIOWrapper(io.BytesIO(upload.read()),
                                  encoding="utf-8-sig", newline="")
        reader = csv.DictReader(stream)
        if not reader.fieldnames:
            raise ValueError("no header row")
        return [dict(r) for r in reader]
    import openpyxl
    workbook = openpyxl.load_workbook(io.BytesIO(upload.read()),
                                      read_only=True, data_only=True)
    sheet = workbook.worksheets[0]
    values = sheet.iter_rows(values_only=True)
    try:
        headers = [str(h).strip() if h is not None else "" for h in next(values)]
    except StopIteration:
        workbook.close()
        raise ValueError("empty sheet")
    rows = []
    for row in values:
        record = {}
        for i, header in enumerate(headers):
            if header and i < len(row):
                record[header] = row[i]
        if any(v is not None and str(v).strip() for v in record.values()):
            rows.append(record)
    workbook.close()
    return rows


def _import_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _resolve_company(name, user):
    name = str(name).strip()
    if not name:
        return ""
    for company in find_all("companies"):
        if str(company.get("name", "")).strip().lower() == name.lower():
            return company["id"]
    now = now_str()
    row = {
        "id": make_id("cmp_"), "name": name, "industry": "", "website": "",
        "email": "", "phone": "", "address": "", "city": "", "country": "",
        "owner_id": (user or {}).get("id", ""), "status": "Prospect",
        "notes": "Created from lead import", "created_at": now, "updated_at": now,
    }
    insert("companies", row)
    return row["id"]


def _normalize_import_row(raw, user):
    lowered = {}
    for key, value in (raw or {}).items():
        if key is None:
            continue
        lowered[str(key).strip().lower().replace(" ", "_")] = _import_value(value)
    data = {}
    for field, aliases in LEAD_IMPORT_FIELDS.items():
        for alias in aliases:
            if lowered.get(alias):
                data[field] = lowered[alias]
                break
    company_name = data.pop("company", "")
    if company_name:
        data["company_id"] = _resolve_company(company_name, user)
    return data


# ----------------------------------------------------------- followups
def list_followups():
    rows = find_all("followups")
    lead_map = {r["id"]: r for r in find_all("leads")}
    for row in rows:
        lead = lead_map.get(str(row.get("lead_id")), {})
        row["lead_name"] = lead.get("name", "")
        row["lead_status"] = lead.get("status", "")
    if not _is_admin():
        # Only follow-ups on the employee's own leads.
        my_leads = _my_lead_ids()
        rows = [r for r in rows if str(r.get("lead_id")) in my_leads
                or str(r.get("created_by")) == _uid()]
    status = (request.args.get("status") or "").strip()
    if status:
        rows = [r for r in rows if str(r.get("status")) == status]
    if request.args.get("due") == "1":
        today = date.today().strftime("%Y-%m-%d")
        rows = [r for r in rows if str(r.get("due_date", "")) <= today and r.get("status") == "Pending"]
    rows = sorted(rows, key=lambda r: str(r.get("due_date", "")), reverse=False)
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def create_followup(lead_id):
    guard = ensure_lead_access(lead_id)
    if guard:
        return guard
    data = get_payload()
    if not data.get("notes") and not data.get("due_date"):
        return err("notes or due_date is required", 422)
    row = lead_service.add_followup(lead_id, data, g.current_user)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Follow-up added", 201)


def update_followup(followup_id):
    guard = _followup_access(followup_id)
    if guard:
        return guard
    data = get_payload()
    if not _is_admin():
        data.pop("created_by", None)
    row = update("followups", followup_id, data)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Follow-up updated")


def delete_followup(followup_id):
    guard = _followup_access(followup_id)
    if guard:
        return guard
    if not lead_service.delete_followup(followup_id):
        return err(C.MSG_NOT_FOUND, 404)
    return ok(None, "Follow-up deleted")


def _followup_access(followup_id):
    row = find_by_id("followups", followup_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    if _is_admin():
        return None
    if str(row.get("created_by")) == _uid():
        return None
    lead = find_by_id("leads", row.get("lead_id"))
    return None if _owns_lead(lead) else err(C.MSG_NOT_FOUND, 404)


# ------------------------------------------------------------ call logs
def list_call_logs():
    rows = find_all("call_logs")
    lead_map = {r["id"]: r for r in find_all("leads")}
    emp_map = {r["id"]: r for r in find_all("employees")}
    for row in rows:
        row["lead_name"] = lead_map.get(str(row.get("lead_id")), {}).get("name", "")
        row["employee_name"] = emp_map.get(str(row.get("employee_id")), {}).get("name", "")
    if not _is_admin():
        rows = [r for r in rows if str(r.get("employee_id")) == _uid()]
    rows = sorted(rows, key=lambda r: str(r.get("called_at", "")), reverse=True)
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def create_call_log(lead_id):
    guard = ensure_lead_access(lead_id)
    if guard:
        return guard
    row = lead_service.add_call_log(lead_id, get_payload(), g.current_user)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    return ok(row, "Call logged", 201)


# ------------------------------------------------------------ companies
def list_companies():
    rows = find_all("companies")
    rows = apply_filters(rows, COMPANY_FILTERS)
    search = (request.args.get("q") or "").strip().lower()
    if search:
        rows = [r for r in rows if search in str(r.get("name", "")).lower()
                or search in str(r.get("email", "")).lower()
                or search in str(r.get("industry", "")).lower()]
    rows = sort_rows(rows, ("name", "industry", "status", "created_at"))
    for row in rows:
        row["lead_count"] = len([l for l in find_all("leads") if l.get("company_id") == row.get("id")])
    page_rows, meta = paginate(rows)
    return ok({"items": page_rows, "meta": meta})


def get_company(company_id):
    row = find_by_id("companies", company_id)
    if not row:
        return err(C.MSG_NOT_FOUND, 404)
    data = dict(row)
    data["leads"] = find_all("leads", company_id=company_id)
    data["projects"] = find_all("projects", company_id=company_id)
    return ok(data)


def create_company():
    data = get_payload()
    errors = validate_company(data)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    row = {
        "id": make_id("cmp_"),
        "name": data["name"].strip(),
        "industry": data.get("industry", ""),
        "website": data.get("website", ""),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "address": data.get("address", ""),
        "city": data.get("city", ""),
        "country": data.get("country", ""),
        "owner_id": data.get("owner_id") or g.current_user.get("id", ""),
        "status": data.get("status") or "Prospect",
        "notes": data.get("notes", ""),
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert("companies", row)
    log_activity(g.current_user, "create", entity="company", entity_id=row["id"], details=row["name"])
    return ok(row, "Company created", 201)


def update_company(company_id):
    if not find_by_id("companies", company_id):
        return err(C.MSG_NOT_FOUND, 404)
    data = get_payload()
    errors = validate_company(data, partial=True)
    if errors:
        return err(C.MSG_INVALID, 422, errors)
    changes = {k: v for k, v in data.items() if k in C.TABLE_SCHEMAS["companies"] and k != "id"}
    row = update("companies", company_id, changes)
    log_activity(g.current_user, "update", entity="company", entity_id=company_id)
    return ok(row, "Company updated")


def delete_company(company_id):
    if not find_by_id("companies", company_id):
        return err(C.MSG_NOT_FOUND, 404)
    db_delete("companies", company_id)
    log_activity(g.current_user, "delete", entity="company", entity_id=company_id)
    return ok(None, "Company deleted")
