"""Small shared helpers: responses, ids, dates, pagination, csv export."""
import csv
import io
import os
import re
import uuid
from datetime import datetime, timedelta

from flask import jsonify, request

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S")


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def today_str():
    return datetime.now().strftime("%Y-%m-%d")


def parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(str(value).strip(), fmt)
        except ValueError:
            continue
    return None


def make_id(prefix=""):
    return f"{prefix}{uuid.uuid4().hex[:12]}"


def ok(data=None, message="success", code=200):
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    resp = jsonify(body)
    resp.status_code = code
    return resp


def err(message="error", code=400, errors=None):
    body = {"success": False, "message": message}
    if errors:
        body["errors"] = errors
    resp = jsonify(body)
    resp.status_code = code
    return resp


def get_payload():
    return request.get_json(silent=True) or {}


def paginate(rows, default_size=20):
    """Return (page_items, meta) for the current request args."""
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        size = max(1, min(200, int(request.args.get("per_page", default_size))))
    except (TypeError, ValueError):
        size = default_size
    total = len(rows)
    start = (page - 1) * size
    return rows[start:start + size], {
        "page": page, "per_page": size, "total": total,
        "pages": max(1, (total + size - 1) // size),
    }


def apply_filters(rows, filters):
    """filters: dict of query-arg -> column. Empty query values are skipped."""
    for arg, column in filters.items():
        value = (request.args.get(arg) or "").strip()
        if not value:
            continue
        needle = value.lower()
        rows = [r for r in rows if needle in str(r.get(column, "")).lower()]
    return rows


def sort_rows(rows, allowed, default_col="created_at", default_dir="desc"):
    col = request.args.get("sort", default_col)
    direction = (request.args.get("dir", default_dir) or "desc").lower()
    if col not in allowed or not rows:
        return rows
    reverse = direction == "desc"

    def key(item):
        val = item.get(col)
        if isinstance(val, (int, float)):
            return (0, val if val is not None else 0)
        try:
            return (0, float(str(val).replace(",", "").replace("$", "")))
        except (TypeError, ValueError):
            return (1, str(val or "").lower())

    try:
        return sorted(rows, key=key, reverse=reverse)
    except TypeError:
        return rows


def rows_to_csv(rows, columns=None):
    if not rows and not columns:
        return ""
    columns = columns or list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({c: row.get(c, "") for c in columns})
    return buf.getvalue()


def save_csv(content, directory, filename):
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, filename)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        fh.write(content)
    return path


def slugify(text):
    text = re.sub(r"[^\w\s-]", "", str(text or "")).strip().lower()
    return re.sub(r"[\s_-]+", "-", text) or "file"


def range_bounds(period):
    """Return (start_date_str, end_date_str) for daily/weekly/monthly/yearly."""
    today = datetime.now()
    if period == "daily":
        start = today
    elif period == "weekly":
        start = today - timedelta(days=today.weekday())
    elif period == "monthly":
        start = today.replace(day=1)
    elif period == "yearly":
        start = today.replace(month=1, day=1)
    else:
        start = today - timedelta(days=30)
    return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def within_period(value, period):
    start, end = range_bounds(period)
    dt = parse_date(value)
    if not dt:
        return False
    return start <= dt.strftime("%Y-%m-%d") <= end
