"""API smoke tests. Run from the project root: python -m backend.tests.test_api"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.app import create_app  # noqa: E402

import uuid  # noqa: E402
import io  # noqa: E402
import openpyxl  # noqa: E402

SUFFIX = uuid.uuid4().hex[:6]


def qs(key, value):
    return "?" + key + "=" + str(value)

PASS = 0
FAIL = 0


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name} {detail}")


def main():
    app = create_app()
    client = app.test_client()

    print("== auth ==")
    res = client.get("/health")
    check("health", res.status_code == 200 and res.get_json()["status"] == "ok")

    res = client.post("/api/auth/login", json={"email": "wrong@x.com", "password": "nope"})
    check("bad login rejected", res.status_code == 401)

    res = client.post("/api/auth/login", json={"email": "admin@crm.com", "password": "admin@123"})
    body = res.get_json()
    check("admin login", res.status_code == 200 and body.get("success"), str(body))
    token = body["data"]["token"]
    H = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/auth/me", headers=H)
    check("me", res.status_code == 200 and res.get_json()["data"]["role"] == "admin")
    res = client.get("/api/leads")
    check("unauthorized blocked", res.status_code == 401)

    print("== employees ==")
    res = client.post("/api/employees", headers=H, json={
        "name": "Jane Employee", "email": f"jane{SUFFIX}@crm.com", "password": "secret1",
        "role": "employee", "department": "Sales"})
    check("create employee", res.status_code == 201, res.get_data(as_text=True))
    jane_id = res.get_json()["data"]["id"]
    res = client.post("/api/employees", headers=H, json={
        "name": "John Dev", "email": f"john{SUFFIX}@crm.com", "password": "secret1",
        "role": "developer"})
    check("create developer user", res.status_code == 201, res.get_data(as_text=True))
    john_id = res.get_json()["data"]["id"]
    res = client.get("/api/employees", headers=H)
    check("list employees", res.status_code == 200 and res.get_json()["data"]["meta"]["total"] >= 3)

    print("== companies & leads ==")
    res = client.post("/api/companies", headers=H, json={
        "name": "Acme Corp", "industry": "Manufacturing", "email": "hi@acme.com",
        "phone": "+1 555 123 4567", "status": "Active"})
    check("create company", res.status_code == 201, res.get_data(as_text=True))
    company_id = res.get_json()["data"]["id"]

    res = client.post("/api/leads", headers=H, json={
        "name": "Bob Buyer", "email": "bob@acme.com", "phone": "555-999-0000",
        "company_id": company_id, "source": "Website", "priority": "High",
        "value": "25000", "service": "CRM Development"})
    check("create lead", res.status_code == 201, res.get_data(as_text=True))
    lead_id = res.get_json()["data"]["id"]

    res = client.get(f"/api/leads/{lead_id}", headers=H)
    check("get lead detail", res.status_code == 200
          and res.get_json()["data"]["company_name"] == "Acme Corp")

    res = client.post(f"/api/leads/{lead_id}/followups", headers=H, json={
        "type": "Call", "notes": "Intro call", "due_date": "2026-10-10"})
    check("add followup", res.status_code == 201, res.get_data(as_text=True))

    res = client.post(f"/api/leads/{lead_id}/calls", headers=H, json={
        "direction": "Outbound", "duration": "5m", "summary": "Spoke to Bob",
        "outcome": "Interested"})
    check("add call log", res.status_code == 201, res.get_data(as_text=True))

    res = client.get("/api/followups", headers=H)
    check("list followups", res.status_code == 200 and res.get_json()["data"]["meta"]["total"] >= 1)
    res = client.get("/api/calls", headers=H)
    check("list call logs", res.status_code == 200 and res.get_json()["data"]["meta"]["total"] >= 1)

    print("== developers & projects ==")
    res = client.post("/api/developers", headers=H, json={
        "name": "Dev One", "email": f"dev1{SUFFIX}@crm.com", "skills": "Python, Flask, React",
        "experience": "4", "hourly_rate": "45"})
    check("create developer", res.status_code == 201, res.get_data(as_text=True))
    dev_id = res.get_json()["data"]["id"]

    res = client.post("/api/projects", headers=H, json={
        "name": "Acme CRM Build", "company_id": company_id, "budget": "120000",
        "status": "In Progress", "priority": "High", "start_date": "2026-10-01"})
    check("create project", res.status_code == 201, res.get_data(as_text=True))
    project_id = res.get_json()["data"]["id"]

    res = client.post(f"/api/projects/{project_id}/tasks", headers=H, json={
        "title": "Design schema", "priority": "High", "due_date": "2026-10-15"})
    check("create task", res.status_code == 201, res.get_data(as_text=True))
    task_id = res.get_json()["data"]["id"]

    res = client.put(f"/api/projects/tasks/{task_id}", headers=H, json={"status": "Done"})
    check("complete task", res.status_code == 200, res.get_data(as_text=True))

    res = client.post(f"/api/projects/{project_id}/updates", headers=H, json={
        "message": "Kicked off", "progress": "20"})
    check("project update", res.status_code == 201, res.get_data(as_text=True))

    res = client.post(f"/api/projects/{project_id}/assignments", headers=H, json={
        "developer_id": dev_id, "role": "Backend", "allocated_hours": "120"})
    check("assign developer", res.status_code == 201, res.get_data(as_text=True))

    res = client.get(f"/api/developers/{dev_id}", headers=H)
    check("developer detail", res.status_code == 200
          and res.get_json()["data"]["active_projects"] == 1)

    print("== project members ==")
    res = client.post(f"/api/projects/{project_id}/members", headers=H,
                      json={"employee_id": jane_id})
    check("admin adds employee to team", res.status_code == 201, res.get_data(as_text=True))
    mem_id = res.get_json()["data"]["id"]
    res = client.post(f"/api/projects/{project_id}/members", headers=H,
                      json={"employee_id": jane_id})
    check("duplicate team member rejected", res.status_code == 422, res.get_data(as_text=True))
    res = client.post(f"/api/projects/{project_id}/members", headers=H,
                      json={"employee_id": "emp_does_not_exist"})
    check("unknown employee rejected", res.status_code == 404, res.get_data(as_text=True))
    jane_tok = client.post("/api/auth/login",
                           json={"email": f"jane{SUFFIX}@crm.com", "password": "secret1"}
                           ).get_json()["data"]["token"]
    john_tok = client.post("/api/auth/login",
                           json={"email": f"john{SUFFIX}@crm.com", "password": "secret1"}
                           ).get_json()["data"]["token"]
    HJ2 = {"Authorization": f"Bearer {jane_tok}"}
    HN2 = {"Authorization": f"Bearer {john_tok}"}
    res = client.post(f"/api/projects/{project_id}/members", headers=HJ2,
                      json={"employee_id": john_id})
    check("employee adds team member", res.status_code == 201, res.get_data(as_text=True))
    mem2_id = res.get_json()["data"]["id"]
    res = client.post(f"/api/projects/{project_id}/members", headers=HN2,
                      json={"employee_id": jane_id})
    check("developer cannot add team member", res.status_code == 403, res.get_data(as_text=True))
    res = client.get(f"/api/projects/{project_id}/members", headers=HN2)
    members = res.get_json()["data"]
    check("members list enriched with names", res.status_code == 200
          and any(m.get("employee_id") == jane_id and m.get("employee_name")
                  for m in members), str(members)[:300])
    res = client.get(f"/api/projects/{project_id}", headers=H)
    detail_members = res.get_json()["data"].get("members") or []
    check("project detail includes members", res.status_code == 200
          and any(m.get("employee_id") == jane_id for m in detail_members),
          str(detail_members)[:300])
    res = client.put(f"/api/projects/members/{mem_id}/release", headers=H)
    check("release team member", res.status_code == 200
          and res.get_json()["data"]["status"] == "Released", res.get_data(as_text=True))
    res = client.post(f"/api/projects/{project_id}/members", headers=H,
                      json={"employee_id": jane_id})
    check("re-add after release allowed", res.status_code == 201, res.get_data(as_text=True))
    mem3_id = res.get_json()["data"]["id"]
    res = client.delete(f"/api/projects/members/{mem2_id}", headers=H)
    check("delete team member", res.status_code == 200, res.get_data(as_text=True))
    res = client.delete(f"/api/projects/members/{mem3_id}", headers=H)
    check("delete re-added member", res.status_code == 200, res.get_data(as_text=True))

    print("== reports ==")
    res = client.get("/api/reports/summary", headers=H)
    data = res.get_json()["data"]
    check("admin summary", res.status_code == 200 and data["leads"]["total"] >= 1)
    res = client.get("/api/reports/dashboard", headers=H)
    check("dashboard with trend", res.status_code == 200 and "trend" in res.get_json()["data"])
    for period in ("daily", "weekly", "monthly", "yearly"):
        res = client.get(f"/api/reports/{period}", headers=H)
        check(f"{period} report", res.status_code == 200 and res.get_json()["data"]["period"] == period)
    res = client.get("/api/reports/export/leads", headers=H)
    check("csv export", res.status_code == 200 and b"name" in res.data[:100])
    res = client.post("/api/reports/powerbi/export", headers=H)
    check("powerbi datasets", res.status_code == 200 and len(res.get_json()["data"]) >= 4)
    res = client.get("/api/reports/activity", headers=H)
    check("activity log", res.status_code == 200 and res.get_json()["data"]["meta"]["total"] >= 1)
    act = res.get_json()["data"]["items"]
    res = client.delete(f"/api/reports/activity/{act[0]['id']}", headers=H)
    check("activity delete one", res.status_code == 200)
    res = client.get("/api/reports/activity", headers=H)
    remaining = [i for i in res.get_json()["data"]["items"] if i["id"] == act[0]["id"]]
    check("activity row removed", len(remaining) == 0, str(remaining))
    res = client.delete("/api/reports/activity/nonexistent_log_x", headers=H)
    check("activity delete 404", res.status_code == 404)
    res = client.get("/api/reports/activity", headers=H)
    before_total = res.get_json()["data"]["meta"]["total"]
    res = client.delete("/api/reports/activity", headers=H)
    check("activity clear all", res.status_code == 200 and res.get_json()["data"]["deleted"] == before_total)
    res = client.get("/api/reports/activity", headers=H)
    check("activity empty after clear", res.get_json()["data"]["meta"]["total"] == 0)

    print("== role checks ==")
    res = client.post("/api/auth/login", json={"email": f"jane{SUFFIX}@crm.com", "password": "secret1"})
    jane = res.get_json()["data"]["token"]
    HJ = {"Authorization": f"Bearer {jane}"}
    res = client.get("/api/employees", headers=HJ)
    check("employee can list employees", res.status_code == 200)
    res = client.post("/api/employees", headers=HJ, json={
        "name": "X", "email": "x@x.com", "password": "pass123", "role": "employee"})
    check("employee cannot create employee", res.status_code == 403)
    res = client.get("/api/reports/summary", headers=HJ)
    check("employee dashboard payload", res.status_code == 200
          and "leads" in res.get_json()["data"])

    res = client.post("/api/auth/login", json={"email": f"john{SUFFIX}@crm.com", "password": "secret1"})
    john = res.get_json()["data"]["token"]
    HN = {"Authorization": f"Bearer {john}"}
    res = client.get("/api/reports/summary", headers=HN)
    check("developer dashboard payload", res.status_code == 200
          and "tasks" in res.get_json()["data"])
    res = client.delete(f"/api/leads/{lead_id}", headers=HN)
    check("developer cannot delete lead", res.status_code == 404, res.get_data(as_text=True))

    print("== roles ==")
    res = client.get("/api/roles", headers=H)
    roles_data = res.get_json()["data"]
    role_names = [r["name"] for r in roles_data]
    check("list roles", res.status_code == 200 and len(role_names) >= 15, str(role_names))
    check("preset roles seeded",
          all(n in role_names for n in ("Digital Marketing", "Data Scientist",
                                        "Frontend Developer", "Sales and Marketing",
                                        "HR", "AI/ML Engineering", "UI & UX")),
          str(role_names))
    preset = [r for r in roles_data if r["name"] == "Data Scientist"][0]
    check("preset access level", preset["access"] == "developer", str(preset))

    res = client.post("/api/roles", headers=H, json={
        "name": "Growth Hacker", "access": "employee", "description": "Experiments"})
    check("create custom role", res.status_code == 201, res.get_data(as_text=True))
    role_id = res.get_json()["data"]["id"]

    res = client.post("/api/roles", headers=H, json={"name": "Growth Hacker", "access": "employee"})
    check("duplicate role rejected", res.status_code == 422, res.get_data(as_text=True))

    res = client.post("/api/employees", headers=H, json={
        "name": "Rita Role", "email": f"rita{SUFFIX}@crm.com", "password": "secret1",
        "role": "Growth Hacker"})
    check("employee with custom role created", res.status_code == 201, res.get_data(as_text=True))
    rita_id = res.get_json()["data"]["id"]

    res = client.post("/api/employees", headers=H, json={
        "name": "Bad Role", "email": f"bad{SUFFIX}@crm.com", "password": "secret1",
        "role": "Not A Role"})
    check("unknown role rejected", res.status_code == 422, res.get_data(as_text=True))

    res = client.post("/api/auth/login", json={"email": f"rita{SUFFIX}@crm.com", "password": "secret1"})
    rita_body = res.get_json()["data"]
    HR = {"Authorization": f"Bearer {rita_body['token']}"}
    check("custom role login access", rita_body["user"].get("access") == "employee", str(rita_body))
    res = client.get("/api/leads", headers=HR)
    check("custom role reaches employee APIs", res.status_code == 200)
    res = client.get("/api/reports/summary", headers=HR)
    check("custom role dashboard payload", res.status_code == 200
          and "leads" in res.get_json()["data"])
    res = client.post("/api/roles", headers=HR, json={"name": "Nope", "access": "admin"})
    check("non-admin cannot create role", res.status_code == 403)

    res = client.delete(f"/api/roles/{role_id}", headers=H)
    check("role in use cannot be deleted", res.status_code == 409, res.get_data(as_text=True))
    res = client.delete(f"/api/employees/{rita_id}", headers=H)
    check("delete employee with custom role", res.status_code == 200)
    res = client.delete(f"/api/roles/{role_id}", headers=H)
    check("unused role deleted", res.status_code == 200)
    built_in = [r for r in roles_data if r["built_in"]][0]
    res = client.delete(f"/api/roles/{built_in['id']}", headers=H)
    check("built-in role protected", res.status_code == 400)

    print("== assign work ==")
    res = client.post(f"/api/leads/{lead_id}/assign", headers=H, json={"assigned_to": jane_id})
    check("assign lead to employee", res.status_code == 200, res.get_data(as_text=True))
    res = client.post(f"/api/projects/{project_id}/tasks", headers=H, json={
        "title": "Onboard client", "priority": "High",
        "due_date": "2026-10-20", "assigned_to": jane_id})
    check("create task for employee", res.status_code == 201, res.get_data(as_text=True))
    task2_id = res.get_json()["data"]["id"]
    res = client.put(f"/api/projects/{project_id}", headers=H, json={"manager_id": jane_id})
    check("set employee as project manager", res.status_code == 200, res.get_data(as_text=True))

    res = client.get(f"/api/employees/{jane_id}", headers=H)
    detail = res.get_json()["data"]
    check("employee detail lists assigned work",
          res.status_code == 200
          and len(detail.get("assigned_leads") or []) == 1
          and len(detail.get("open_tasks") or []) == 1
          and len(detail.get("managed_projects") or []) == 1
          and detail.get("lead_count") == 1,
          "leads=%s tasks=%s projects=%s" % (
              len(detail.get("assigned_leads") or []),
              len(detail.get("open_tasks") or []),
              len(detail.get("managed_projects") or [])))

    res = client.post(f"/api/leads/{lead_id}/assign", headers=H, json={"assigned_to": ""})
    check("unassign lead", res.status_code == 200, res.get_data(as_text=True))
    res = client.put(f"/api/projects/tasks/{task2_id}", headers=H, json={"assigned_to": ""})
    check("unassign task", res.status_code == 200, res.get_data(as_text=True))
    res = client.put(f"/api/projects/{project_id}", headers=H, json={"manager_id": ""})
    check("clear project manager", res.status_code == 200, res.get_data(as_text=True))
    res = client.get(f"/api/employees/{jane_id}", headers=H)
    detail = res.get_json()["data"]
    check("work list cleared after unassign",
          len(detail.get("assigned_leads") or []) == 0
          and len(detail.get("open_tasks") or []) == 0
          and len(detail.get("managed_projects") or []) == 0,
          str(detail.get("assigned_leads"))[:200])

    print("== lead visibility ==")
    res = client.post(f"/api/leads/{lead_id}/assign", headers=H, json={"assigned_to": jane_id})
    check("admin assigns lead to jane", res.status_code == 200, res.get_data(as_text=True))
    res = client.post("/api/leads", headers=H, json={
        "name": "Second Buyer", "email": "second@acme.com", "phone": "555-000-1111",
        "company_id": company_id, "source": "Referral", "priority": "Medium",
        "value": "9000", "service": "Consulting", "assigned_to": john_id})
    check("admin creates lead for john", res.status_code == 201, res.get_data(as_text=True))
    lead2_id = res.get_json()["data"]["id"]

    res = client.get("/api/leads", headers=HJ)
    jane_ids = [i["id"] for i in (res.get_json()["data"].get("items") or [])]
    check("jane sees her lead only", res.status_code == 200
          and lead_id in jane_ids and lead2_id not in jane_ids, str(jane_ids))
    res = client.get("/api/leads", headers=HN)
    john_ids = [i["id"] for i in (res.get_json()["data"].get("items") or [])]
    check("john sees his lead only", res.status_code == 200
          and lead2_id in john_ids and lead_id not in john_ids, str(john_ids))
    res = client.get(f"/api/leads/{lead2_id}", headers=HJ)
    check("jane cannot open others lead", res.status_code == 404, res.get_data(as_text=True))
    res = client.get(f"/api/leads/{lead_id}", headers=HN)
    check("john cannot open others lead", res.status_code == 404, res.get_data(as_text=True))

    res = client.post(f"/api/leads/{lead_id}/assign", headers=HJ, json={"assigned_to": john_id})
    check("employee cannot reassign lead", res.status_code == 403, res.get_data(as_text=True))
    res = client.put(f"/api/leads/{lead2_id}", headers=HJ, json={"name": "Hacked"})
    check("employee cannot edit others lead", res.status_code == 404, res.get_data(as_text=True))
    res = client.delete(f"/api/leads/{lead2_id}", headers=HJ)
    check("employee cannot delete others lead", res.status_code == 404, res.get_data(as_text=True))

    res = client.post("/api/leads", headers=HJ, json={
        "name": "Jane Own Lead", "email": "own@acme.com", "phone": "555-000-2222",
        "company_id": company_id, "source": "Website", "priority": "Low",
        "value": "1000", "service": "Support"})
    own_lead = res.get_json().get("data") or {} if res.status_code == 201 else {}
    check("employee lead auto-assigned to self",
          res.status_code == 201 and own_lead.get("assigned_to") == jane_id,
          res.get_data(as_text=True))
    res = client.get("/api/leads", headers=HN)
    john_ids2 = [i["id"] for i in (res.get_json()["data"].get("items") or [])]
    check("john does not see jane new lead", own_lead.get("id") not in john_ids2, str(john_ids2))
    res = client.get(f"/api/leads/{own_lead.get('id')}", headers=HN)
    check("john blocked from jane lead detail", res.status_code == 404)

    res = client.post("/api/leads", headers=HN, json={
        "name": "Dev Own Lead", "email": "devown@acme.com", "phone": "555-000-3333",
        "company_id": company_id, "source": "Website", "priority": "Low",
        "value": "500", "service": "Support"})
    dev_lead = res.get_json().get("data") or {} if res.status_code == 201 else {}
    check("developer creates lead auto-assigned to self",
          res.status_code == 201 and dev_lead.get("assigned_to") == john_id,
          res.get_data(as_text=True))
    res = client.post(f"/api/leads/{dev_lead.get('id')}/followups", headers=HN,
                      json={"type": "Call", "due_date": "2026-10-10", "notes": "dev followup"})
    dev_fup = res.get_json().get("data") or {} if res.status_code == 201 else {}
    check("developer adds followup on own lead", res.status_code == 201,
          res.get_data(as_text=True))
    res = client.post(f"/api/leads/{lead_id}/followups", headers=HN,
                      json={"type": "Call", "due_date": "2026-10-10", "notes": "nope"})
    check("developer cannot followup others lead", res.status_code == 404,
          res.get_data(as_text=True))
    res = client.delete(f"/api/leads/{lead_id}", headers=HN)
    check("developer cannot delete others lead", res.status_code == 404,
          res.get_data(as_text=True))
    res = client.post("/api/companies", headers=HN, json={"name": "Dev Co", "industry": "Tech"})
    dev_company = res.get_json().get("data") or {} if res.status_code == 201 else {}
    check("developer creates company", res.status_code == 201, res.get_data(as_text=True))
    if dev_fup.get("id"):
        client.delete(f"/api/followups/{dev_fup['id']}", headers=H)
    if dev_lead.get("id"):
        client.delete(f"/api/leads/{dev_lead['id']}", headers=H)
    if dev_company.get("id"):
        client.delete(f"/api/companies/{dev_company['id']}", headers=H)

    res = client.get("/api/followups", headers=HJ)
    fup_lead_ids = {str(i.get("lead_id")) for i in (res.get_json()["data"].get("items") or [])}
    check("jane followups scoped to her lead",
          lead_id in fup_lead_ids and lead2_id not in fup_lead_ids, str(fup_lead_ids))
    res = client.get("/api/followups", headers=HN)
    john_sees = [i for i in (res.get_json()["data"].get("items") or [])
                 if str(i.get("lead_id")) == str(lead_id)]
    check("john cannot see jane followups", len(john_sees) == 0, str(john_sees))
    res = client.get(f"/api/leads/{lead2_id}/followups", headers=HJ)
    check("jane blocked from others lead followups", res.status_code == 404)

    res = client.post(f"/api/leads/{lead_id}/calls", headers=HJ, json={
        "direction": "Outbound", "duration": "3m", "summary": "Jane call", "outcome": "Connected"})
    check("jane logs call on her lead", res.status_code == 201, res.get_data(as_text=True))
    res = client.get("/api/calls", headers=HJ)
    jane_calls = [c for c in (res.get_json()["data"].get("items") or [])
                  if str(c.get("lead_id")) == str(lead_id)]
    check("jane sees her call", len(jane_calls) >= 1, str(jane_calls))
    res = client.get("/api/calls", headers=HN)
    john_calls = [c for c in (res.get_json()["data"].get("items") or [])
                  if str(c.get("lead_id")) == str(lead_id)]
    check("john cannot see jane call", len(john_calls) == 0, str(john_calls))

    res = client.delete(f"/api/leads/{own_lead.get('id')}", headers=HJ)
    check("jane deletes her own lead", res.status_code == 200, res.get_data(as_text=True))
    res = client.delete(f"/api/leads/{lead2_id}", headers=H)
    check("cleanup second lead", res.status_code == 200, res.get_data(as_text=True))

    print("== crud delete ==")
    res = client.delete(f"/api/leads/{lead_id}", headers=H)
    check("delete lead", res.status_code == 200)
    res = client.delete(f"/api/projects/{project_id}", headers=H)
    check("delete project", res.status_code == 200)

    print("== password policy ==")
    res = client.put("/api/auth/change-password", headers=HJ, json={
        "current_password": "secret1", "new_password": "secret2"})
    check("employee cannot change own password", res.status_code == 403,
          res.get_data(as_text=True))
    res = client.post("/api/auth/register", headers=HJ, json={
        "name": "Sneak", "email": f"sneak{SUFFIX}@crm.com", "password": "secret1",
        "role": "employee"})
    check("employee cannot register accounts", res.status_code == 403)
    res = client.put("/api/auth/change-password", headers=H, json={
        "current_password": "admin@123", "new_password": "admin@123"})
    check("admin can change own password", res.status_code == 200,
          res.get_data(as_text=True))
    res = client.put(f"/api/employees/{jane_id}", headers=H, json={
        "password": "newpass1"})
    check("admin resets employee password", res.status_code == 200)
    res = client.post("/api/auth/login", json={"email": f"jane{SUFFIX}@crm.com",
                                               "password": "newpass1"})
    check("reset password works", res.status_code == 200 and res.get_json().get("success"))

    print("== send message ==")
    res = client.post("/api/auth/notifications", headers=HJ, json={
        "user_id": jane_id, "message": "hello"})
    check("employee cannot send messages", res.status_code == 403,
          res.get_data(as_text=True))
    res = client.post("/api/auth/notifications", headers=H, json={
        "user_id": "emp_missing", "message": "hello"})
    check("unknown recipient rejected", res.status_code == 404, res.get_data(as_text=True))
    res = client.post("/api/auth/notifications", headers=H, json={
        "user_id": jane_id, "message": ""})
    check("empty message rejected", res.status_code == 422, res.get_data(as_text=True))
    res = client.post("/api/auth/notifications", headers=H, json={
        "user_id": jane_id, "title": "Follow-up reminder", "message": "Call Bob today"})
    check("admin sends message", res.status_code == 201, res.get_data(as_text=True))
    msg_id = res.get_json()["data"]["id"]
    res = client.get("/api/auth/notifications" + "?unread=1", headers=HJ)
    body = res.get_json()["data"]
    check("employee receives message",
          any(i["id"] == msg_id for i in body["items"]) and body["unread"] >= 1,
          str(body)[:300])
    res = client.get("/api/auth/notifications", headers=HN)
    john_items = res.get_json()["data"]["items"]
    check("message not visible to other employees",
          not any(i["id"] == msg_id for i in john_items), str(john_items)[:200])

    res = client.post(f"/api/auth/notifications/{msg_id}/reply", headers=HJ,
                      json={"message": "Will do, thanks."})
    check("employee replies to message", res.status_code == 201, res.get_data(as_text=True))
    reply_id = res.get_json()["data"]["id"]
    res = client.get("/api/auth/notifications", headers=H)
    admin_items = res.get_json()["data"]["items"]
    check("admin receives the reply",
          any(i["id"] == reply_id and i.get("created_by") == jane_id for i in admin_items),
          str(admin_items)[:300])

    res = client.post(f"/api/auth/notifications/{msg_id}/reply", headers=HN,
                      json={"message": "not for me"})
    check("cannot reply to another employee message", res.status_code == 404,
          res.get_data(as_text=True))
    res = client.post(f"/api/auth/notifications/{msg_id}/reply", headers=HJ,
                      json={"message": "  "})
    check("empty reply rejected", res.status_code == 422, res.get_data(as_text=True))

    res = client.post("/api/auth/notifications", headers=H,
                      json={"user_id": john_id, "message": "Dev question"})
    dev_msg = res.get_json()["data"]["id"]
    res = client.post(f"/api/auth/notifications/{dev_msg}/reply", headers=HN,
                      json={"message": "On it."})
    check("developer replies to message", res.status_code == 201, res.get_data(as_text=True))

    print("== lead import ==")
    res = client.post("/api/leads/import", headers=HJ,
                      data={"file": (io.BytesIO(b"name,email\nA,a@x.com\n"), "leads.csv")},
                      content_type="multipart/form-data")
    check("employee cannot import leads", res.status_code == 403, res.get_data(as_text=True))

    csv_bytes = ("name,email,phone,company,source,status,priority,value,service\r\n"
                 "Import One,one@x.com,555-111-0001,Import Co,Website,New,High,5000,Web\r\n"
                 "Import Two,two@x.com,555-111-0002,Import Co,Referral,Contacted,Low,1500,SEO\r\n"
                 ",bad@x.com,555-111-0003,,,,,,\r\n").encode("utf-8")
    res = client.post("/api/leads/import", headers=H,
                      data={"file": (io.BytesIO(csv_bytes), "leads.csv"),
                            "assigned_to": jane_id},
                      content_type="multipart/form-data")
    body = res.get_json()
    check("admin imports csv", res.status_code == 201
          and body["data"]["imported"] == 2 and body["data"]["failed"] == 1, str(body))
    res = client.get("/api/leads" + qs("assigned_to", jane_id), headers=H)
    jane_leads = res.get_json()["data"]["items"]
    imported_names = [i["name"] for i in jane_leads]
    check("imported leads assigned to chosen employee",
          "Import One" in imported_names and "Import Two" in imported_names,
          str(imported_names))

    res = client.get("/api/leads" + qs("assigned_to", jane_id), headers=HJ)
    jane_own = [i["name"] for i in res.get_json()["data"]["items"]]
    check("employee sees imported leads after assignment",
          "Import One" in jane_own, str(jane_own))

    res = client.post("/api/leads/import", headers=H,
                      data={"file": (io.BytesIO(b"a,b"), "notes.txt")},
                      content_type="multipart/form-data")
    check("wrong file type rejected", res.status_code == 422, res.get_data(as_text=True))

    res = client.post("/api/leads/import", headers=H,
                      data={"file": (io.BytesIO(b""), "empty.csv")},
                      content_type="multipart/form-data")
    check("empty file rejected", res.status_code == 422, res.get_data(as_text=True))

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Name", "Email", "Company", "Value"])
    ws.append(["Import Three", "three@x.com", "Import Co", 2500])
    xls_buf = io.BytesIO()
    wb.save(xls_buf)
    xls_buf.seek(0)
    res = client.post("/api/leads/import", headers=H,
                      data={"file": (xls_buf, "leads.xlsx"), "assigned_to": jane_id},
                      content_type="multipart/form-data")
    body = res.get_json()
    check("admin imports xlsx", res.status_code == 201 and body["data"]["imported"] == 1,
          str(body))
    res = client.get("/api/companies" + qs("q", "Import Co"), headers=H)
    companies = res.get_json()["data"]["items"]
    check("company created once during import",
          len([c for c in companies if c["name"] == "Import Co"]) == 1, str(companies))

    res = client.get("/api/leads" + qs("assigned_to", jane_id), headers=H)
    for lead_row in res.get_json()["data"]["items"]:
        if str(lead_row.get("name", "")).startswith("Import"):
            client.delete(f"/api/leads/{lead_row['id']}", headers=H)
    res = client.get("/api/leads" + qs("q", "Import"), headers=H)
    leftover = [i for i in res.get_json()["data"]["items"] if i["name"].startswith("Import")]
    check("cleanup imported leads", len(leftover) == 0, str(leftover))
    for company in companies:
        if company["name"] == "Import Co":
            client.delete(f"/api/companies/{company['id']}", headers=H)

    print("== cleanup ==")
    for label, emp_id in (("delete jane", jane_id), ("delete john", john_id)):
        res = client.delete(f"/api/employees/{emp_id}", headers=H)
        check(label, res.status_code == 200)

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
