(function () {
  "use strict";

  var page = document.body.getAttribute("data-page") || "";
  var ACCESS = {
    "admin-dashboard": ["admin"],
    "employee-dashboard": ["employee"],
    "developer-dashboard": ["developer"],
    "settings": ["admin", "employee", "developer"]
  };
  var TITLES = {
    "admin-dashboard": "Dashboard",
    "employee-dashboard": "Dashboard",
    "developer-dashboard": "Dashboard",
    "settings": "Settings"
  };

  var roles = ACCESS[page];
  if (!roles) return;
  var user = CRM.requireAuth(roles);
  if (!user) return;

  CRM.initShell(page, TITLES[page]).then(function () {
    if (page === "admin-dashboard") renderAdmin();
    else if (page === "employee-dashboard") renderEmployee();
    else if (page === "developer-dashboard") renderDeveloper();
    else renderSettings();
  });

  var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function loadingHtml() {
    return '<div class="loading"><div><div class="spinner"></div>Loading…</div></div>';
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function fillIds(ids, html) {
    ids.forEach(function (id) { setHtml(id, html); });
  }

  function errorState(e) {
    return CRM.emptyState("!", "Something went wrong",
      e && e.message ? e.message : "Unable to load data right now.");
  }

  function statCard(o) {
    return '<div class="stat-card ' + (o.accent || "") + '">' +
      '<div class="st-head"><span class="st-label">' + CRM.escapeHtml(o.label) + "</span>" +
      '<span class="st-ico">' + o.icon + "</span></div>" +
      '<div class="st-value">' + o.value + "</div>" +
      '<div class="st-foot">' + (o.foot || "") + "</div></div>";
  }

  function cut(text, max) {
    var s = String(text || "");
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function leadItem(l) {
    return '<div class="mini-item">' +
      '<div><div class="mi-main"><a href="/pages/leads.html">' +
      CRM.escapeHtml(l.name) + "</a></div>" +
      '<div class="mi-sub">' + CRM.escapeHtml(l.company_name || l.source || "No company") +
      " · " + CRM.formatDate(l.created_at) + "</div></div>" +
      '<div class="mi-end">' + CRM.badge(l.status) +
      '<div class="mi-sub">' + CRM.money(l.value) + "</div></div></div>";
  }

  function projectItem(p, withProgress) {
    var pct = Math.max(0, Math.min(100, Number(p.progress || 0)));
    var progress = withProgress
      ? '<div class="progress" style="margin-top:7px;max-width:240px"><span style="width:' + pct + '%"></span></div>'
      : "";
    return '<div class="mini-item">' +
      '<div><div class="mi-main"><a href="/pages/projects.html">' +
      CRM.escapeHtml(p.name) + "</a></div>" +
      '<div class="mi-sub">' + CRM.escapeHtml(p.company_name || "No company") +
      " · ends " + CRM.formatDate(p.end_date) + "</div>" + progress + "</div>" +
      '<div class="mi-end">' + CRM.badge(p.status) +
      (withProgress ? '<div class="mi-sub">' + pct + "%</div>" : "") + "</div></div>";
  }

  function followupItem(f) {
    return '<div class="mini-item">' +
      '<div><div class="mi-main">' + CRM.badge(f.type) +
      ' <a href="/pages/followups.html">' +
      CRM.escapeHtml(f.lead_name || "Lead") + "</a></div>" +
      '<div class="mi-sub">Due ' + CRM.formatDate(f.due_date) + "</div></div>" +
      '<div class="mi-end">' + CRM.badge(f.status) + "</div></div>";
  }

  function renderLeadList(id, items, emptyTitle, emptySub) {
    if (!items.length) { setHtml(id, CRM.emptyState("&#10148;", emptyTitle, emptySub)); return; }
    setHtml(id, '<div class="mini-list">' + items.map(leadItem).join("") + "</div>");
  }

  function renderFollowupList(id, items, emptyTitle, emptySub) {
    if (!items.length) { setHtml(id, CRM.emptyState("&#9200;", emptyTitle, emptySub)); return; }
    setHtml(id, '<div class="mini-list">' + items.map(followupItem).join("") + "</div>");
  }

  function renderProjectList(id, items, emptyTitle, emptySub) {
    if (!items.length) {
      setHtml(id, CRM.emptyState("&#9635;", emptyTitle || "No projects yet",
        emptySub || "Projects will show up here."));
      return;
    }
    setHtml(id, '<div class="mini-list">' +
      items.map(function (p) { return projectItem(p, true); }).join("") + "</div>");
  }

  function renderAdmin() {
    var ids = ["adminStats", "trendChart", "statusChart",
      "recentLeads", "recentProjects", "dueFollowups", "teamRows"];
    fillIds(ids, loadingHtml());

    Promise.all([
      CRM.api.get("/reports/dashboard"),
      CRM.api.get("/leads" + CRM.qs({ per_page: 5, sort: "created_at", dir: "desc" })),
      CRM.api.get("/followups" + CRM.qs({ due: 1, per_page: 5 })),
      CRM.api.get("/employees" + CRM.qs({ per_page: 200, sort: "name", dir: "asc" }))
    ]).then(function (r) {
      var d = r[0];
      renderAdminStats(d);
      renderTrend(d.trend);
      renderStatus(d.leads && d.leads.by_status);
      renderLeadList("recentLeads", (r[1] && r[1].items) || [],
        "No leads yet", "Newly created leads will show up here.");
      var projects = d.recent_projects || [];
      if (projects.length) {
        setHtml("recentProjects", '<div class="mini-list">' +
          projects.map(function (p) { return projectItem(p, true); }).join("") + "</div>");
      } else {
        setHtml("recentProjects", CRM.emptyState("&#9635;", "No projects yet",
          "Projects created recently will show up here."));
      }
      renderFollowupList("dueFollowups", (r[2] && r[2].items) || [],
        "Nothing due today", "No follow-ups are pending for today.");
      renderTeam((r[3] && r[3].items) || []);
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      fillIds(ids, errorState(e));
    });
  }

  function renderTeam(items) {
    var body = document.getElementById("teamRows");
    if (!body) return;
    var sub = document.getElementById("teamSub");
    if (sub) {
      var active = items.filter(function (e) { return e.status === "Active"; }).length;
      sub.textContent = items.length + " people · " + active + " active · click Manage employees for the full profile";
    }
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="7">' + CRM.emptyState("&#9874;", "No team members yet",
        "Create the first account from the Employees page.",
        '<a class="btn btn-primary btn-sm" href="/pages/employees.html">Add employee</a>') + "</td></tr>";
      return;
    }
    body.innerHTML = items.map(function (e) {
      var workload = CRM.formatNumber(e.lead_count || 0) + " lead" + (Number(e.lead_count) === 1 ? "" : "s") +
        " · " + CRM.formatNumber(e.project_count || 0) + " proj" + (Number(e.project_count) === 1 ? "" : "s") +
        (Number(e.open_tasks) ? " · " + CRM.formatNumber(e.open_tasks) + " open" : "");
      return "<tr>" +
        '<td><a href="/pages/employees.html"><div class="cell-with-avatar"><span class="avatar-sm">' +
        CRM.initials(e.name) + "</span><div><div class=\"cell-main\">" + CRM.escapeHtml(e.name) +
        '</div><div class="cell-sub">' + CRM.escapeHtml(e.email || "") + "</div></div></div></a></td>" +
        "<td>" + CRM.badge(e.role) + "</td>" +
        "<td><div class=\"cell-main small\">" + CRM.escapeHtml(e.department || "—") + "</div>" +
        '<div class="cell-sub">' + CRM.escapeHtml(e.designation || "") + "</div></td>" +
        '<td><div class="small">' + CRM.escapeHtml(e.phone || "—") + "</div>" +
        '<div class="cell-sub">' + CRM.escapeHtml(e.designation || e.department || "") + "</div></td>" +
        '<td><div class="small">' + workload + "</div>" +
        '<div class="cell-sub">' + CRM.formatNumber(e.call_count || 0) + " calls</div></td>" +
        "<td>" + CRM.badge(e.status) + "</td>" +
        "<td>" + CRM.formatDate(e.joined_date || e.created_at) + "</td>" +
        "</tr>";
    }).join("");
  }

  function renderAdminStats(d) {
    var l = d.leads || {}, p = d.projects || {}, e = d.employees || {}, f = d.followups || {};
    setHtml("adminStats",
      statCard({
        label: "Total Leads", icon: "&#10148;",
        value: CRM.formatNumber(l.total),
        foot: CRM.formatNumber(l.conversion_rate || 0) + "% conversion rate"
      }) +
      statCard({
        label: "Pipeline Value", icon: "₹", accent: "accent-info",
        value: CRM.money(l.pipeline_value),
        foot: CRM.formatNumber(l.converted || 0) + " leads converted"
      }) +
      statCard({
        label: "Active Projects", icon: "&#9635;", accent: "accent-success",
        value: CRM.formatNumber(p.active),
        foot: CRM.formatNumber(p.completed || 0) + " of " + CRM.formatNumber(p.total || 0) + " completed"
      }) +
      statCard({
        label: "Team Members", icon: "&#9874;",
        value: CRM.formatNumber(e.active),
        foot: CRM.formatNumber(e.total || 0) + " total on the team"
      }) +
      statCard({
        label: "Pending Follow-ups", icon: "&#9200;", accent: "accent-warning",
        value: CRM.formatNumber(f.pending),
        foot: CRM.formatNumber(f.due_today || 0) + " due today"
      }) +
      statCard({
        label: "Revenue (Won)", icon: "&#10003;", accent: "accent-success",
        value: CRM.money(l.won_value),
        foot: "Total value of won leads"
      })
    );
  }

  function renderTrend(trend) {
    trend = trend || {};
    var months = trend.months || [];
    var leads = trend.leads || [];
    var projects = trend.projects || [];
    if (!months.length) {
      setHtml("trendChart", CRM.emptyState("&#9641;", "No trend data",
        "Monthly activity will appear here."));
      return;
    }
    var max = 1;
    leads.concat(projects).forEach(function (v) {
      if (Number(v) > max) max = Number(v);
    });
    var legend = '<span class="legend mb-16" style="flex-direction:row;gap:18px">' +
      '<span class="lg-item"><span class="lg-dot" style="background:var(--primary)"></span> Leads</span>' +
      '<span class="lg-item"><span class="lg-dot" style="background:var(--info)"></span> Projects</span></span>';
    var cols = months.map(function (m, i) {
      var lv = Number(leads[i] || 0);
      var pv = Number(projects[i] || 0);
      var lh = lv > 0 ? Math.max(6, Math.round(lv / max * 100)) : 2;
      var ph = pv > 0 ? Math.max(6, Math.round(pv / max * 100)) : 2;
      var monthIdx = parseInt(String(m).slice(5), 10) - 1;
      var label = (MONTH_NAMES[monthIdx] || String(m).slice(5)) + " " + String(m).slice(2, 4);
      return '<div class="bar-col">' +
        '<span class="bar-val">' + lv + " · " + pv + "</span>" +
        '<div class="bar-track" style="gap:6px">' +
        '<div class="bar" style="width:42%;height:' + lh + '%" title="Leads: ' + lv + '"></div>' +
        '<div class="bar alt" style="width:42%;height:' + ph + '%" title="Projects: ' + pv + '"></div>' +
        "</div>" +
        '<span class="bar-label">' + label + "</span></div>";
    }).join("");
    setHtml("trendChart", legend + '<div class="bar-chart">' + cols + "</div>");
  }

  function renderStatus(byStatus) {
    var entries = Object.keys(byStatus || {}).map(function (k) {
      return [k, Number(byStatus[k] || 0)];
    });
    if (!entries.length) {
      setHtml("statusChart", CRM.emptyState("&#9673;", "No leads yet",
        "Lead statuses will appear once leads are created."));
      return;
    }
    entries.sort(function (a, b) { return b[1] - a[1]; });
    var max = entries[0][1] || 1;
    var html = '<div class="hbar-list">' + entries.map(function (entry, i) {
      var pct = Math.max(3, Math.round(entry[1] / max * 100));
      return '<div class="hbar-item c' + ((i % 6) + 1) + '">' +
        '<div class="hb-top"><span>' + CRM.escapeHtml(entry[0]) + "</span><b>" +
        CRM.formatNumber(entry[1]) + "</b></div>" +
        '<div class="hb-bar"><span style="width:' + pct + '%"></span></div></div>';
    }).join("") + "</div>";
    setHtml("statusChart", html);
  }

  function renderEmployee() {
    var ids = ["empStats", "empLeads", "empFollowups", "empProjects",
      "trendChart", "statusChart"];
    fillIds(ids, loadingHtml());

    Promise.all([
      CRM.api.get("/reports/dashboard"),
      CRM.api.get("/leads" + CRM.qs({ per_page: 5, sort: "created_at", dir: "desc" })),
      CRM.api.get("/followups" + CRM.qs({ due: 1, per_page: 5 }))
    ]).then(function (r) {
      var d = r[0], l = d.leads || {};
      setHtml("empStats",
        statCard({
          label: "My Leads", icon: "&#10148;",
          value: CRM.formatNumber(l.total),
          foot: CRM.formatNumber(l.new || 0) + " new in your pipeline"
        }) +
        statCard({
          label: "Won", icon: "&#10003;", accent: "accent-success",
          value: CRM.formatNumber(l.won),
          foot: "Closed deals"
        }) +
        statCard({
          label: "Follow-ups Due", icon: "&#9200;", accent: "accent-warning",
          value: CRM.formatNumber(d.followups_due),
          foot: "Pending or overdue"
        }) +
        statCard({
          label: "Calls Logged", icon: "&#9742;", accent: "accent-info",
          value: CRM.formatNumber(d.calls),
          foot: "Calls recorded by you"
        }) +
        statCard({
          label: "My Projects", icon: "&#9635;",
          value: CRM.formatNumber(d.projects),
          foot: "Projects you manage"
        })
      );
      renderTrend(d.trend);
      renderStatus(l.by_status);
      renderLeadList("empLeads", (r[1] && r[1].items) || [],
        "No leads assigned", "Leads assigned to you will appear here.");
      renderProjectList("empProjects", d.recent_projects || [],
        "No projects yet", "Projects you manage will show up here.");
      renderFollowupList("empFollowups", (r[2] && r[2].items) || [],
        "Nothing due", "No follow-ups are due for you today.");
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      fillIds(ids, errorState(e));
    });
  }

  function renderDeveloper() {
    var ids = ["devStats", "devTasks", "devProjects", "devLeads", "devFollowups",
      "trendChart", "statusChart"];
    fillIds(ids, loadingHtml());

    Promise.all([
      CRM.api.get("/reports/dashboard"),
      CRM.api.get("/projects" + CRM.qs({ mine: 1, per_page: 5 })),
      CRM.api.get("/projects/tasks/all" + CRM.qs({ mine: 1, per_page: 6 })),
      CRM.api.get("/followups" + CRM.qs({ due: 1, per_page: 5 }))
    ]).then(function (r) {
      var d = r[0], t = d.tasks || {}, l = d.leads || {};
      var pct = t.total ? Math.round((t.done || 0) / t.total * 100) : 0;
      setHtml("devStats",
        statCard({
          label: "Open Tasks", icon: "&#9636;", accent: "accent-warning",
          value: CRM.formatNumber(t.open),
          foot: "Waiting to be completed"
        }) +
        statCard({
          label: "Tasks Done", icon: "&#10003;", accent: "accent-success",
          value: CRM.formatNumber(t.done),
          foot: CRM.formatNumber(t.total || 0) + " tasks in total"
        }) +
        statCard({
          label: "Active Projects", icon: "&#9635;", accent: "accent-info",
          value: CRM.formatNumber(d.projects),
          foot: "Projects you are assigned to"
        }) +
        statCard({
          label: "Completion", icon: "&#9641;", accent: "accent-success",
          value: pct + "%",
          foot: "Share of tasks finished"
        }) +
        statCard({
          label: "My Leads", icon: "&#10148;",
          value: CRM.formatNumber(l.total),
          foot: "Leads assigned to you"
        })
      );
      renderTrend(d.trend);
      renderStatus(l.by_status);
      renderDevTasks((r[2] && r[2].items) || []);
      renderDevProjects((r[1] && r[1].items) || []);
      renderLeadList("devLeads", d.recent_leads || [],
        "No leads assigned", "Leads assigned to you will appear here.");
      renderFollowupList("devFollowups", (r[3] && r[3].items) || [],
        "Nothing due", "No follow-ups are due for your leads today.");
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      fillIds(ids, errorState(e));
    });
  }

  function renderDevTasks(items) {
    if (!items.length) {
      setHtml("devTasks", CRM.emptyState("&#9636;", "No tasks assigned",
        "Tasks assigned to you will appear here."));
      return;
    }
    var rows = items.map(function (t) {
      var done = t.status === "Done";
      return "<tr>" +
        '<td><div class="cell-main">' + CRM.escapeHtml(t.title) + "</div>" +
        '<div class="cell-sub">' + CRM.escapeHtml(cut(t.description, 90)) + "</div></td>" +
        "<td>" + CRM.escapeHtml(t.project_name || "—") + "</td>" +
        "<td>" + CRM.badge(t.priority) + "</td>" +
        '<td class="nowrap">' + CRM.formatDate(t.due_date) + "</td>" +
        "<td>" + CRM.badge(t.status) + "</td>" +
        '<td class="td-right"><div class="actions">' +
        (done
          ? '<span class="muted small">Completed</span>'
          : '<button class="btn btn-sm btn-success" type="button" data-task-done="' +
            CRM.escapeHtml(t.id) + '">Mark done</button>') +
        "</div></td></tr>";
    }).join("");

    setHtml("devTasks",
      '<div class="table-wrap"><table class="data-table">' +
      "<thead><tr><th>Task</th><th>Project</th><th>Priority</th><th>Due date</th>" +
      '<th>Status</th><th class="td-right">Action</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>");

    var container = document.getElementById("devTasks");
    if (!container) return;
    Array.prototype.forEach.call(container.querySelectorAll("[data-task-done]"), function (btn) {
      btn.addEventListener("click", function () {
        completeTask(btn.getAttribute("data-task-done"), btn);
      });
    });
  }

  function completeTask(taskId, btn) {
    btn.disabled = true;
    btn.textContent = "Saving…";
    CRM.api.put("/projects/tasks/" + encodeURIComponent(taskId), { status: "Done" })
      .then(function () {
        CRM.showToast("Task marked as done.", "success");
        renderDeveloper();
      })
      .catch(function (e) {
        CRM.showToast(e.message, "error");
        btn.disabled = false;
        btn.textContent = "Mark done";
      });
  }

  function renderDevProjects(items) {
    if (!items.length) {
      setHtml("devProjects", CRM.emptyState("&#9635;", "No active projects",
        "Projects you are assigned to will appear here."));
      return;
    }
    setHtml("devProjects", '<div class="mini-list">' +
      items.map(function (p) { return projectItem(p, true); }).join("") + "</div>");
  }

  function renderSettings() {
    var profileForm = document.getElementById("profileForm");
    var passwordForm = document.getElementById("passwordForm");
    var passwordCard = document.getElementById("passwordCard");
    var signOutBtn = document.getElementById("signOutBtn");
    var isAdmin = CRM.effectiveRole(CRM.getUser()) === "admin";

    loadAccount();

    if (passwordCard && !isAdmin) {
      passwordCard.innerHTML =
        '<div class="card-header"><div><h3>Password</h3>' +
        '<div class="ch-sub">Managed by your administrator</div></div></div>' +
        '<div class="card-body"><p class="muted small" style="margin:0">' +
        'Employee passwords are set and reset by an admin from the Employees page. ' +
        "Ask your administrator if you need a new password.</p></div>";
      passwordForm = null;
    }

    if (profileForm) profileForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = val("setFullName");
      if (!name) { CRM.showToast("Full name is required.", "error"); return; }
      var body = {
        name: name,
        phone: val("setPhone"),
        department: val("setDepartment"),
        designation: val("setDesignation")
      };
      var btn = document.getElementById("profileSave");
      if (btn) btn.disabled = true;
      CRM.api.put("/auth/profile", body).then(function () {
        CRM.showToast("Profile updated.", "success");
        var stored = CRM.getUser();
        if (stored) {
          stored.name = body.name;
          stored.phone = body.phone;
          stored.department = body.department;
          stored.designation = body.designation;
          CRM.setSession(CRM.getToken(), stored);
        }
        var nameEl = document.getElementById("userName");
        if (nameEl) nameEl.textContent = body.name;
        var avatarEl = document.getElementById("userAvatar");
        if (avatarEl) avatarEl.textContent = CRM.initials(body.name);
        loadAccount();
      }).catch(function (err) {
        CRM.showToast(err.message, "error");
      }).then(function () {
        if (btn) btn.disabled = false;
      });
    });

    if (passwordForm) passwordForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var current = val("currentPassword");
      var next = val("newPassword");
      var matching = val("confirmPassword");
      if (!current || !next || !matching) {
        CRM.showToast("Please fill in all password fields.", "error");
        return;
      }
      if (next.length < 6) {
        CRM.showToast("New password must be at least 6 characters.", "error");
        return;
      }
      if (next !== matching) {
        CRM.showToast("Passwords do not match.", "error");
        return;
      }
      var btn = document.getElementById("passwordSave");
      if (btn) btn.disabled = true;
      CRM.api.put("/auth/change-password", {
        current_password: current,
        new_password: next
      }).then(function () {
        CRM.showToast("Password changed successfully.", "success");
        passwordForm.reset();
      }).catch(function (err) {
        CRM.showToast(err.message, "error");
      }).then(function () {
        if (btn) btn.disabled = false;
      });
    });

    if (signOutBtn) signOutBtn.addEventListener("click", function () {
      CRM.clearSession();
      location.href = "/pages/login.html";
    });
  }

  function infoRow(label, value) {
    return '<div class="mini-item"><div class="mi-main muted small">' +
      CRM.escapeHtml(label) + '</div><div class="mi-end strong small">' + value + "</div></div>";
  }

  function loadAccount() {
    setHtml("accountInfo", loadingHtml());
    CRM.api.get("/auth/me").then(function (me) {
      var nameInput = document.getElementById("setFullName");
      var emailInput = document.getElementById("setEmail");
      var phoneInput = document.getElementById("setPhone");
      var deptInput = document.getElementById("setDepartment");
      var desigInput = document.getElementById("setDesignation");
      if (nameInput) nameInput.value = me.name || "";
      if (emailInput) emailInput.value = me.email || "";
      if (phoneInput) phoneInput.value = me.phone || "";
      if (deptInput) deptInput.value = me.department || "";
      if (desigInput) desigInput.value = me.designation || "";
      var sessionName = document.getElementById("sessionName");
      if (sessionName) sessionName.textContent = me.name || me.email || "user";

      var rows =
        infoRow("Role", CRM.badge(me.role)) +
        infoRow("Status", CRM.badge(me.status)) +
        infoRow("Joined", CRM.escapeHtml(CRM.formatDate(me.joined_date))) +
        infoRow("Employee ID", "#" + CRM.escapeHtml(String(me.id)));
      setHtml("accountInfo", rows);

      if (me.role !== "developer") {
        CRM.api.get("/employees/" + encodeURIComponent(me.id)).then(function (emp) {
          if (!emp) return;
          setHtml("accountInfo", rows +
            infoRow("Leads assigned", CRM.formatNumber(emp.lead_count || 0)) +
            infoRow("Projects assigned", CRM.formatNumber(emp.project_count || 0)));
        }).catch(function () { });
      }
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      setHtml("accountInfo", errorState(e));
    });
  }
})();
