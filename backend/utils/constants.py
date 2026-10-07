"""Global constants: roles, table schemas, statuses, messages."""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXCEL_DIR = "excel"
UPLOAD_DIR = "uploads"
REPORTS_DIR = "reports"

ROLE_ADMIN = "admin"
ROLE_EMPLOYEE = "employee"
ROLE_DEVELOPER = "developer"
ALL_ROLES = (ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_DEVELOPER)

TOKEN_HEADER = "Authorization"
TOKEN_PREFIX = "Bearer "

# Every workbook = one table. First row of the sheet holds these headers.
TABLE_SCHEMAS = {
    "roles": [
        "id", "name", "access", "description", "built_in",
        "created_at", "updated_at",
    ],
    "employees": [
        "id", "name", "email", "password", "phone", "role", "status",
        "department", "designation", "joined_date", "created_at", "updated_at",
    ],
    "developers": [
        "id", "name", "email", "phone", "skills", "experience",
        "availability", "status", "hourly_rate", "github", "notes",
        "created_at", "updated_at",
    ],
    "companies": [
        "id", "name", "industry", "website", "email", "phone", "address",
        "city", "country", "owner_id", "status", "notes", "created_at", "updated_at",
    ],
    "leads": [
        "id", "name", "email", "phone", "company_id", "source", "status",
        "priority", "assigned_to", "value", "service", "description",
        "last_contact", "next_followup", "created_at", "updated_at",
    ],
    "followups": [
        "id", "lead_id", "type", "notes", "status", "due_date",
        "created_by", "created_at",
    ],
    "call_logs": [
        "id", "lead_id", "employee_id", "direction", "duration",
        "summary", "outcome", "called_at",
    ],
    "projects": [
        "id", "name", "company_id", "lead_id", "manager_id", "status",
        "priority", "budget", "start_date", "end_date", "description",
        "progress", "created_at", "updated_at",
    ],
    "project_updates": [
        "id", "project_id", "author_id", "update_type", "message",
        "progress", "created_at",
    ],
    "project_tasks": [
        "id", "project_id", "title", "assigned_to", "status", "priority",
        "due_date", "description", "created_at", "updated_at",
    ],
    "project_assignments": [
        "id", "project_id", "developer_id", "role", "allocated_hours",
        "assigned_at", "released_at", "status",
    ],
    "project_members": [
        "id", "project_id", "employee_id", "assigned_at", "released_at",
        "status",
    ],
    "activity_logs": [
        "id", "user_id", "user_name", "action", "entity", "entity_id",
        "details", "created_at",
    ],
    "notifications": [
        "id", "user_id", "title", "message", "type", "is_read",
        "created_by", "created_at",
    ],
}

DEFAULT_PASSWORD = "admin@123"

LEAD_SOURCES = ("Website", "Referral", "Cold Call", "LinkedIn", "Email", "Walk-in", "Social Media", "Other")
LEAD_STATUS = ("New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost", "On Hold")
LEAD_PRIORITY = ("Low", "Medium", "High", "Urgent")
PROJECT_STATUS = ("Planning", "In Progress", "On Hold", "Testing", "Completed", "Cancelled")
PROJECT_PRIORITY = ("Low", "Medium", "High", "Critical")
TASK_STATUS = ("To Do", "In Progress", "Review", "Done", "Blocked")
FOLLOWUP_STATUS = ("Pending", "Done", "Skipped", "Rescheduled")
EMPLOYEE_STATUS = ("Active", "Inactive", "On Leave")
COMPANY_STATUS = ("Active", "Prospect", "Churned")

# Preset roles seeded on the first run. (name, base access, description)
ROLE_PRESETS = (
    ("Digital Marketing", ROLE_EMPLOYEE, "Campaigns, SEO, social and paid media"),
    ("Data Analyst", ROLE_EMPLOYEE, "Reporting, dashboards and business insights"),
    ("Data Scientist", ROLE_DEVELOPER, "Modelling, experiments and machine learning"),
    ("Frontend Developer", ROLE_DEVELOPER, "UI implementation in HTML, CSS and JavaScript"),
    ("Backend Developer", ROLE_DEVELOPER, "APIs, services and server side code"),
    ("Full-stack Developer", ROLE_DEVELOPER, "End to end feature delivery"),
    ("Python Developer", ROLE_DEVELOPER, "Python services, scripting and automation"),
    ("Java Developer", ROLE_DEVELOPER, "Java services and enterprise integrations"),
    ("Sales and Marketing", ROLE_EMPLOYEE, "Pipeline, outreach and revenue generation"),
    ("HR", ROLE_EMPLOYEE, "Hiring, onboarding and people operations"),
    ("AI/ML Engineering", ROLE_DEVELOPER, "Model training, MLOps and AI features"),
    ("UI & UX", ROLE_EMPLOYEE, "Design, user research and prototyping"),
)

MSG_UNAUTHORIZED = "Unauthorized: missing or invalid token"
MSG_FORBIDDEN = "Forbidden: you do not have permission for this action"
MSG_NOT_FOUND = "Resource not found"
MSG_INVALID = "Invalid request payload"
MSG_EMAIL_EXISTS = "Email already registered"
MSG_BAD_CREDENTIALS = "Invalid email or password"
MSG_INACTIVE = "Account is inactive"
