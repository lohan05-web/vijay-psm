(function () {
  "use strict";

  var user = CRM.requireAuth(["admin"]);
  if (!user) return;

  var state = { page: 1, perPage: 15, q: "", role: "", status: "", editingId: null, detailId: null };
  var roles = [];

  CRM.initShell("employees", "Employees").then(function () {
    wire();
    loadRoles().then(function () {
      loadStats();
      load();
    });
  });

  function el(id) { return document.getElementById(id); }

  function wire() {
    var addBtn = el("addEmployeeBtn");
    if (addBtn) addBtn.addEventListener("click", function () { openForm(null); });

    var search = el("empSearch");
    if (search) search.addEventListener("input", CRM.debounce(function () {
      state.q = search.value.trim();
      state.page = 1;
      load();
    }, 300));

    var role = el("filterRole");
    if (role) role.addEventListener("change", function () { state.role = role.value; state.page = 1; load(); });

    var status = el("filterStatus");
    if (status) status.addEventListener("change", function () { state.status = status.value; state.page = 1; load(); });

    var clear = el("clearFilters");
    if (clear) clear.addEventListener("click", function () {
      state.q = ""; state.role = ""; state.status = ""; state.page = 1;
      if (search) search.value = "";
      if (role) role.value = "";
      if (status) status.value = "";
      load();
    });

    var roleSelect = el("empRole");
    if (roleSelect) roleSelect.addEventListener("change", function () {
      toggleNewRoleFields();
    });

    var form = el("employeeForm");
    if (form) form.addEventListener("submit", save);

    var rows = el("empRows");
    if (rows) rows.addEventListener("click", function (e) {
      if (e.target.closest("#emptyAddBtn")) { openForm(null); return; }
      var assign = e.target.closest("[data-assign]");
      var view = e.target.closest("[data-view]");
      var edit = e.target.closest("[data-edit]");
      var del = e.target.closest("[data-del]");
      if (assign) openAssign(assign.getAttribute("data-assign"));
      else if (view) openDetail(view.getAttribute("data-view"));
      else if (edit) openForm(edit.getAttribute("data-edit"));
      else if (del) remove(del.getAttribute("data-del"));
    });

    var pagination = el("pagination");
    if (pagination) CRM.bindPagination(pagination, function (page) {
      state.page = page;
      load();
    });

    var detailEdit = el("detailEditBtn");
    if (detailEdit) detailEdit.addEventListener("click", function () {
      if (state.detailId) openForm(state.detailId);
    });

    var detailAssign = el("detailAssignBtn");
    if (detailAssign) detailAssign.addEventListener("click", function () {
      if (state.detailId) openAssign(state.detailId);
    });

    var detailBody = el("employeeDetailBody");
    if (detailBody) detailBody.addEventListener("click", function (e) {
      var ul = e.target.closest("[data-unassign-lead]");
      var ut = e.target.closest("[data-unassign-task]");
      var up = e.target.closest("[data-unassign-project]");
      if (ul) unassignLead(ul.getAttribute("data-unassign-lead"));
      else if (ut) unassignTask(ut.getAttribute("data-unassign-task"));
      else if (up) unassignProject(up.getAttribute("data-unassign-project"));
    });

    var typeBar = el("assignType");
    if (typeBar) typeBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-assign-type]");
      if (btn) setAssignType(btn.getAttribute("data-assign-type"));
    });

    var assignSubmit = el("assignSubmit");
    if (assignSubmit) assignSubmit.addEventListener("click", submitAssign);
  }

  function loadRoles() {
    return CRM.api.get("/roles").then(function (data) {
      roles = Array.isArray(data) ? data : (data && data.items) || [];
      fillRoleSelects();
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      roles = [];
      fillRoleSelects();
    });
  }

  function roleOptions() {
    return roles.map(function (r) {
      return '<option value="' + CRM.escapeHtml(r.name) + '">' + CRM.escapeHtml(r.name) +
        " (" + CRM.escapeHtml(roleLabel(r.access)) + ")</option>";
    }).join("");
  }

  function roleLabel(access) {
    return String(access || "employee").charAt(0).toUpperCase() + String(access || "employee").slice(1);
  }

  function fillRoleSelects() {
    var filter = el("filterRole");
    if (filter) {
      var current = filter.value;
      filter.innerHTML = '<option value="">All roles</option>' + roleOptions();
      if (current) filter.value = current;
      if (!filter.value) filter.value = "";
      state.role = filter.value;
    }
    var select = el("empRole");
    if (select) {
      var picked = select.value;
      select.innerHTML = roleOptions() + '<option value="__new">&#65291; Add new role…</option>';
      if (picked && picked !== "__new" && roles.some(function (r) { return r.name === picked; })) {
        select.value = picked;
      } else if (picked !== "__new" && roles.length) {
        var fallback = roles.filter(function (r) { return r.name === "employee"; })[0] || roles[0];
        select.value = fallback.name;
      }
      toggleNewRoleFields();
    }
  }

  function toggleNewRoleFields() {
    var select = el("empRole");
    var box = el("newRoleFields");
    if (!box) return;
    if (select && select.value === "__new") box.classList.remove("hidden");
    else box.classList.add("hidden");
  }

  function loadStats() {
    CRM.api.get("/employees" + CRM.qs({ per_page: 200 })).then(function (data) {
      var items = data.items || [];
      var counts = { total: items.length, active: 0, admin: 0, employee: 0, developer: 0, leave: 0, leads: 0, projects: 0 };
      items.forEach(function (e) {
        if (e.status === "Active") counts.active++;
        if (e.status === "On Leave") counts.leave++;
        if (counts[e.role] !== undefined && e.role !== "total") counts[e.role]++;
        counts.leads += Number(e.lead_count || 0);
        counts.projects += Number(e.project_count || 0);
      });
      var target = el("empStats");
      if (target) target.innerHTML =
        card("Total employees", counts.total, "Registered accounts", "") +
        card("Active", counts.active, counts.leave + " on leave", "accent-success") +
        card("Admins", counts.admin, "Full access", "accent-info") +
        card("Employees", counts.employee, "Sales & delivery staff", "") +
        card("Developers", counts.developer, "Engineering team", "accent-success") +
        card("Workload", counts.leads, counts.projects + " projects managed", "accent-warning");
      var count = el("teamCount");
      if (count) count.textContent = counts.total + " people on the team · " + counts.leads + " leads assigned · " + counts.projects + " projects managed";
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }

  function card(label, value, foot, accent) {
    return '<div class="stat-card ' + accent + '">' +
      '<div class="st-head"><span class="st-label">' + CRM.escapeHtml(label) + "</span></div>" +
      '<div class="st-value">' + CRM.formatNumber(value) + "</div>" +
      '<div class="st-foot">' + CRM.escapeHtml(foot) + "</div></div>";
  }

  function load() {
    var rows = el("empRows");
    if (rows) rows.innerHTML = '<tr><td colspan="8"><div class="loading"><div><div class="spinner"></div>Loading…</div></div></td></tr>';

    CRM.api.get("/employees" + CRM.qs({
      page: state.page, per_page: state.perPage, q: state.q,
      role: state.role, status: state.status, sort: "name", dir: "asc"
    })).then(function (data) {
      renderRows(data.items || []);
      renderPagination(data.meta || {});
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      if (rows) rows.innerHTML = '<tr><td colspan="8">' + CRM.emptyState("!", "Unable to load employees", e.message) + "</td></tr>";
    });
  }

  function renderRows(items) {
    var rows = el("empRows");
    if (!rows) return;
    if (!items.length) {
      rows.innerHTML = '<tr><td colspan="8">' + CRM.emptyState("&#9874;", "No employees found",
        "Adjust the filters or add your first team member.",
        '<button class="btn btn-primary btn-sm" type="button" id="emptyAddBtn">Add employee</button>') + "</td></tr>";
      return;
    }
    rows.innerHTML = items.map(function (e) {
      var workload = CRM.formatNumber(e.lead_count || 0) + " lead" + (Number(e.lead_count) === 1 ? "" : "s") +
        " · " + CRM.formatNumber(e.project_count || 0) + " proj" +
        (Number(e.project_count) === 1 ? "" : "s") +
        (Number(e.open_tasks) ? " · " + CRM.formatNumber(e.open_tasks) + " open task" + (Number(e.open_tasks) === 1 ? "" : "s") : "");
      return "<tr>" +
        '<td><div class="cell-with-avatar"><span class="avatar-sm">' + CRM.initials(e.name) + "</span>" +
        '<div><div class="cell-main">' + CRM.escapeHtml(e.name) + "</div>" +
        '<div class="cell-sub">' + CRM.escapeHtml(e.email || "") + "</div></div></div></td>" +
        "<td>" + CRM.badge(e.role) + "</td>" +
        "<td><div class=\"cell-main small\">" + CRM.escapeHtml(e.department || "—") + "</div>" +
        '<div class="cell-sub">' + CRM.escapeHtml(e.designation || "") + "</div></td>" +
        "<td>" + CRM.escapeHtml(e.phone || "—") + "</td>" +
        '<td><div class="small">' + workload + "</div>" +
        '<div class="cell-sub">' + CRM.formatNumber(e.call_count || 0) + " calls logged</div></td>" +
        "<td>" + CRM.badge(e.status) + "</td>" +
        "<td>" + CRM.formatDate(e.joined_date || e.created_at) + "</td>" +
        '<td><div class="actions">' +
        '<button class="btn btn-sm" type="button" data-view="' + CRM.escapeHtml(e.id) + '">View</button>' +
        '<button class="btn btn-sm btn-ghost" type="button" data-assign="' + CRM.escapeHtml(e.id) + '">Assign</button>' +
        '<button class="btn btn-sm" type="button" data-edit="' + CRM.escapeHtml(e.id) + '">Edit</button>' +
        '<button class="btn btn-sm btn-danger" type="button" data-del="' + CRM.escapeHtml(e.id) + '">Delete</button>' +
        "</div></td></tr>";
    }).join("");
  }

  function renderPagination(meta) {
    var box = el("pagination");
    if (box) box.innerHTML = CRM.paginationHtml(meta);
  }

  function openForm(id) {
    state.editingId = id || null;
    var form = el("employeeForm");
    var error = el("employeeFormError");
    if (error) { error.classList.add("hidden"); error.textContent = ""; }
    if (form) form.reset();

    var title = el("employeeModalTitle");
    var passReq = el("passwordReq");
    var passHint = el("passwordHint");
    var password = el("empPassword");
    if (title) title.textContent = id ? "Edit employee" : "Add employee";
    if (passReq) passReq.style.display = id ? "none" : "";
    if (passHint) passHint.textContent = id ? "Leave blank to keep the current password." : "Set the login password for this account.";
    if (password) password.placeholder = id ? "Leave blank to keep current" : "Minimum 6 characters";

    if (id) {
      CRM.api.get("/employees/" + encodeURIComponent(id)).then(function (e) {
        setVal("empName", e.name); setVal("empEmail", e.email); setVal("empPhone", e.phone);
        setVal("empRole", e.role); setVal("empStatus", e.status || "Active");
        setVal("empDepartment", e.department); setVal("empDesignation", e.designation);
        setVal("empJoined", String(e.joined_date || "").slice(0, 10));
        CRM.openModal("employeeModal");
      }).catch(function (e) { CRM.showToast(e.message, "error"); });
    } else {
      setVal("empStatus", "Active");
      setVal("empJoined", new Date().toISOString().slice(0, 10));
      CRM.openModal("employeeModal");
      setTimeout(function () { var n = el("empName"); if (n) n.focus(); }, 120);
    }
  }

  function setVal(id, value) {
    var node = el(id);
    if (node) node.value = value === null || value === undefined ? "" : value;
  }

  function getVal(id) {
    var node = el(id);
    return node ? String(node.value || "").trim() : "";
  }

  function showError(message) {
    var error = el("employeeFormError");
    if (!error) return;
    error.textContent = message;
    error.classList.remove("hidden");
  }

  function save(e) {
    e.preventDefault();
    var name = getVal("empName");
    var email = getVal("empEmail");
    var password = getVal("empPassword");
    var roleValue = getVal("empRole");
    var creatingRole = roleValue === "__new";
    var newRoleName = creatingRole ? getVal("newRoleName") : "";

    if (!name || !email) { showError("Full name and email are required."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showError("Enter a valid email address."); return; }
    if (!state.editingId && password.length < 6) { showError("Password must be at least 6 characters."); return; }
    if (state.editingId && password && password.length < 6) { showError("New password must be at least 6 characters."); return; }
    if (creatingRole && newRoleName.length < 2) { showError("Enter a name for the new role."); return; }

    var body = {
      name: name, email: email, phone: getVal("empPhone"),
      status: getVal("empStatus"), department: getVal("empDepartment"),
      designation: getVal("empDesignation"), joined_date: getVal("empJoined")
    };
    if (password) body.password = password;

    var btn = el("employeeSave");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    function done() { if (btn) { btn.disabled = false; btn.textContent = "Save employee"; } }

    var roleReady = creatingRole
      ? CRM.api.post("/roles", {
          name: newRoleName,
          access: getVal("newRoleAccess") || "employee",
          description: getVal("newRoleDesc")
        }).then(function (created) {
          CRM.showToast("Role '" + created.name + "' created", "success");
          return loadRoles().then(function () { return created.name; });
        })
      : Promise.resolve(roleValue);

    roleReady.then(function (finalRole) {
      body.role = finalRole;
      return state.editingId
        ? CRM.api.put("/employees/" + encodeURIComponent(state.editingId), body)
        : CRM.api.post("/employees", body);
    }).then(function () {
      CRM.showToast(state.editingId ? "Employee updated" : "Employee added", "success");
      CRM.closeModal("employeeModal");
      load();
      loadStats();
      if (state.detailId && state.editingId === state.detailId) openDetail(state.detailId);
      done();
    }).catch(function (err) {
      showError(err.message);
      done();
    });
  }

  function remove(id) {
    CRM.confirmAction({
      title: "Delete employee?",
      message: "The account will be removed from the team. Existing leads and projects stay untouched.",
      confirmText: "Delete"
    }).then(function (yes) {
      if (!yes) return;
      CRM.api.del("/employees/" + encodeURIComponent(id)).then(function () {
        CRM.showToast("Employee deleted", "success");
        load();
        loadStats();
      }).catch(function (e) { CRM.showToast(e.message, "error"); });
    });
  }

  function openDetail(id) {
    state.detailId = id;
    var body = el("employeeDetailBody");
    if (body) body.innerHTML = '<div class="loading"><div><div class="spinner"></div>Loading…</div></div>';
    CRM.openModal("employeeDetailModal");

    CRM.api.get("/employees/" + encodeURIComponent(id)).then(function (e) {
      if (body) body.innerHTML =
        '<div class="row mb-16"><span class="avatar" style="width:52px;height:52px;font-size:19px">' +
        CRM.initials(e.name) + "</span><div><h3>" + CRM.escapeHtml(e.name) + "</h3>" +
        '<div class="muted small">' + CRM.escapeHtml(e.designation || "Team member") +
        (e.department ? " · " + CRM.escapeHtml(e.department) : "") + "</div></div>" +
        '<div class="row" style="margin-left:auto">' + CRM.badge(e.role) + CRM.badge(e.status) + "</div></div>" +
        '<div class="kpi-row mb-16" style="gap:32px">' +
        kpi(e.lead_count, "Leads assigned") + kpi(e.won_leads, "Leads won") +
        kpi(e.project_count, "Projects managed") + kpi(e.open_tasks, "Open tasks") +
        kpi(e.call_count, "Calls logged") + "</div>" +
        '<div class="divider"></div>' +
        infoRow("Email", CRM.escapeHtml(e.email || "—")) +
        infoRow("Phone", CRM.escapeHtml(e.phone || "—")) +
        infoRow("Role", CRM.badge(e.role)) +
        infoRow("Department", CRM.escapeHtml(e.department || "—")) +
        infoRow("Designation", CRM.escapeHtml(e.designation || "—")) +
        infoRow("Joined", CRM.escapeHtml(CRM.formatDate(e.joined_date))) +
        infoRow("Employee ID", CRM.escapeHtml(String(e.id))) +
        infoRow("Last updated", CRM.escapeHtml(CRM.formatDate(String(e.updated_at || "").slice(0, 10)))) +
        '<div class="divider"></div>' +
        '<div class="cell-main" style="margin-bottom:8px">Current work</div>' +
        workHtml(e);
    }).catch(function (e) {
      CRM.showToast(e.message, "error");
      if (body) body.innerHTML = CRM.emptyState("!", "Unable to load employee", e.message);
    });
  }

  function kpi(value, label) {
    return '<div class="kpi"><div class="kpi-val">' + CRM.formatNumber(value || 0) +
      '</div><div class="kpi-label">' + CRM.escapeHtml(label) + "</div></div>";
  }

  function infoRow(label, valueHtml) {
    return '<div class="mini-item"><div class="mi-main muted small">' + CRM.escapeHtml(label) +
      '</div><div class="mi-end small strong">' + valueHtml + "</div></div>";
  }

  /* ------------------------------------------------------- assign work */
  var assignState = { employeeId: null, type: "lead", leads: [], projects: [], loaded: false };

  function openAssign(employeeId) {
    assignState.employeeId = employeeId;
    var error = el("assignError");
    if (error) { error.classList.add("hidden"); error.textContent = ""; }
    var title = el("assignTaskTitle");
    if (title) title.value = "";
    CRM.openModal("assignWorkModal");
    setAssignType("lead");
    CRM.api.get("/employees/" + encodeURIComponent(employeeId)).then(function (e) {
      var nameEl = el("assignTargetName");
      if (nameEl) nameEl.textContent = e.name || "—";
      var av = el("assignAvatar");
      if (av) av.textContent = CRM.initials(e.name);
    }).catch(function (err) { showAssignError(err.message); });
    loadAssignOptions();
  }

  function loadAssignOptions() {
    if (assignState.loaded) { fillAssignSelects(); return; }
    Promise.all([
      CRM.api.get("/leads" + CRM.qs({ per_page: 200, sort: "created_at", dir: "desc" })),
      CRM.api.get("/projects" + CRM.qs({ per_page: 200, sort: "created_at", dir: "desc" }))
    ]).then(function (r) {
      assignState.leads = (r[0] && r[0].items) || [];
      assignState.projects = (r[1] && r[1].items) || [];
      assignState.loaded = true;
      fillAssignSelects();
    }).catch(function (err) { showAssignError(err.message); });
  }

  function fillAssignSelects() {
    var leads = assignState.leads.slice().sort(function (a, b) {
      return (a.assigned_to ? 1 : 0) - (b.assigned_to ? 1 : 0);
    });
    var leadSel = el("assignLead");
    if (leadSel) leadSel.innerHTML = leads.length ? leads.map(function (l) {
      return '<option value="' + CRM.escapeHtml(l.id) + '">' + CRM.escapeHtml(l.name) +
        (l.value ? " · " + CRM.money(l.value) : "") +
        (l.assigned_to ? " · assigned" : " · unassigned") + "</option>";
    }).join("") : '<option value="">No leads available</option>';

    var projOpts = assignState.projects.map(function (p) {
      return '<option value="' + CRM.escapeHtml(p.id) + '">' + CRM.escapeHtml(p.name) +
        " · " + CRM.escapeHtml(p.status || "") + "</option>";
    }).join("") || '<option value="">No projects available</option>';
    var taskProject = el("assignProject");
    if (taskProject) taskProject.innerHTML = projOpts;
    var manageProject = el("assignManageProject");
    if (manageProject) manageProject.innerHTML = projOpts;
  }

  function setAssignType(type) {
    assignState.type = type;
    Array.prototype.forEach.call(document.querySelectorAll("#assignType [data-assign-type]"), function (b) {
      b.classList.toggle("btn-primary", b.getAttribute("data-assign-type") === type);
    });
    var boxes = { lead: "assignLeadBox", task: "assignTaskBox", project: "assignProjectBox" };
    Object.keys(boxes).forEach(function (key) {
      var box = el(boxes[key]);
      if (box) box.classList.toggle("hidden", key !== type);
    });
    var btn = el("assignSubmit");
    if (btn) { btn.disabled = false; btn.textContent = "Assign"; }
    var err = el("assignError");
    if (err) { err.classList.add("hidden"); err.textContent = ""; }
  }

  function showAssignError(message) {
    var box = el("assignError");
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden");
  }

  function submitAssign() {
    var empId = assignState.employeeId;
    if (!empId) return;
    var btn = el("assignSubmit");
    var request;

    if (assignState.type === "lead") {
      var leadSel = el("assignLead");
      var leadId = leadSel && leadSel.value;
      if (!leadId) { showAssignError("Select a lead to assign."); return; }
      request = CRM.api.post("/leads/" + encodeURIComponent(leadId) + "/assign",
        { assigned_to: empId }).then(function () { return "Lead assigned"; });
    } else if (assignState.type === "task") {
      var projSel = el("assignProject");
      var titleEl = el("assignTaskTitle");
      var projectId = projSel && projSel.value;
      var title = titleEl ? titleEl.value.trim() : "";
      if (!projectId) { showAssignError("Select a project for this task."); return; }
      if (!title) { showAssignError("Enter a task title."); return; }
      request = CRM.api.post("/projects/" + encodeURIComponent(projectId) + "/tasks", {
        title: title,
        priority: (el("assignTaskPriority") || {}).value || "Medium",
        due_date: (el("assignTaskDue") || {}).value || "",
        assigned_to: empId
      }).then(function () { return "Task assigned"; });
    } else {
      var manageSel = el("assignManageProject");
      var manageId = manageSel && manageSel.value;
      if (!manageId) { showAssignError("Select a project to manage."); return; }
      request = CRM.api.put("/projects/" + encodeURIComponent(manageId),
        { manager_id: empId }).then(function () { return "Project manager set"; });
    }

    if (btn) { btn.disabled = true; btn.textContent = "Assigning…"; }
    request.then(function (message) {
      CRM.showToast(message, "success");
      CRM.closeModal("assignWorkModal");
      assignState.loaded = false;
      load();
      loadStats();
      if (state.detailId === empId) openDetail(empId);
    }).catch(function (err) {
      showAssignError(err.message);
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Assign"; }
    });
  }

  function workHtml(emp) {
    var leads = emp.assigned_leads || [];
    var tasks = emp.open_tasks || [];
    var projects = emp.managed_projects || [];
    if (!leads.length && !tasks.length && !projects.length) {
      return '<p class="muted small" style="margin:0">No work assigned yet. Use "Assign work" to give this employee a lead, task or project.</p>';
    }
    var out = "";
    if (leads.length) {
      out += '<div class="cell-sub" style="margin:10px 0 4px">Assigned leads (' + leads.length + ")</div>" +
        '<div class="mini-list">' + leads.map(function (l) {
          return '<div class="mini-item"><div class="mi-main">' + CRM.escapeHtml(l.name) +
            '<span class="mi-sub"> · ' + CRM.escapeHtml(l.status || "") +
            (l.next_followup ? " · next " + CRM.formatDate(l.next_followup) : "") + "</span></div>" +
            '<div class="mi-end"><button class="btn btn-sm btn-ghost" type="button" data-unassign-lead="' +
            CRM.escapeHtml(l.id) + '">Unassign</button></div></div>';
        }).join("") + "</div>";
    }
    if (tasks.length) {
      out += '<div class="cell-sub" style="margin:10px 0 4px">Open tasks (' + tasks.length + ")</div>" +
        '<div class="mini-list">' + tasks.map(function (t) {
          return '<div class="mini-item"><div class="mi-main">' + CRM.escapeHtml(t.title) +
            '<span class="mi-sub"> · ' + CRM.escapeHtml(t.project_name || "Project") +
            (t.due_date ? " · due " + CRM.formatDate(t.due_date) : "") + "</span></div>" +
            '<div class="mi-end"><button class="btn btn-sm btn-ghost" type="button" data-unassign-task="' +
            CRM.escapeHtml(t.id) + '">Remove</button></div></div>';
        }).join("") + "</div>";
    }
    if (projects.length) {
      out += '<div class="cell-sub" style="margin:10px 0 4px">Managing (' + projects.length + ")</div>" +
        '<div class="mini-list">' + projects.map(function (p) {
          return '<div class="mini-item"><div class="mi-main">' + CRM.escapeHtml(p.name) +
            '<span class="mi-sub"> · ' + CRM.escapeHtml(p.status || "") +
            (p.progress !== "" && p.progress !== null && p.progress !== undefined
              ? " · " + CRM.formatNumber(p.progress) + "%" : "") + "</span></div>" +
            '<div class="mi-end"><button class="btn btn-sm btn-ghost" type="button" data-unassign-project="' +
            CRM.escapeHtml(p.id) + '">Unassign</button></div></div>';
        }).join("") + "</div>";
    }
    return out;
  }

  function refreshWork(message) {
    CRM.showToast(message, "success");
    load();
    loadStats();
    if (state.detailId) openDetail(state.detailId);
  }

  function unassignLead(leadId) {
    CRM.api.post("/leads/" + encodeURIComponent(leadId) + "/assign", { assigned_to: "" })
      .then(function () { refreshWork("Lead unassigned"); })
      .catch(function (e) { CRM.showToast(e.message, "error"); });
  }

  function unassignTask(taskId) {
    CRM.api.put("/projects/tasks/" + encodeURIComponent(taskId), { assigned_to: "" })
      .then(function () { refreshWork("Task unassigned"); })
      .catch(function (e) { CRM.showToast(e.message, "error"); });
  }

  function unassignProject(projectId) {
    CRM.api.put("/projects/" + encodeURIComponent(projectId), { manager_id: "" })
      .then(function () { refreshWork("Project manager cleared"); })
      .catch(function (e) { CRM.showToast(e.message, "error"); });
  }
})();
