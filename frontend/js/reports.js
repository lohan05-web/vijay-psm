(function () {
  var user = CRM.requireAuth(["admin"]);
  if (!user) return;
  CRM.initShell("reports", "Reports").then(load);
  var state = { period: "monthly", summary: null, periodData: null, trend: null, activity: [], activityMeta: null, activityPage: 1 };
  function load() {
    document.querySelectorAll("#periodPills button").forEach(function (btn) {
      btn.onclick = function () {
        document.querySelectorAll("#periodPills button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.period = btn.dataset.period;
        loadPeriod();
      };
    });
    document.getElementById("exportBtn").onclick = exportTable;
    document.getElementById("refreshPowerbiBtn").onclick = refreshPowerbi;
    var clearBtn = document.getElementById("clearActivityBtn");
    if (clearBtn) clearBtn.onclick = clearActivity;
    loadSummary();
    loadPeriod();
    loadActivity();
    loadPowerbi();
  }
  function loadSummary() {
    CRM.api.get("/reports/summary").then(function (s) {
      state.summary = s;
      renderSource();
      renderStatus();
      renderTeamSnapshot();
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
    CRM.api.get("/reports/dashboard").then(function (d) {
      if (d.trend) { state.trend = d.trend; renderTrend(); }
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function loadPeriod() {
    CRM.api.get("/reports/" + state.period).then(function (p) {
      state.periodData = p;
      var sub = document.getElementById("reportsSubtitle");
      if (sub) sub.textContent = "Generated report overview";
      var rng = document.getElementById("periodRange");
      if (rng) rng.textContent = (p.range && p.range.start && p.range.end) ? (p.range.start + " to " + p.range.end) : "";
      renderPeriodStats();
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function renderPeriodStats() {
    var wrap = document.getElementById("periodStats");
    if (!wrap || !state.periodData) return;
    var pd = state.periodData;
    var items = [
      { label: "Leads created", val: pd.leads.created, ico: "&#10148;", accent: "" },
      { label: "Leads won", val: pd.leads.won, ico: "&#10003;", accent: "accent-success" },
      { label: "Revenue", val: CRM.formatMoney(pd.revenue), ico: "&#8377;", accent: "accent-success" },
      { label: "Pipeline value", val: CRM.formatMoney(pd.pipeline_value), ico: "&#9641;", accent: "accent-info" },
      { label: "Projects created", val: pd.projects_created, ico: "&#9635;", accent: "" },
      { label: "Calls", val: pd.calls, ico: "&#9743;", accent: "accent-warning" },
      { label: "Follow-ups", val: pd.followups, ico: "&#9200;", accent: "accent-warning" },
      { label: "Tasks done", val: pd.tasks_done, ico: "&#9636;", accent: "accent-success" }
    ];
    wrap.innerHTML = items.map(function (it) {
      return '<div class="stat-card ' + it.accent + '"><div class="st-head"><div class="st-label">' + CRM.escapeHtml(it.label) + '</div><div class="st-ico">' + it.ico + '</div></div><div class="st-value">' + CRM.escapeHtml(String(it.val)) + '</div></div>';
    }).join("");
  }
  function renderTrend() {
    var el = document.getElementById("trendChart");
    if (!el || !state.trend) return;
    var t = state.trend;
    var max = 0;
    for (var i=0;i<t.leads.length;i++) max = Math.max(max, t.leads[i], t.projects[i]);
    if (max === 0) max = 1;
    el.innerHTML = t.months.map(function (m, idx) {
      var hl = Math.round((t.leads[idx] / max) * 100);
      var hp = Math.round((t.projects[idx] / max) * 100);
      return '<div class="bar-col"><div class="bar-track"><div class="bar" style="height:' + hl + '%"></div></div><div class="bar-val">' + t.leads[idx] + '</div><div class="bar-track"><div class="bar alt" style="height:' + hp + '%"></div></div><div class="bar-val">' + t.projects[idx] + '</div><div class="bar-label">' + CRM.escapeHtml(m) + '</div></div>';
    }).join("");
  }
  function renderSource() {
    var el = document.getElementById("leadsBySource");
    if (!el || !state.summary || !state.summary.leads) return;
    var bs = state.summary.leads.by_source || {};
    var keys = Object.keys(bs);
    var max = keys.reduce(function (m,k){ return Math.max(m, bs[k]); }, 0) || 1;
    if (!keys.length) { el.innerHTML = CRM.emptyState("&#9641;", "No data", "", ""); return; }
    el.innerHTML = keys.map(function (k) {
      var w = Math.round((bs[k] / max) * 100);
      return '<div class="hbar-item"><div class="hb-top"><b>' + CRM.escapeHtml(k) + '</b><span>' + bs[k] + '</span></div><div class="hb-bar"><span style="width:' + w + '%"></span></div></div>';
    }).join("");
  }
  function renderStatus() {
    var el = document.getElementById("leadsByStatus");
    if (!el || !state.summary || !state.summary.leads) return;
    var bs = state.summary.leads.by_status || {};
    var keys = Object.keys(bs);
    var max = keys.reduce(function (m,k){ return Math.max(m, bs[k]); }, 0) || 1;
    if (!keys.length) { el.innerHTML = CRM.emptyState("&#9641;", "No data", "", ""); return; }
    var colors = ["c1","c2","c3","c4","c5","c6"];
    el.innerHTML = keys.map(function (k, i) {
      var w = Math.round((bs[k] / max) * 100);
      return '<div class="hbar-item ' + (colors[i % colors.length]) + '"><div class="hb-top"><b>' + CRM.escapeHtml(k) + '</b><span>' + bs[k] + '</span></div><div class="hb-bar"><span style="width:' + w + '%"></span></div></div>';
    }).join("");
  }
  function renderTeamSnapshot() {
    var el = document.getElementById("teamSnapshot");
    if (!el || !state.summary) return;
    var t = state.summary.tasks || {};
    var em = state.summary.employees || {};
    el.innerHTML = [
      { v: t.total || 0, l: "Tasks total" },
      { v: t.done || 0, l: "Tasks done" },
      { v: t.in_progress || 0, l: "In progress" },
      { v: em.total || 0, l: "Employees total" },
      { v: em.active || 0, l: "Active" }
    ].map(function (k) { return '<div class="kpi"><div class="kpi-val">' + k.v + '</div><div class="kpi-label">' + CRM.escapeHtml(k.l) + '</div></div>'; }).join("");
  }
  function loadActivity() {
    CRM.api.get("/reports/activity?page=" + state.activityPage).then(function (d) {
      state.activity = d.items || [];
      state.activityMeta = d.meta || null;
      renderActivity();
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function renderActivity() {
    var tbody = document.getElementById("activityTable");
    if (!tbody) return;
    if (!state.activity.length) {
      tbody.innerHTML = '<tr><td colspan="6">' + CRM.emptyState("&#9853;", "No activity", "", "") + '</td></tr>';
      var pag = document.getElementById("activityPagination");
      if (pag) pag.innerHTML = "";
      return;
    }
    tbody.innerHTML = state.activity.map(function (a) {
      return '<tr><td>' + CRM.escapeHtml(a.user_name || "—") + '</td><td>' + CRM.escapeHtml(a.action || "—") + '</td><td>' + CRM.escapeHtml(a.entity || "—") + '</td><td>' + CRM.escapeHtml(a.details || "—") + '</td><td>' + CRM.formatDate(a.created_at) + '</td><td class="td-right"><button class="btn btn-sm btn-danger" data-del="' + a.id + '">Delete</button></td></tr>';
    }).join("");
    tbody.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { deleteActivity(b.dataset.del); }; });
    var pag = document.getElementById("activityPagination");
    if (pag) {
      pag.innerHTML = CRM.paginationHtml(state.activityMeta, function (pn) { state.activityPage = pn; loadActivity(); });
      CRM.bindPagination(pag, function (pn) { state.activityPage = pn; loadActivity(); });
    }
  }
  function deleteActivity(id) {
    CRM.confirmAction({ title: "Delete activity", message: "This action cannot be undone.", confirmText: "Delete" }).then(function (ok) {
      if (!ok) return;
      CRM.api.del("/reports/activity/" + id).then(function () { CRM.showToast("Activity deleted", "success"); loadActivity(); }).catch(function (e) { CRM.showToast(e.message, "error"); });
    });
  }
  function clearActivity() {
    CRM.confirmAction({ title: "Delete all activity", message: "All activity logs will be permanently removed.", confirmText: "Delete all" }).then(function (ok) {
      if (!ok) return;
      CRM.api.del("/reports/activity").then(function () { CRM.showToast("All activity deleted", "success"); state.activityPage = 1; loadActivity(); }).catch(function (e) { CRM.showToast(e.message, "error"); });
    });
  }
  function exportTable() {
    var sel = document.getElementById("exportTable");
    if (!sel || !sel.value) { CRM.showToast("Select a table to export", "warning"); return; }
    var table = sel.value;
    var token = CRM.getToken();
    fetch("/api/reports/export/" + table, {
      method: "GET",
      headers: { "Authorization": "Bearer " + token }
    }).then(function (res) {
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = table + ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      CRM.showToast("Export started", "success");
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function refreshPowerbi() {
    CRM.api.post("/reports/powerbi/export").then(function (res) {
      var msg = "Datasets exported";
      try { if (res && res.length) msg = "Exported " + res.length + " datasets"; } catch (ex) {}
      CRM.showToast(msg, "success");
      loadPowerbi();
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
  function loadPowerbi() {
    var sel = document.getElementById("exportTable");
    CRM.api.get("/reports/export").then(function (menu) {
      if (sel) sel.innerHTML = '<option value="">Select table to export</option>' + (menu || []).map(function (m) { return '<option value="' + CRM.escapeHtml(m.table) + '">' + CRM.escapeHtml(m.table) + '</option>'; }).join("");
    }).catch(function () {});
    CRM.api.get("/reports/powerbi").then(function (p) {
      var card = document.getElementById("powerbiCard");
      if (!card) return;
      var html = '<div class="small muted mb-16">' + (p.generated_at ? "Generated: " + p.generated_at : "") + '</div>';
      if (p.reports && p.reports.length) {
        html += '<div class="stack">' + p.reports.map(function (r) {
          var rc = p.row_counts || {};
          return '<div class="mini-item"><div class="avatar-sm">&#9641;</div><div><div class="mi-main">' + CRM.escapeHtml(r.name) + '</div><div class="mi-sub">' + CRM.escapeHtml(r.file || "") + '</div></div><div class="mi-end">' + Object.keys(rc).slice(0, 4).map(function (k) { return '<span class="badge plain">' + CRM.escapeHtml(k) + ': ' + rc[k] + '</span>'; }).join(" ") + '</div></div>';
        }).join("") + '</div>';
      } else { html += '<div class="muted">No Power BI reports available</div>'; }
      card.innerHTML = html;
    }).catch(function (e) { CRM.showToast(e.message, "error"); });
  }
})();