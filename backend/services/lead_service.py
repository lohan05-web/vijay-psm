"""Lead domain logic: creation, assignment, follow-ups, call logs, stats."""
from ..utils import constants as C
from ..utils.helpers import make_id, now_str, today_str, within_period
from .excel_service import delete as db_delete, find_all, find_by_id, find_one, insert, update
from . import notification_service


def _employee_name(employee_id):
    if not employee_id:
        return ""
    emp = find_by_id("employees", employee_id)
    return emp.get("name", "") if emp else ""


def _company_name(company_id):
    if not company_id:
        return ""
    company = find_by_id("companies", company_id)
    return company.get("name", "") if company else ""


def enrich(lead):
    row = dict(lead)
    row["company_name"] = _company_name(lead.get("company_id"))
    row["assigned_to_name"] = _employee_name(lead.get("assigned_to"))
    return row


def list_leads():
    return [enrich(r) for r in find_all("leads")]


def get_lead(lead_id):
    lead = find_by_id("leads", lead_id)
    if not lead:
        return None
    row = enrich(lead)
    row["followups"] = sorted(
        find_all("followups", lead_id=str(lead_id)),
        key=lambda r: str(r.get("created_at", "")), reverse=True,
    )
    row["call_logs"] = sorted(
        find_all("call_logs", lead_id=str(lead_id)),
        key=lambda r: str(r.get("called_at", "")), reverse=True,
    )
    return row


def create_lead(data, user=None):
    lead_id = make_id("lead_")
    row = {
        "id": lead_id,
        "name": data.get("name", "").strip(),
        "email": (data.get("email") or "").strip(),
        "phone": (data.get("phone") or "").strip(),
        "company_id": data.get("company_id", ""),
        "source": data.get("source") or "Other",
        "status": data.get("status") or "New",
        "priority": data.get("priority") or "Medium",
        "assigned_to": data.get("assigned_to", ""),
        "value": data.get("value", ""),
        "service": data.get("service", ""),
        "description": data.get("description", ""),
        "last_contact": "",
        "next_followup": data.get("next_followup", ""),
        "created_at": now_str(),
        "updated_at": now_str(),
    }
    insert("leads", row)
    if row["assigned_to"]:
        notification_service.notify(
            row["assigned_to"], "New lead assigned",
            f'Lead "{row["name"]}" has been assigned to you.', "lead",
            created_by=(user or {}).get("id", ""),
        )
    if user:
        from ..middleware.auth import log_activity
        log_activity(user, "create", entity="lead", entity_id=lead_id, details=row["name"])
    return enrich(row)


def update_lead(lead_id, data):
    allowed = {k: v for k, v in data.items() if k in C.TABLE_SCHEMAS["leads"] and k != "id"}
    row = update("leads", lead_id, allowed)
    return enrich(row) if row else None


def delete_lead(lead_id):
    for table in ("followups", "call_logs"):
        for row in find_all(table, lead_id=str(lead_id)):
            db_delete(table, row["id"])
    return db_delete("leads", lead_id)


def assign_lead(lead_id, employee_id, user=None):
    lead = find_by_id("leads", lead_id)
    if not lead:
        return None
    row = update("leads", lead_id, {"assigned_to": employee_id})
    if employee_id:
        notification_service.notify(
            employee_id, "Lead assigned",
            f'Lead "{lead.get("name")}" is now assigned to you.', "lead",
            created_by=(user or {}).get("id", ""),
        )
    return enrich(row)


def add_followup(lead_id, data, user=None):
    if not find_by_id("leads", lead_id):
        return None
    row = {
        "id": make_id("fup_"),
        "lead_id": str(lead_id),
        "type": data.get("type") or "Call",
        "notes": data.get("notes", ""),
        "status": data.get("status") or "Pending",
        "due_date": data.get("due_date") or today_str(),
        "created_by": (user or {}).get("id", ""),
        "created_at": now_str(),
    }
    insert("followups", row)
    if row["due_date"]:
        update("leads", lead_id, {"next_followup": row["due_date"]})
    return row


def update_followup(followup_id, data):
    allowed = {k: v for k, v in data.items() if k in C.TABLE_SCHEMAS["followups"] and k != "id"}
    return update("followups", followup_id, allowed)


def delete_followup(followup_id):
    return db_delete("followups", followup_id)


def add_call_log(lead_id, data, user=None):
    if not find_by_id("leads", lead_id):
        return None
    row = {
        "id": make_id("call_"),
        "lead_id": str(lead_id),
        "employee_id": (user or {}).get("id", "") or data.get("employee_id", ""),
        "direction": data.get("direction") or "Outbound",
        "duration": data.get("duration", ""),
        "summary": data.get("summary", ""),
        "outcome": data.get("outcome") or "No Answer",
        "called_at": data.get("called_at") or now_str(),
    }
    insert("call_logs", row)
    update("leads", lead_id, {"last_contact": now_str()})
    return row


def due_followups(days=0):
    rows = find_all("followups", status="Pending")
    today = today_str()
    return [r for r in rows if str(r.get("due_date", "")) <= today]


def lead_stats():
    leads = find_all("leads")
    stats = {"total": len(leads), "by_status": {}, "by_source": {}, "by_priority": {},
             "pipeline_value": 0.0, "won_value": 0.0, "converted": 0}
    for lead in leads:
        status = lead.get("status") or "New"
        stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
        source = lead.get("source") or "Other"
        stats["by_source"][source] = stats["by_source"].get(source, 0) + 1
        priority = lead.get("priority") or "Medium"
        stats["by_priority"][priority] = stats["by_priority"].get(priority, 0) + 1
        try:
            value = float(lead.get("value") or 0)
        except (TypeError, ValueError):
            value = 0.0
        stats["pipeline_value"] += value
        if status == "Won":
            stats["won_value"] += value
            stats["converted"] += 1
    stats["conversion_rate"] = round(
        (stats["converted"] / stats["total"] * 100), 1
    ) if stats["total"] else 0.0
    return stats


def leads_created_in(period):
    return [r for r in find_all("leads") if within_period(r.get("created_at"), period)]
