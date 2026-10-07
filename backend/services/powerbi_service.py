"""Power BI integration helpers.

Power BI .pbix files cannot be generated programmatically, so this service
prepares CSV datasets under reports/ that the reports in powerbi/ can consume
through a folder data source, and exposes metadata about them.
"""
import os

from ..utils import constants as C
from ..utils.config import PROJECT_ROOT, REPORTS_DIR
from ..utils.helpers import rows_to_csv, save_csv, slugify, today_str

DATASETS = {
    "leads": "Lead_Analytics",
    "employees": "Employee_Analytics",
    "projects": "Project_Analytics",
    "call_logs": "Call_Analytics",
    "project_tasks": "Task_Analytics",
    "followups": "Followup_Analytics",
}


def export_dataset(table):
    """Write <table>.csv for the given table into reports/powerbi/."""
    from .excel_service import read_all
    rows = read_all(table)
    directory = os.path.join(REPORTS_DIR, "powerbi")
    path = save_csv(rows_to_csv(rows), directory, f"{slugify(table)}.csv")
    return {"table": table, "path": os.path.relpath(path, PROJECT_ROOT), "rows": len(rows)}


def export_all():
    return [export_dataset(table) for table in DATASETS]


def available_reports():
    directory = os.path.join(PROJECT_ROOT, "powerbi")
    os.makedirs(directory, exist_ok=True)
    files = [f for f in os.listdir(directory) if f.lower().endswith(".pbix")]
    return [{"name": os.path.splitext(f)[0], "file": f} for f in sorted(files)]


def refresh_payload():
    """Summary payload a Power BI scheduled refresh could ingest."""
    from . import lead_service, project_service
    from .excel_service import read_all
    return {
        "generated_at": today_str(),
        "datasets": DATASETS,
        "lead_stats": lead_service.lead_stats(),
        "project_stats": project_service.project_stats(),
        "row_counts": {table: len(read_all(table)) for table in C.TABLE_SCHEMAS},
        "reports": available_reports(),
    }
