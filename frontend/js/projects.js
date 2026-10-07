(function () {
  var user = CRM.requireAuth(["admin", "employee", "developer"]);
  if (!user) return;
  CRM.initShell("projects", "Projects").then(load);
  var state = {
    page: 1,
    search: "",
    status: "",
    priority: "",
    mine: false,
    meta: null,
    projects: [],
    companies: [],
    employees: [],
    developers: [],
    currentProject: null,
    currentProjectFull: null,
    tasks: [],
    updates: [],
    assignments: [],
    members: [],
    devOptions: []
  };
  var previewState = { ids: [], onConfirm: null };
  function load() {
    var actions = document.getElementById("projectsActions");
    if (actions && (CRM.effectiveRole(user) === "admin" || CRM.effectiveRole(user) === "employee")) {
      actions.innerHTML = '<button class="btn btn-primary" id="newProjectBtn">＋ New project</button>';
      var nb = document.getElementById("newProjectBtn");
      if (nb) nb.onclick = openNewProject;
    }
    if (CRM.effectiveRole(user) !== "admin") {
      var row = document.getElementById("myProjectsRow");
      if (row) row.style.display = "";
      var chk = document.getElementById("filterMine");
      if (chk) chk.onchange = function () { state.mine = chk.checked; state.page = 1; fetchProjects(); };
    }
    var fs = document.getElementById("filterSearch");
    var fstat = document.getElementById("filterStatus");
    var fpri = document.getElementById("filterPriority");
    if (fs) fs.oninput = CRM.debounce(function () { state.search = fs.value; state.page = 1; fetchProjects(); });
    if (fstat) fstat.onchange = function () { state.status = fstat.value; state.page = 1; fetchProjects(); };
    if (fpri) fpri.onchange = function () { state.priority = fpri.value; state.page = 1; fetchProjects(); };
    var saveBtn = document.getElementById("saveProjectBtn");
    if (saveBtn) saveBtn.onclick = saveProject;
    var projectForm = document.getElementById("projectForm");
    if (projectForm) projectForm.onsubmit = function (e) { e.preventDefault(); saveProject(); };
    var tabs = document.getElementById("projectTabs");
    if (tabs) tabs.onclick = function (e) {
      var t = e.target.closest(".tab");
      if (!t) return;
      var panels = document.querySelectorAll("#projectDetailModal .tab-panel");
      var tabsn = document.querySelectorAll("#projectTabs .tab");
      for (var i=0;i<tabsn.length;i++) tabsn[i].classList.remove("active");
      for (var j=0;j<panels.length;j++) panels[j].classList.remove("active");
      t.classList.add("active");
      var panel = document.querySelector('[data-panel="' + t.dataset.tab + '"]');
      if (panel) panel.classList.add("active");
    };
    var addTaskBtn = document.getElementById("addTaskBtn");
    if (addTaskBtn) addTaskBtn.onclick = function () { var f = document.getElementById("taskForm"); if (f) f.style.display = f.style.display === "none" ? "flex" : "none"; };
    var cancelTask = document.getElementById("cancelTaskForm");
    if (cancelTask) cancelTask.onclick = function () { var f = document.getElementById("taskForm"); if (f) { f.style.display = "none"; f.reset(); } };
    var taskForm = document.getElementById("taskForm");
    if (taskForm) taskForm.onsubmit = function (e) { e.preventDefault(); addTask(); };
    var updateForm = document.getElementById("updateForm");
    if (updateForm) updateForm.onsubmit = function (e) { e.preventDefault(); addUpdate(); };
    var assignForm = document.getElementById("assignForm");
    if (assignForm) assignForm.onsubmit = function (e) { e.preventDefault(); assignDev(); };
    var memberForm = document.getElementById("memberForm");
    if (memberForm) memberForm.onsubmit = function (e) { e.preventDefault(); addMember(); };
    var memberConfirm = document.getElementById("memberConfirmBtn");
    if (memberConfirm) memberConfirm.onclick = function () {
      var fn = previewState.onConfirm;
      CRM.closeModal("memberPreviewModal");
      previewState = { ids: [], onConfirm: null };
      if (fn) fn();
    };
    fetchLists().then(fetchProjects);
  }
  function fetchLists() {
    var proms = [
      CRM.api.get("/companies?per_page=200"),
      CRM.api.get("/employees?per_page=200"),
      CRM.api.get("/developers?per_page=200")
    ];
    return Promise.all(proms).then(function (res) {
      state.companies = res[0].items || res[0] || [];
      state.employees = res[1].items || res[1] || [];
      var devs = res[2].items || res[2] || [];
      state.developers = devs;
      fillSelect("projectCompany", state.companies, "name", "id", true);
      fillSelect("projectManager", state.employees, "name", "id", true);
      fillSelect("taskAssignee", state.employees, "name", "id", true);
      fillSelect("projectTeam", state.employees, "name", "id", false);
      fillSelect("memberEmployee", state.employees, "name", "id", true, "Select employee");
      var ad = document.getElementById("assignDev");
      if (ad) { ad.innerHTML = '<option value="">Select developer</option>' + devs.map(function (d) { return '<option value="' + d.id + '">' + CRM.escapeHtml(d.name) + '</option>'; }).join(""); }
      state.devOptions = devs;
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function fillSelect(id, arr, labelKey, valKey, includeEmpty, emptyLabel) {
    var el = document.getElementById(id);
    if (!el) return;
    var html = includeEmpty ? '<option value="">' + (emptyLabel || "None") + "</option>" : "";
    for (var i=0;i<arr.length;i++) {
      html += '<option value="' + arr[i][valKey] + '">' + CRM.escapeHtml(arr[i][labelKey] || "") + '</option>';
    }
    el.innerHTML = html;
  }
  function fetchProjects() {
    var params = { page: state.page, q: state.search, status: state.status, priority: state.priority };
    if (CRM.effectiveRole(user) !== "admin" && state.mine) params.mine = 1;
    var url = "/projects" + CRM.qs(params);
    CRM.api.get(url).then(function (data) {
      state.projects = data.items || [];
      state.meta = data.meta || null;
      renderProjects();
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function renderProjects() {
    var tbody = document.getElementById("projectsTable");
    if (!tbody) return;
    if (!state.projects.length) {
      tbody.innerHTML = '<tr><td colspan="9">' + CRM.emptyState("&#9635;", "No projects found", "Try adjusting your filters", "") + '</td></tr>';
      var pag = document.getElementById("projectsPagination");
      if (pag) pag.innerHTML = "";
      return;
    }
    tbody.innerHTML = state.projects.map(function (p) {
      var prog = p.progress === null || p.progress === undefined ? 0 : p.progress;
      var progCls = prog >= 100 ? "success" : "";
      var tl = (CRM.formatDate(p.start_date) + " – " + CRM.formatDate(p.end_date)).replace(" – —", "");
      return '<tr><td><div class="cell-main">' + CRM.escapeHtml(p.name || "") + '</div></td><td>' + CRM.escapeHtml(p.company_name || "—") + '</td><td>' + CRM.escapeHtml(p.manager_name || "—") + '</td><td><div class="progress ' + progCls + '"><span style="width:' + Math.min(100, prog) + '%"></span></div><div class="small muted">' + prog + '%</div></td><td>' + CRM.badge(p.status) + '</td><td>' + CRM.badge(p.priority) + '</td><td>' + CRM.money(p.budget) + '</td><td class="nowrap">' + tl + '</td><td class="td-right"><div class="actions"><button class="btn btn-sm btn-ghost" data-view="' + p.id + '">View</button>' + ((CRM.effectiveRole(user) === "admin" || CRM.effectiveRole(user) === "employee") ? '<button class="btn btn-sm btn-ghost" data-edit="' + p.id + '">Edit</button>' : "") + ((CRM.effectiveRole(user) === "admin") ? '<button class="btn btn-sm btn-danger" data-del="' + p.id + '">Delete</button>' : "") + '</div></td></tr>';
    }).join("");
    var pag = document.getElementById("projectsPagination");
    if (pag) pag.innerHTML = CRM.paginationHtml(state.meta, function (pn) { state.page = pn; fetchProjects(); });
    CRM.bindPagination(pag, function (pn) { state.page = pn; fetchProjects(); });
    tbody.querySelectorAll("[data-view]").forEach(function (b) { b.onclick = function () { openDetail(b.dataset.view); }; });
    tbody.querySelectorAll("[data-edit]").forEach(function (b) { b.onclick = function () { openEdit(b.dataset.edit); }; });
    tbody.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { deleteProject(b.dataset.del); }; });
  }
  function openNewProject() {
    state.currentProject = null;
    document.getElementById("projectId").value = "";
    document.getElementById("projectModalTitle").textContent = "New project";
    document.getElementById("projectForm").reset();
    document.getElementById("projectProgress").value = 0;
    document.getElementById("projectStatus").value = "Planning";
    document.getElementById("projectPriority").value = "Medium";
    CRM.openModal("projectModal");
  }
  function openEdit(id) {
    var p = state.projects.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    state.currentProject = p;
    document.getElementById("projectId").value = p.id || "";
    document.getElementById("projectModalTitle").textContent = "Edit project";
    document.getElementById("projectName").value = p.name || "";
    document.getElementById("projectCompany").value = p.company_id || "";
    document.getElementById("projectManager").value = p.manager_id || "";
    document.getElementById("projectStatus").value = p.status || "Planning";
    document.getElementById("projectPriority").value = p.priority || "Medium";
    document.getElementById("projectBudget").value = p.budget === null || p.budget === undefined ? "" : p.budget;
    document.getElementById("projectStart").value = (p.start_date || "").slice(0,10);
    document.getElementById("projectEnd").value = (p.end_date || "").slice(0,10);
    document.getElementById("projectProgress").value = p.progress === null || p.progress === undefined ? 0 : p.progress;
    document.getElementById("projectDesc").value = p.description || "";
    CRM.openModal("projectModal");
  }
  function saveProject() {
    var form = document.getElementById("projectForm");
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var payload = {
      name: document.getElementById("projectName").value.trim(),
      company_id: document.getElementById("projectCompany").value || null,
      manager_id: document.getElementById("projectManager").value || null,
      status: document.getElementById("projectStatus").value,
      priority: document.getElementById("projectPriority").value,
      budget: document.getElementById("projectBudget").value === "" ? null : parseFloat(document.getElementById("projectBudget").value),
      start_date: document.getElementById("projectStart").value || null,
      end_date: document.getElementById("projectEnd").value || null,
      progress: parseInt(document.getElementById("projectProgress").value) || 0,
      description: document.getElementById("projectDesc").value || ""
    };
    var id = document.getElementById("projectId").value;
    if (id) {
      CRM.api.put("/projects/" + id, payload).then(function () {
        CRM.closeModal("projectModal");
        CRM.showToast("Project saved", "success");
        fetchProjects();
      }).catch(function (e) { CRM.showToast(e.message, "error"); });
      return;
    }
    var teamSel = document.getElementById("projectTeam");
    var teamIds = teamSel ? Array.prototype.filter.call(teamSel.options, function (o) {
      return o.selected && o.value;
    }).map(function (o) { return o.value; }) : [];
    if (teamIds.length) {
      openMemberPreview(teamIds, "Create & assign", function () { commitNewProject(payload, teamIds); });
    } else {
      commitNewProject(payload, []);
    }
  }
  function commitNewProject(payload, teamIds) {
    CRM.api.post("/projects", payload).then(function (created) {
      var adds = (teamIds || []).map(function (eid) {
        return CRM.api.post("/projects/" + created.id + "/members", { employee_id: eid }).catch(function () {});
      });
      Promise.all(adds).then(function () {
        CRM.closeModal("projectModal");
        CRM.showToast(teamIds.length ? "Project created and team assigned." : "Project saved", "success");
        fetchProjects();
      });
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function openMemberPreview(ids, confirmLabel, onConfirm) {
    previewState = { ids: ids || [], onConfirm: onConfirm };
    var body = document.getElementById("memberPreviewBody");
    var btn = document.getElementById("memberConfirmBtn");
    if (btn) btn.textContent = confirmLabel || "Confirm & assign";
    if (body) body.innerHTML = '<div class="loading"><div><div class="spinner"></div>Loading employee details…</div></div>';
    CRM.openModal("memberPreviewModal");
    Promise.all((ids || []).map(function (id) { return CRM.api.get("/employees/" + id); }))
      .then(function (list) {
        if (body) body.innerHTML = list.map(previewHtml).join("");
      })
      .catch(function (e) {
        CRM.showToast(e.message, "error");
        if (body) body.innerHTML = '<div class="empty-state"><p>' + CRM.escapeHtml(e.message) + "</p></div>";
      });
  }
  function previewHtml(e) {
    function val(v) { return v === undefined || v === null || v === "" ? "—" : String(v); }
    function cell(label, value) {
      return '<div class="form-group"><label class="small muted">' + label + "</label>" +
        '<div class="strong">' + CRM.escapeHtml(val(value)) + "</div></div>";
    }
    var openTaskCount = Array.isArray(e.open_tasks) ? e.open_tasks.length : e.open_tasks;
    var cells = [
      cell("Email", e.email), cell("Phone", e.phone),
      cell("Role", e.role), cell("Designation", e.designation),
      cell("Department", e.department), cell("Joined", e.joined_date),
      cell("Assigned leads", e.lead_count), cell("Won leads", e.won_leads),
      cell("Projects managed", e.project_count), cell("Open tasks", openTaskCount),
      cell("Call logs", e.call_count), cell("Employee ID", e.id)
    ].join("");
    var leads = (e.assigned_leads || []).slice(0, 5).map(function (l) {
      return "<li>" + CRM.escapeHtml(l.name || "") + (l.company_name ? " · " + CRM.escapeHtml(l.company_name) : "") + "</li>";
    }).join("");
    var tasks = (Array.isArray(e.open_tasks) ? e.open_tasks : []).slice(0, 5).map(function (t) {
      return "<li>" + CRM.escapeHtml(t.title || "") + "</li>";
    }).join("");
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">' +
      '<div class="row between mb-16"><div class="strong">' + CRM.escapeHtml(e.name || "") + "</div>" +
      CRM.badge(e.status || "") + "</div>" +
      '<div class="form-grid">' + cells + "</div>" +
      (leads ? '<div style="margin-top:14px;"><div class="small muted mb-8">Assigned leads</div><ul style="margin:0;padding-left:18px;">' + leads + "</ul></div>" : "") +
      (tasks ? '<div style="margin-top:14px;"><div class="small muted mb-8">Open tasks</div><ul style="margin:0;padding-left:18px;">' + tasks + "</ul></div>" : "") +
      "</div>";
  }
  function deleteProject(id) {
    CRM.confirmAction({ title: "Delete project", message: "This action cannot be undone.", confirmText: "Delete" }).then(function (ok) {
      if (!ok) return;
      CRM.api.del("/projects/" + id).then(function () { CRM.showToast("Project deleted", "success"); fetchProjects(); }).catch(function (e) { CRM.showToast(e.message, "error"); });
    });
  }
  function openDetail(id) {
    CRM.api.get("/projects/" + id).then(function (data) {
      state.currentProjectFull = data;
      state.currentProject = data;
      document.getElementById("detailProjectName").textContent = data.name || "Project";
      var meta = [];
      if (data.company_name) meta.push("Company: " + data.company_name);
      if (data.manager_name) meta.push("Manager: " + data.manager_name);
      if (data.status) meta.push(data.status);
      if (data.priority) meta.push(data.priority);
      document.getElementById("detailProjectMeta").textContent = meta.join(" · ");
      state.tasks = data.tasks || [];
      state.updates = data.updates || [];
      state.assignments = data.assignments || [];
      state.members = data.members || [];
      renderTasks();
      renderUpdates();
      renderAssignments();
      renderMembers();
      CRM.openModal("projectDetailModal");
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function renderTasks() {
    var tbody = document.getElementById("tasksTable");
    if (!tbody) return;
    if (!state.tasks.length) { tbody.innerHTML = '<tr><td colspan="6">' + CRM.emptyState("&#9636;", "No tasks yet", "Add a task to get started", "") + '</td></tr>'; return; }
    tbody.innerHTML = state.tasks.map(function (t) {
      var statusSel = '<select class="select" data-task-status="' + t.id + '">' + ["To Do","In Progress","Review","Done","Blocked"].map(function (s) { return '<option value="' + s + '"' + (s === t.status ? ' selected' : '') + '>' + s + '</option>'; }).join("") + '</select>';
      var markDone = t.status !== "Done" ? '<button class="btn btn-sm btn-success" data-task-done="' + t.id + '">Mark done</button>' : "";
      var del = (CRM.effectiveRole(user) === "admin" || CRM.effectiveRole(user) === "employee") ? '<button class="btn btn-sm btn-danger" data-task-del="' + t.id + '">Delete</button>' : "";
      return '<tr><td><div class="cell-main">' + CRM.escapeHtml(t.title || "") + '</div></td><td>' + CRM.escapeHtml(t.assigned_to_name || "—") + '</td><td>' + statusSel + '</td><td>' + CRM.badge(t.priority) + '</td><td>' + CRM.formatDate(t.due_date) + '</td><td class="td-right"><div class="actions">' + markDone + del + '</div></td></tr>';
    }).join("");
    tbody.querySelectorAll("[data-task-status]").forEach(function (sel) {
      sel.onchange = function () {
        var val = sel.value;
        var tid = sel.dataset.taskStatus;
        CRM.api.put("/projects/tasks/" + tid, { status: val }).then(function () { refreshDetail(); }).catch(function (e) { CRM.showToast(e.message, "error"); refreshDetail(); });
      };
    });
    tbody.querySelectorAll("[data-task-done]").forEach(function (b) { b.onclick = function () { CRM.api.put("/projects/tasks/" + b.dataset.taskDone, { status: "Done" }).then(refreshDetail).catch(function (e) { CRM.showToast(e.message, "error"); }); }; });
    tbody.querySelectorAll("[data-task-del]").forEach(function (b) { b.onclick = function () { CRM.api.del("/projects/tasks/" + b.dataset.taskDel).then(refreshDetail).catch(function (e) { CRM.showToast(e.message, "error"); }); }; });
  }
  function addTask() {
    if (!state.currentProjectFull) return;
    var payload = {
      title: document.getElementById("taskTitle").value.trim(),
      assigned_to: document.getElementById("taskAssignee").value || null,
      priority: document.getElementById("taskPriority").value,
      due_date: document.getElementById("taskDue").value || null
    };
    CRM.api.post("/projects/" + state.currentProjectFull.id + "/tasks", payload).then(function () {
      var f = document.getElementById("taskForm"); if (f) { f.style.display = "none"; f.reset(); }
      refreshDetail(); CRM.showToast("Task added", "success");
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function renderUpdates() {
    var feed = document.getElementById("updatesFeed");
    if (!feed) return;
    if (!state.updates.length) { feed.innerHTML = CRM.emptyState("&#9853;", "No updates", "Be the first to post an update", ""); return; }
    feed.innerHTML = state.updates.map(function (u) {
      return '<div class="feed-item"><span class="feed-ico">&#9853;</span><div><div class="fi-title">' + CRM.escapeHtml(u.update_type || "General") + (u.progress === null || u.progress === undefined ? "" : " · " + u.progress + "%") + '</div><div class="fi-sub">' + CRM.escapeHtml(u.message || "") + '</div><div class="small muted">' + CRM.escapeHtml(u.author_name || "") + ' · ' + CRM.formatDate(u.created_at) + '</div></div></div>';
    }).join("");
  }
  function addUpdate() {
    if (!state.currentProjectFull) return;
    var payload = {
      update_type: document.getElementById("updateType").value,
      message: document.getElementById("updateMessage").value.trim(),
      progress: document.getElementById("updateProgress").value === "" ? null : parseInt(document.getElementById("updateProgress").value)
    };
    CRM.api.post("/projects/" + state.currentProjectFull.id + "/updates", payload).then(function () {
      document.getElementById("updateForm").reset();
      refreshDetail(); CRM.showToast("Update posted", "success");
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function renderAssignments() {
    var tbody = document.getElementById("assignmentsTable");
    if (!tbody) return;
    if (!state.assignments.length) { tbody.innerHTML = '<tr><td colspan="6">' + CRM.emptyState("&#9874;", "No developers assigned", "Assign a developer to this project", "") + '</td></tr>'; return; }
    tbody.innerHTML = state.assignments.map(function (a) {
      var rel = (a.status !== "Released" && (CRM.effectiveRole(user) === "admin" || CRM.effectiveRole(user) === "employee")) ? '<button class="btn btn-sm btn-ghost" data-rel="' + a.id + '">Release</button>' : "";
      var del = (CRM.effectiveRole(user) === "admin" || CRM.effectiveRole(user) === "employee") ? '<button class="btn btn-sm btn-danger" data-adel="' + a.id + '">Delete</button>' : "";
      return '<tr><td><div class="cell-main">' + CRM.escapeHtml(a.developer_name || "") + '</div></td><td>' + CRM.escapeHtml(a.role || "—") + '</td><td>' + (a.allocated_hours === null || a.allocated_hours === undefined ? "—" : a.allocated_hours) + '</td><td>' + CRM.formatDate(a.assigned_at) + '</td><td>' + CRM.badge(a.status || "Active") + '</td><td class="td-right"><div class="actions">' + rel + del + '</div></td></tr>';
    }).join("");
    tbody.querySelectorAll("[data-rel]").forEach(function (b) { b.onclick = function () { CRM.api.put("/projects/assignments/" + b.dataset.rel + "/release").then(refreshDetail).catch(function (e) { CRM.showToast(e.message, "error"); }); }; });
    tbody.querySelectorAll("[data-adel]").forEach(function (b) { b.onclick = function () { CRM.api.del("/projects/assignments/" + b.dataset.adel).then(refreshDetail).catch(function (e) { CRM.showToast(e.message, "error"); }); }; });
  }
  function assignDev() {
    if (!state.currentProjectFull) return;
    var payload = {
      developer_id: document.getElementById("assignDev").value,
      role: document.getElementById("assignRole").value || null,
      allocated_hours: document.getElementById("assignHours").value === "" ? null : parseFloat(document.getElementById("assignHours").value)
    };
    CRM.api.post("/projects/" + state.currentProjectFull.id + "/assignments", payload).then(function () {
      document.getElementById("assignForm").reset();
      refreshDetail(); CRM.showToast("Developer assigned", "success");
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function refreshDetail() {
    if (state.currentProjectFull && state.currentProjectFull.id) {
      openDetail(state.currentProjectFull.id);
    }
  }
  function addMember() {
    if (!state.currentProjectFull) return;
    var sel = document.getElementById("memberEmployee");
    var empId = sel ? sel.value : "";
    if (!empId) { CRM.showToast("Select an employee first.", "error"); return; }
    openMemberPreview([empId], "Add to team", function () {
      CRM.api.post("/projects/" + state.currentProjectFull.id + "/members", { employee_id: empId })
        .then(function () { refreshDetail(); CRM.showToast("Employee added to project", "success"); })
        .catch(function (e) { CRM.showToast(e.message, "error"); });
    });
  }
  function renderMembers() {
    var tbody = document.getElementById("membersTable");
    if (!tbody) return;
    if (!state.members.length) {
      tbody.innerHTML = '<tr><td colspan="4">' + CRM.emptyState("&#9673;", "No team members", "Add employees to this project", "") + "</td></tr>";
      return;
    }
    var canManage = CRM.effectiveRole(user) === "admin" || CRM.effectiveRole(user) === "employee";
    tbody.innerHTML = state.members.map(function (m) {
      var rel = (m.status !== "Released" && canManage) ? '<button class="btn btn-sm btn-ghost" data-mrel="' + m.id + '">Release</button>' : "";
      var del = canManage ? '<button class="btn btn-sm btn-danger" data-mdel="' + m.id + '">Remove</button>' : "";
      return "<tr><td><div class=\"cell-main\">" + CRM.escapeHtml(m.employee_name || "") + "</div></td>" +
        "<td>" + CRM.formatDate(m.assigned_at) + "</td>" +
        "<td>" + CRM.badge(m.status || "Active") + "</td>" +
        '<td class="td-right"><div class="actions">' + rel + del + "</div></td></tr>";
    }).join("");
    tbody.querySelectorAll("[data-mrel]").forEach(function (b) { b.onclick = function () { CRM.api.put("/projects/members/" + b.dataset.mrel + "/release").then(refreshDetail).catch(function (e) { CRM.showToast(e.message, "error"); }); }; });
    tbody.querySelectorAll("[data-mdel]").forEach(function (b) { b.onclick = function () { CRM.api.del("/projects/members/" + b.dataset.mdel).then(refreshDetail).catch(function (e) { CRM.showToast(e.message, "error"); }); }; });
  }
})();