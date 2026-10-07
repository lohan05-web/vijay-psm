# CRM Project

A full-stack Customer Relationship Management system built with **Flask** (backend) and **Vanilla HTML/CSS/JS** (frontend), storing all data in **Excel workbooks** (no database required).

## Features

- JWT authentication with role based access control (`admin`, `employee`, `developer`)
- Lead management, follow-ups and call logs
- Company (client) directory
- Project management with tasks, updates and assignments
- Developer directory and allocation
- Daily / weekly / monthly / yearly reports with CSV export
- Activity logging and notification service
- Excel import/export service
- Responsive dashboards for Admin, Employee and Developer roles

## Project Structure

```
CRM-PROJECT/
├── frontend/          # HTML pages, CSS, JS, components, assets
├── backend/
│   ├── app.py         # Flask application factory + entry point
│   ├── api/           # Flask Blueprints (routes)
│   ├── controllers/   # Business logic handlers
│   ├── services/      # Excel, leads, projects, notifications, powerbi
│   ├── middleware/    # auth, roles, logger
│   ├── utils/         # helpers, validators, constants
│   └── excel/         # .xlsx data store (auto-created)
├── powerbi/           # Power BI report files (.pbix)
├── reports/           # Generated reports (daily/weekly/monthly/yearly)
├── uploads/           # Document uploads
├── docs/              # Documentation PDFs
├── requirements.txt
└── .env
```

## Setup

```bash
pip install -r requirements.txt
copy .env .env.local   # (optional) adjust secrets
python backend/app.py
```

Then open **http://localhost:5000**

## Default Login

| Role     | Email            | Password   |
|----------|------------------|------------|
| Admin    | admin@crm.com    | admin@123  |

On first run the backend seeds `employees.xlsx` with the admin account and empty workbooks for every other table.

## API Overview

Base URL: `/api`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | - | Login, returns JWT |
| POST | `/auth/register` | admin | Create employee |
| GET  | `/auth/me` | any | Current user profile |
| GET/POST | `/employees` | admin | List / create employees |
| GET/PUT/DELETE | `/employees/<id>` | admin | Employee CRUD |
| GET/POST | `/companies` | any | Companies |
| GET/PUT/DELETE | `/companies/<id>` | admin | Company CRUD |
| GET/POST | `/leads` | any | Leads |
| GET/PUT/DELETE | `/leads/<id>` | any | Lead CRUD |
| GET/POST | `/leads/<id>/followups` | any | Follow-ups |
| GET/POST | `/leads/<id>/calls` | any | Call logs |
| GET/POST | `/projects` | any | Projects |
| GET/PUT/DELETE | `/projects/<id>` | any | Project CRUD |
| GET/POST | `/projects/<id>/tasks` | any | Project tasks |
| GET/POST | `/projects/<id>/updates` | any | Project updates |
| GET/POST | `/developers` | any | Developers |
| GET/PUT/DELETE | `/developers/<id>` | admin | Developer CRUD |
| GET | `/reports/summary` | admin | Dashboard metrics |
| GET | `/reports/<type>` | admin | daily/weekly/monthly/yearly |
| GET | `/reports/export/<table>` | any | CSV export |
| GET | `/notifications` | any | User notifications |

All endpoints except `/api/auth/login` require `Authorization: Bearer <token>`.

## Testing

```bash
python -m backend.tests.test_api
```

## Notes

- Data lives in `backend/excel/*.xlsx`. Delete a file to reset that table.
- Uploads are stored under `uploads/` by category.
- Power BI files in `powerbi/` can be refreshed against the CSV exports produced by `/api/reports/export/<table>`.
