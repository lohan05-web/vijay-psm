"""Report routes: /api/reports/* (dashboard metrics, period reports, CSV, Power BI)."""
import os

from flask import Blueprint, g, request, send_file

from ..middleware.auth import token_required
from ..middleware.roles import admin_required
from ..services import lead_service, powerbi_service, project_service, role_service
from ..services.excel_service import delete as db_delete, find_all, find_by_id, read_all
from ..utils import constants as C
from ..utils.config import PROJECT_ROOT, REPORTS_DIR
from ..utils.helpers import (err, ok, range_bounds, rows_to_csv, save_csv,
                             slugify, today_str, within_period)
import io

report_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _period_rows(table, period):
    return [r for r in read_all(table) if within_period(r.get("created_at"), period)]


def _summary_metrics():
    leads = find_all("leads")
    projects = find_all("projects")
    employees = [e for e in find_all("employees")]
    companies = find_all("companies")
    tasks = find_all("project_tasks")
    followups = find_all("followups")
    by_role = {name: 0 for name in role_service.names() or list(C.ALL_ROLES)}
    for employee in employees:
        role = str(employee.get("role") or "").strip()
        if role:
            by_role[role] = by_role.get(role, 0) + 1
    return {
        "leads": lead_service.lead_stats(),
        "projects": project_service.project_stats(),
        "employees": {
            "total": len(employees),
            "active": len([e for e in employees if e.get("status") == "Active"]),
            "by_role": by_role,
        },
        "companies": {
            "total": len(companies),
            "active": len([c for c in companies if c.get("status") == "Active"]),
        },
        "tasks": {
            "total": len(tasks),
            "done": len([t for t in tasks if t.get("status") == "Done"]),
            "in_progress": len([t for t in tasks if t.get("status") == "In Progress"]),
        },
        "followups": {
            "total": len(followups),
            "pending": len([f for f in followups if f.get("status") == "Pending"]),
            "due_today": len([f for f in followups
                              if f.get("status") == "Pending"
                              and str(f.get("due_date", "")) <= today_str()]),
        },
        "generated_at": today_str(),
    }


def _by_status(rows):
    counts = {}
    for row in rows:
        key = str(row.get("status") or "Unknown")
        counts[key] = counts.get(key, 0) + 1
    return counts


def _recent(rows, limit=5):
    return sorted(rows, key=lambda r: str(r.get("created_at", "")), reverse=True)[:limit]


def _user_dashboard():
    """Role aware dashboard payload for employee / developer accounts."""
    uid = str(g.current_user.get("id"))
    access = role_service.access_for(g.current_user.get("role"))
    data = {"role": g.current_user.get("role"), "access": access,
            "generated_at": today_str()}
    my_leads = [l for l in find_all("leads") if str(l.get("assigned_to")) == uid]
    if access == C.ROLE_DEVELOPER:
        tasks = [t for t in find_all("project_tasks") if str(t.get("assigned_to")) == uid]
        assignments = [a for a in find_all("project_assignments")
                       if str(a.get("developer_id")) == uid]
        assigned_ids = {str(a.get("project_id")) for a in assignments}
        my_projects = [p for p in find_all("projects")
                       if str(p.get("manager_id")) == uid or str(p.get("id")) in assigned_ids]
        data.update({
            "tasks": {"total": len(tasks),
                      "open": len([t for t in tasks if t.get("status") != "Done"]),
                      "done": len([t for t in tasks if t.get("status") == "Done"])},
            "upcoming": sorted([t for t in tasks if t.get("status") != "Done"],
                               key=lambda t: str(t.get("due_date") or "9999"))[:5],
            "projects": len([a for a in assignments if a.get("status") == "Active"]),
            "leads": {"total": len(my_leads),
                      "won": len([l for l in my_leads if l.get("status") == "Won"]),
                      "new": len([l for l in my_leads if l.get("status") == "New"]),
                      "by_status": _by_status(my_leads)},
            "trend": _trend(my_leads, my_projects),
            "recent_leads": _recent(my_leads),
            "recent_projects": _recent(my_projects),
        })
        return data
    my_projects = [p for p in find_all("projects") if str(p.get("manager_id")) == uid]
    my_followups = [f for f in find_all("followups")
                    if str(f.get("created_by")) == uid and f.get("status") == "Pending"]
    data.update({
        "leads": {"total": len(my_leads),
                  "won": len([l for l in my_leads if l.get("status") == "Won"]),
                  "new": len([l for l in my_leads if l.get("status") == "New"]),
                  "by_status": _by_status(my_leads)},
        "followups_due": len([f for f in my_followups
                              if str(f.get("due_date", "")) <= today_str()]),
        "calls": len([c for c in find_all("call_logs") if str(c.get("employee_id")) == uid]),
        "projects": len(my_projects),
        "trend": _trend(my_leads, my_projects),
        "recent_leads": _recent(my_leads),
        "recent_projects": _recent(my_projects),
    })
    return data


@report_bp.get("/summary")
@report_bp.get("/summaries")
@token_required
def summary():
    if role_service.access_for(g.current_user.get("role")) == C.ROLE_ADMIN:
        return ok(_summary_metrics())
    return ok(_user_dashboard())


@report_bp.get("/dashboard")
@token_required
def dashboard():
    if role_service.access_for(g.current_user.get("role")) == C.ROLE_ADMIN:
        metrics = _summary_metrics()
        metrics["recent_leads"] = sorted(
            find_all("leads"), key=lambda r: str(r.get("created_at", "")), reverse=True)[:5]
        metrics["recent_projects"] = sorted(
            find_all("projects"), key=lambda r: str(r.get("created_at", "")), reverse=True)[:5]
        metrics["trend"] = _trend()
        return ok(metrics)
    return ok(_user_dashboard())


def _trend(leads=None, projects=None):
    """Leads/projects created per month for the last 6 months."""
    from datetime import datetime
    months = []
    now = datetime.now()
    for offset in range(5, -1, -1):
        month = now.month - offset
        year = now.year
        while month <= 0:
            month += 12
            year -= 1
        months.append(f"{year}-{month:02d}")
    trend = {"months": months, "leads": [0] * 6, "projects": [0] * 6}
    for row in find_all("leads") if leads is None else leads:
        key = str(row.get("created_at", ""))[:7]
        if key in months:
            trend["leads"][months.index(key)] += 1
    for row in find_all("projects") if projects is None else projects:
        key = str(row.get("created_at", ""))[:7]
        if key in months:
            trend["projects"][months.index(key)] += 1
    return trend


@report_bp.get("/<period>")
@token_required
@admin_required
def period_report(period):
    if period not in ("daily", "weekly", "monthly", "yearly"):
        return err("Period must be daily, weekly, monthly or yearly", 422)
    start, end = range_bounds(period)
    leads = _period_rows("leads", period)
    projects = _period_rows("projects", period)
    followups = _period_rows("followups", period)
    calls = [c for c in find_all("call_logs")
             if within_period(c.get("called_at"), period)]
    won = [l for l in leads if l.get("status") == "Won"]
    return ok({
        "period": period,
        "range": {"start": start, "end": end},
        "leads": {"created": len(leads), "won": len(won)},
        "projects_created": len(projects),
        "followups": len(followups),
        "calls": len(calls),
        "pipeline_value": round(sum(_to_float(l.get("value")) for l in leads), 2),
        "revenue": round(sum(_to_float(l.get("value")) for l in won), 2),
        "new_companies": len(_period_rows("companies", period)),
        "tasks_done": len([t for t in find_all("project_tasks")
                           if t.get("status") == "Done"
                           and within_period(t.get("updated_at"), period)]),
        "generated_at": today_str(),
    })


def _to_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


@report_bp.get("/export/<table>")
@token_required
def export_table(table):
    if table not in C.TABLE_SCHEMAS:
        return err(f"Unknown table '{table}'", 404)
    rows = read_all(table)
    csv_content = rows_to_csv(rows)
    directory = os.path.join(REPORTS_DIR, today_str().replace("-", ""))
    path = save_csv(csv_content, directory, f"{slugify(table)}.csv")
    return send_file(path, as_attachment=True, download_name=f"{slugify(table)}.csv",
                     mimetype="text/csv")


@report_bp.get("/export")
@token_required
@admin_required
def export_menu():
    return ok([{"table": t, "columns": cols} for t, cols in C.TABLE_SCHEMAS.items()])


@report_bp.post("/powerbi/export")
@token_required
@admin_required
def powerbi_export():
    return ok(powerbi_service.export_all(), "Datasets exported")


@report_bp.get("/powerbi")
@token_required
@admin_required
def powerbi_info():
    return ok(powerbi_service.refresh_payload())


@report_bp.get("/activity")
@token_required
@admin_required
def activity():
    rows = sorted(find_all("activity_logs"), key=lambda r: str(r.get("created_at", "")),
                  reverse=True)
    page = request.args.get("page", 1)
    from ..utils.helpers import paginate
    try:
        page = int(page)
    except ValueError:
        page = 1
    request.args  # noqa
    start = (page - 1) * 20
    return ok({"items": rows[start:start + 20],
               "meta": {"page": page, "per_page": 20, "total": len(rows),
                        "pages": max(1, (len(rows) + 19) // 20)}})


@report_bp.delete("/activity")
@token_required
@admin_required
def clear_activity():
    rows = find_all("activity_logs")
    for row in rows:
        db_delete("activity_logs", row["id"])
    return ok({"deleted": len(rows)}, "Activity cleared")


@report_bp.delete("/activity/<log_id>")
@token_required
@admin_required
def delete_activity(log_id):
    if not find_by_id("activity_logs", log_id):
        return err(C.MSG_NOT_FOUND, 404)
    db_delete("activity_logs", log_id)
    return ok({"id": log_id}, "Activity deleted")
