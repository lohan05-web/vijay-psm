(function () {
  var user = CRM.requireAuth(["admin", "employee", "developer"]);
  if (!user) return;
  var page = document.body.getAttribute("data-page");
  CRM.initShell(page, page === "leads" ? "Leads" : page === "companies" ? "Companies" : "Follow-ups").then(bootstrap);

  function bootstrap() {
    if (page === "leads") initLeads();
    else if (page === "companies") initCompanies();
    else initFollowups();
  }

  function byId(id) { return document.getElementById(id); }

  function esc(value) { return CRM.escapeHtml(value); }

  function loadingHtml() {
    return '<div class="loading"><div><div class="spinner"></div>Loading…</div></div>';
  }

  function emptyRow(colspan, icon, title, subtitle, action) {
    return '<tr><td colspan="' + colspan + '">' +
      CRM.emptyState(icon, title, subtitle, action || "") + "</td></tr>";
  }

  function loadingRow(colspan) {
    return '<tr><td colspan="' + colspan + '">' + loadingHtml() + "</td></tr>";
  }

  function toastError(error) {
    CRM.showToast(error && error.message ? error.message : String(error), "error");
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  function fieldVal(id) {
    var el = byId(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setVal(id, value) {
    var el = byId(id);
    if (el) el.value = value === null || value === undefined ? "" : value;
  }

  function fillSelect(el, items, selected, placeholder) {
    if (!el) return;
    var html = '<option value="">' + esc(placeholder) + "</option>";
    (items || []).forEach(function (it) {
      html += '<option value="' + esc(it.value) + '">' + esc(it.label) + "</option>";
    });
    el.innerHTML = html;
    if (selected) el.value = selected;
  }

  function infoCell(label, value) {
    return '<div class="form-group"><label>' + esc(label) + "</label><div>" + value + "</div></div>";
  }

  function bindFilters(map) {
    Object.keys(map).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("change", function () { map[id](el); });
    });
  }

  function openImportModal() {
    var form = byId("importForm");
    if (form) form.reset();
    var sel = byId("importEmployee");
    if (sel) {
      CRM.api.get("/employees" + CRM.qs({ per_page: 200, sort: "name", dir: "asc" }))
        .then(function (data) {
          fillSelect(sel, (data.items || []).map(function (emp) {
            return { value: emp.id, label: emp.name + (emp.role ? " · " + emp.role : "") };
          }), "", "Select employee");
        })
        .catch(toastError);
    }
    var modal = byId("importModal");
    if (modal) modal.classList.add("open");
  }

  function initLeads() {
    var tbody = byId("leadRows");
    var pag = byId("pagination");
    if (!tbody) return;

    var isAdmin = CRM.effectiveRole(user) === "admin";
    var COLS = isAdmin ? 9 : 8;
    if (!isAdmin) {
      var table = tbody.closest("table");
      if (table) {
        Array.prototype.forEach.call(table.querySelectorAll("thead th"), function (th) {
          if (th.textContent.trim() === "Assigned to") th.style.display = "none";
        });
      }
      var assignedGroup = byId("leadAssigned");
      if (assignedGroup && assignedGroup.closest(".form-group")) {
        assignedGroup.closest(".form-group").style.display = "none";
      }
    }

    var state = { q: "", status: "", source: "", priority: "", page: 1, per_page: 15, editId: "", currentId: "" };
    var lookupsLoaded = false;

    var search = byId("leadSearch");
    if (search) {
      search.addEventListener("input", CRM.debounce(function () {
        state.q = search.value.trim();
        state.page = 1;
        load();
      }));
    }

    bindFilters({
      filterStatus: function (el) { state.status = el.value; state.page = 1; load(); },
      filterSource: function (el) { state.source = el.value; state.page = 1; load(); },
      filterPriority: function (el) { state.priority = el.value; state.page = 1; load(); }
    });

    var clearBtn = byId("btnClearFilters");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.q = ""; state.status = ""; state.source = ""; state.priority = ""; state.page = 1;
        setVal("leadSearch", "");
        setVal("filterStatus", "");
        setVal("filterSource", "");
        setVal("filterPriority", "");
        load();
      });
    }

    var newBtn = byId("btnNewLead");
    if (newBtn) newBtn.addEventListener("click", function () { openLeadModal(""); });

    if (isAdmin) {
      var importBtn = byId("btnImportLeads");
      if (importBtn) {
        importBtn.style.display = "";
        importBtn.addEventListener("click", openImportModal);
      }
      var importForm = byId("importForm");
      if (importForm) importForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var fileInput = byId("importFile");
        if (!fileInput || !fileInput.files || !fileInput.files.length) {
          CRM.showToast("Choose a CSV or Excel file.", "error");
          return;
        }
        var employeeId = fieldVal("importEmployee");
        if (!employeeId) {
          CRM.showToast("Select the employee to assign the leads to.", "error");
          return;
        }
        var fd = new FormData();
        fd.append("file", fileInput.files[0]);
        fd.append("assigned_to", employeeId);
        var btn = byId("importSubmit");
        if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }
        CRM.api.post("/leads/import", fd).then(function (data) {
          var msg = "Imported " + data.imported + " lead" + (data.imported === 1 ? "" : "s");
          if (data.failed) {
            msg += ", skipped " + data.failed + " row" + (data.failed === 1 ? "" : "s");
          }
          CRM.showToast(msg + ".", "success");
          var modal = byId("importModal");
          if (modal) modal.classList.remove("open");
          importForm.reset();
          state.page = 1;
          load();
        }).catch(toastError).then(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Import leads"; }
        });
      });
    }

    if (pag) CRM.bindPagination(pag, function (num) { state.page = num; load(); });

    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "view") openDetail(id);
      else if (act === "edit") openLeadModal(id);
      else if (act === "new") openLeadModal("");
      else if (act === "delete") removeLead(id);
    });

    var tabs = byId("leadDetailTabs");
    if (tabs) {
      tabs.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest ? e.target.closest(".tab") : null;
        if (!btn) return;
        var name = btn.getAttribute("data-tab");
        Array.prototype.forEach.call(tabs.querySelectorAll(".tab"), function (t) {
          t.classList.toggle("active", t === btn);
        });
        Array.prototype.forEach.call(document.querySelectorAll("#leadDetailModal .tab-panel"), function (panel) {
          panel.classList.toggle("active", panel.getAttribute("data-panel") === name);
        });
      });
    }

    var detailEdit = byId("btnDetailEdit");
    if (detailEdit) {
      detailEdit.addEventListener("click", function () {
        var id = state.currentId;
        CRM.closeModal("leadDetailModal");
        if (id) openLeadModal(id);
      });
    }

    var qfForm = byId("quickFollowupForm");
    if (qfForm) {
      qfForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!state.currentId) return;
        var body = { type: fieldVal("qfType"), notes: fieldVal("qfNotes"), due_date: fieldVal("qfDue") };
        if (!body.notes && !body.due_date) {
          CRM.showToast("Notes or a due date is required.", "error");
          return;
        }
        CRM.api.post("/leads/" + state.currentId + "/followups", body).then(function () {
          CRM.showToast("Follow-up added.", "success");
          qfForm.reset();
          refreshDetail();
          load();
        }).catch(toastError);
      });
    }

    var qcForm = byId("quickCallForm");
    if (qcForm) {
      qcForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!state.currentId) return;
        var body = {
          direction: fieldVal("qcDirection"),
          duration: fieldVal("qcDuration"),
          summary: fieldVal("qcSummary"),
          outcome: fieldVal("qcOutcome")
        };
        if (!body.summary) {
          CRM.showToast("A short summary is required.", "error");
          return;
        }
        CRM.api.post("/leads/" + state.currentId + "/calls", body).then(function () {
          CRM.showToast("Call logged.", "success");
          qcForm.reset();
          refreshDetail();
        }).catch(toastError);
      });
    }

    var leadForm = byId("leadForm");
    if (leadForm) {
      leadForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!fieldVal("leadName")) {
          CRM.showToast("Lead name is required.", "error");
          return;
        }
        var body = {
          name: fieldVal("leadName"),
          email: fieldVal("leadEmail"),
          phone: fieldVal("leadPhone"),
          company_id: fieldVal("leadCompany"),
          source: fieldVal("leadSource"),
          status: fieldVal("leadStatus"),
          priority: fieldVal("leadPriority"),
          assigned_to: fieldVal("leadAssigned"),
          value: fieldVal("leadValue"),
          service: fieldVal("leadService"),
          next_followup: fieldVal("leadNextFollowup"),
          description: fieldVal("leadDescription")
        };
        var saveBtn = byId("leadSaveBtn");
        if (saveBtn) saveBtn.disabled = true;
        var editing = state.editId;
        var req = editing ? CRM.api.put("/leads/" + editing, body) : CRM.api.post("/leads", body);
        req.then(function () {
          CRM.closeModal("leadModal");
          CRM.showToast(editing ? "Lead updated." : "Lead created.", "success");
          state.editId = "";
          load();
          if (state.currentId) refreshDetail();
        }).catch(toastError).then(function () {
          if (saveBtn) saveBtn.disabled = false;
        });
      });
    }

    function loadLookups() {
      if (lookupsLoaded) return lookupsLoaded;
      var companies = CRM.api.get("/companies" + CRM.qs({ per_page: 200 })).then(function (data) {
        fillSelect(byId("leadCompany"), (data.items || []).map(function (c) {
          return { value: c.id, label: c.name };
        }), "", "No company");
      }).catch(function (e) { toastError(e); });
      var employees = CRM.api.get("/employees" + CRM.qs({ per_page: 200 })).then(function (data) {
        fillSelect(byId("leadAssigned"), (data.items || []).map(function (emp) {
          return { value: emp.id, label: emp.name + (emp.role ? " · " + emp.role : "") };
        }), "", "Unassigned");
      }).catch(function () {
        fillSelect(byId("leadAssigned"), [], "", "Unassigned");
      });
      lookupsLoaded = Promise.all([companies, employees]);
      return lookupsLoaded;
    }

    function rowHtml(item) {
      var buttons = '<div class="actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="view" data-id="' + esc(item.id) + '">View</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit" data-id="' + esc(item.id) + '">Edit</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="delete" data-id="' + esc(item.id) + '">Delete</button>' +
        "</div>";
      return "<tr>" +
        '<td><div class="cell-with-avatar"><span class="avatar-sm">' + esc(CRM.initials(item.name)) + "</span><div>" +
        '<div class="cell-main">' + esc(item.name) + "</div>" +
        '<div class="cell-sub">' + esc(item.email || "—") + "</div></div></div></td>" +
        "<td>" + esc(item.company_name || "—") + "</td>" +
        '<td class="muted">' + esc(item.source || "—") + "</td>" +
        "<td>" + CRM.money(item.value) + "</td>" +
        "<td>" + CRM.badge(item.status) + "</td>" +
        "<td>" + CRM.badge(item.priority) + "</td>" +
        (isAdmin ? "<td>" + esc(item.assigned_to_name || "Unassigned") + "</td>" : "") +
        "<td>" + (item.next_followup ? CRM.formatDate(item.next_followup) : "—") + "</td>" +
        "<td>" + buttons + "</td>" +
        "</tr>";
    }

    function load() {
      tbody.innerHTML = loadingRow(COLS);
      var params = {
        q: state.q, status: state.status, source: state.source, priority: state.priority,
        page: state.page, per_page: state.per_page
      };
      CRM.api.get("/leads" + CRM.qs(params)).then(function (data) {
        var items = data.items || [];
        var filtered = state.q || state.status || state.source || state.priority;
        if (!items.length) {
          tbody.innerHTML = emptyRow(COLS, "&#10148;", "No leads found",
            filtered ? "No leads match the current filters." : "Get started by creating your first lead.",
            '<button class="btn btn-primary btn-sm" type="button" data-act="new">&#65291; New lead</button>');
        } else {
          tbody.innerHTML = items.map(rowHtml).join("");
        }
        if (pag) pag.innerHTML = CRM.paginationHtml(data.meta);
      }).catch(function (e) {
        tbody.innerHTML = emptyRow(COLS, "&#9888;", "Could not load leads", e.message);
        toastError(e);
      });
    }

    function openLeadModal(id) {
      var form = byId("leadForm");
      if (!form) return;
      loadLookups();
      form.reset();
      state.editId = id || "";
      var title = byId("leadModalTitle");
      if (title) title.textContent = id ? "Edit lead" : "New lead";
      if (id) {
        var requested = id;
        CRM.api.get("/leads/" + id).then(function (lead) {
          return loadLookups().then(function () {
            if (state.editId !== requested) return;
            setVal("leadName", lead.name);
            setVal("leadEmail", lead.email);
            setVal("leadPhone", lead.phone);
            setVal("leadCompany", lead.company_id);
            setVal("leadSource", lead.source);
            setVal("leadStatus", lead.status);
            setVal("leadPriority", lead.priority);
            setVal("leadAssigned", lead.assigned_to);
            setVal("leadValue", lead.value);
            setVal("leadService", lead.service);
            setVal("leadNextFollowup", lead.next_followup ? String(lead.next_followup).slice(0, 10) : "");
            setVal("leadDescription", lead.description);
          });
        }).catch(toastError);
      } else {
        setVal("leadStatus", "New");
        setVal("leadPriority", "Medium");
        setVal("leadSource", "");
        setVal("leadCompany", "");
        setVal("leadAssigned", "");
      }
      CRM.openModal("leadModal");
    }

    function removeLead(id) {
      CRM.confirmAction({
        title: "Delete lead?",
        message: "The lead and its follow-ups will be permanently removed.",
        confirmText: "Delete"
      }).then(function (yes) {
        if (!yes) return;
        CRM.api.del("/leads/" + id).then(function () {
          CRM.showToast("Lead deleted.", "success");
          if (state.currentId === id) {
            state.currentId = "";
            CRM.closeModal("leadDetailModal");
          }
          load();
        }).catch(toastError);
      });
    }

    function openDetail(id) {
      if (!id) return;
      state.currentId = id;
      var info = byId("leadDetailInfo");
      if (info) info.innerHTML = loadingHtml();
      CRM.openModal("leadDetailModal");
      CRM.api.get("/leads/" + id).then(renderDetail).catch(toastError);
    }

    function refreshDetail() {
      if (!state.currentId) return;
      CRM.api.get("/leads/" + state.currentId).then(renderDetail).catch(toastError);
    }

    function renderDetail(lead) {
      var title = byId("leadDetailTitle");
      if (title) title.textContent = lead.name || "Lead details";
      var info = byId("leadDetailInfo");
      if (info) {
        info.innerHTML = '<div class="form-grid">' +
          infoCell("Email", lead.email ? '<a href="mailto:' + esc(lead.email) + '">' + esc(lead.email) + "</a>" : "—") +
          infoCell("Phone", esc(lead.phone || "—")) +
          infoCell("Company", esc(lead.company_name || "—")) +
          infoCell("Source", esc(lead.source || "—")) +
          infoCell("Status", CRM.badge(lead.status)) +
          infoCell("Priority", CRM.badge(lead.priority)) +
          infoCell("Assigned to", esc(lead.assigned_to_name || "Unassigned")) +
          infoCell("Value", CRM.money(lead.value)) +
          infoCell("Service", esc(lead.service || "—")) +
          infoCell("Next follow-up", lead.next_followup ? CRM.formatDate(lead.next_followup) : "—") +
          infoCell("Last contact", lead.last_contact ? CRM.formatDate(lead.last_contact) : "—") +
          infoCell("Created", CRM.formatDate(lead.created_at)) +
          '<div class="form-group span-2"><label>Description</label><div>' +
          esc(lead.description || "—") + "</div></div>" +
          "</div>";
      }

      var fuList = byId("leadFollowupList");
      var followups = lead.followups || [];
      if (fuList) {
        if (!followups.length) {
          fuList.innerHTML = CRM.emptyState("&#9200;", "No follow-ups yet", "Add the first touchpoint above.");
        } else {
          fuList.innerHTML = '<div class="mini-list">' + followups.map(function (f) {
            var overdue = f.status === "Pending" && f.due_date && String(f.due_date).slice(0, 10) < todayStr();
            return '<div class="mini-item"><div><div class="mi-main">' +
              esc(f.notes || f.type + " follow-up") + "</div>" +
              '<div class="mi-sub">' + esc(f.type) + " · Due " + esc(CRM.formatDate(f.due_date)) +
              (overdue ? ' · <span class="badge badge-danger">Overdue</span>' : "") + "</div></div>" +
              '<div class="mi-end">' + CRM.badge(f.status) + "</div></div>";
          }).join("") + "</div>";
        }
      }

      var callList = byId("leadCallList");
      var calls = lead.call_logs || [];
      if (callList) {
        if (!calls.length) {
          callList.innerHTML = CRM.emptyState("&#9742;", "No calls logged", "Log the first call above.");
        } else {
          callList.innerHTML = '<div class="mini-list">' + calls.map(function (c) {
            return '<div class="mini-item"><div><div class="mi-main">' +
              esc(c.summary || "Call logged") + "</div>" +
              '<div class="mi-sub">' + esc(c.direction) + " · " + esc(c.duration || 0) +
              "s · " + esc(CRM.formatDate(c.called_at)) + "</div></div>" +
              '<div class="mi-end">' + CRM.badge(c.outcome) + "</div></div>";
          }).join("") + "</div>";
        }
      }
    }

    load();
  }

  function initCompanies() {
    var tbody = byId("companyRows");
    var pag = byId("pagination");
    if (!tbody) return;

    var isAdmin = CRM.effectiveRole(user) === "admin";

    var state = { q: "", status: "", page: 1, per_page: 15, editId: "", currentId: "" };

    var search = byId("companySearch");
    if (search) {
      search.addEventListener("input", CRM.debounce(function () {
        state.q = search.value.trim();
        state.page = 1;
        load();
      }));
    }

    var statusSel = byId("filterCompanyStatus");
    if (statusSel) {
      statusSel.addEventListener("change", function () {
        state.status = statusSel.value;
        state.page = 1;
        load();
      });
    }

    var clearBtn = byId("btnCompanyClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.q = ""; state.status = ""; state.page = 1;
        setVal("companySearch", "");
        setVal("filterCompanyStatus", "");
        load();
      });
    }

    var newBtn = byId("btnNewCompany");
    if (newBtn) newBtn.addEventListener("click", function () { openCompanyModal(""); });

    if (pag) CRM.bindPagination(pag, function (num) { state.page = num; load(); });

    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "view") openCompanyDetail(id);
      else if (act === "edit") openCompanyModal(id);
      else if (act === "new") openCompanyModal("");
      else if (act === "delete") removeCompany(id);
    });

    var detailEdit = byId("btnCompanyDetailEdit");
    if (detailEdit) {
      detailEdit.addEventListener("click", function () {
        var id = state.currentId;
        CRM.closeModal("companyDetailModal");
        if (id) openCompanyModal(id);
      });
    }

    var companyForm = byId("companyForm");
    if (companyForm) {
      companyForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!fieldVal("companyName")) {
          CRM.showToast("Company name is required.", "error");
          return;
        }
        var body = {
          name: fieldVal("companyName"),
          industry: fieldVal("companyIndustry"),
          website: fieldVal("companyWebsite"),
          email: fieldVal("companyEmail"),
          phone: fieldVal("companyPhone"),
          address: fieldVal("companyAddress"),
          city: fieldVal("companyCity"),
          country: fieldVal("companyCountry"),
          status: fieldVal("companyStatus"),
          notes: fieldVal("companyNotes")
        };
        var saveBtn = byId("companySaveBtn");
        if (saveBtn) saveBtn.disabled = true;
        var editing = state.editId;
        var req = editing ? CRM.api.put("/companies/" + editing, body) : CRM.api.post("/companies", body);
        req.then(function () {
          CRM.closeModal("companyModal");
          CRM.showToast(editing ? "Company updated." : "Company created.", "success");
          state.editId = "";
          load();
        }).catch(toastError).then(function () {
          if (saveBtn) saveBtn.disabled = false;
        });
      });
    }

    function rowHtml(item) {
      var buttons = '<div class="actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="view" data-id="' + esc(item.id) + '">View</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit" data-id="' + esc(item.id) + '">Edit</button>' +
        (isAdmin ? '<button class="btn btn-ghost btn-sm" type="button" data-act="delete" data-id="' + esc(item.id) + '">Delete</button>' : "") +
        "</div>";
      var location = [item.city, item.country].filter(Boolean).join(", ");
      return "<tr>" +
        '<td><div class="cell-main">' + esc(item.name) + "</div>" +
        '<div class="cell-sub">' + esc(item.website || "—") + "</div></td>" +
        "<td>" + esc(item.industry || "—") + "</td>" +
        "<td><div>" + esc(item.email || "—") + "</div>" +
        '<div class="cell-sub">' + esc(item.phone || "") + "</div></td>" +
        "<td>" + esc(location || "—") + "</td>" +
        "<td>" + CRM.badge(item.status) + "</td>" +
        "<td>" + CRM.formatNumber(item.lead_count || 0) + "</td>" +
        "<td>" + buttons + "</td>" +
        "</tr>";
    }

    function load() {
      tbody.innerHTML = loadingRow(7);
      CRM.api.get("/companies" + CRM.qs({
        q: state.q, status: state.status, page: state.page, per_page: state.per_page
      })).then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          tbody.innerHTML = emptyRow(7, "&#9673;", "No companies found",
            state.q || state.status ? "No companies match the current filters." : "Add your first company to group leads.",
            '<button class="btn btn-primary btn-sm" type="button" data-act="new">&#65291; New company</button>');
        } else {
          tbody.innerHTML = items.map(rowHtml).join("");
        }
        if (pag) pag.innerHTML = CRM.paginationHtml(data.meta);
      }).catch(function (e) {
        tbody.innerHTML = emptyRow(7, "&#9888;", "Could not load companies", e.message);
        toastError(e);
      });
    }

    function openCompanyModal(id) {
      var form = byId("companyForm");
      if (!form) return;
      form.reset();
      state.editId = id || "";
      var title = byId("companyModalTitle");
      if (title) title.textContent = id ? "Edit company" : "New company";
      if (id) {
        var requested = id;
        CRM.api.get("/companies/" + id).then(function (company) {
          if (state.editId !== requested) return;
          setVal("companyName", company.name);
          setVal("companyIndustry", company.industry);
          setVal("companyWebsite", company.website);
          setVal("companyEmail", company.email);
          setVal("companyPhone", company.phone);
          setVal("companyAddress", company.address);
          setVal("companyCity", company.city);
          setVal("companyCountry", company.country);
          setVal("companyStatus", company.status);
          setVal("companyNotes", company.notes);
        }).catch(toastError);
      } else {
        setVal("companyStatus", "Prospect");
      }
      CRM.openModal("companyModal");
    }

    function openCompanyDetail(id) {
      if (!id) return;
      state.currentId = id;
      var info = byId("companyDetailInfo");
      if (info) info.innerHTML = loadingHtml();
      var leadsBox = byId("companyDetailLeads");
      if (leadsBox) leadsBox.innerHTML = loadingHtml();
      CRM.openModal("companyDetailModal");
      CRM.api.get("/companies/" + id).then(function (company) {
        var title = byId("companyDetailTitle");
        if (title) title.textContent = company.name || "Company details";
        if (info) {
          info.innerHTML = '<div class="form-grid">' +
            infoCell("Industry", esc(company.industry || "—")) +
            infoCell("Website", company.website ? '<a href="' + esc(company.website) + '" target="_blank" rel="noopener">' + esc(company.website) + "</a>" : "—") +
            infoCell("Email", company.email ? '<a href="mailto:' + esc(company.email) + '">' + esc(company.email) + "</a>" : "—") +
            infoCell("Phone", esc(company.phone || "—")) +
            infoCell("City", esc(company.city || "—")) +
            infoCell("Country", esc(company.country || "—")) +
            infoCell("Status", CRM.badge(company.status)) +
            infoCell("Created", CRM.formatDate(company.created_at)) +
            '<div class="form-group span-2"><label>Address</label><div>' + esc(company.address || "—") + "</div></div>" +
            '<div class="form-group span-2"><label>Notes</label><div>' + esc(company.notes || "—") + "</div></div>" +
            "</div>";
        }
        var leads = company.leads || [];
        var countEl = byId("companyDetailLeadCount");
        if (countEl) countEl.textContent = leads.length + (leads.length === 1 ? " lead" : " leads");
        if (leadsBox) {
          if (!leads.length) {
            leadsBox.innerHTML = CRM.emptyState("&#10148;", "No leads yet",
              "Leads linked to this company will appear here.",
              '<button class="btn btn-primary btn-sm" type="button" id="btnDetailNewLead">&#65291; New lead</button>');
            var addLead = byId("btnDetailNewLead");
            if (addLead) {
              addLead.addEventListener("click", function () {
                CRM.closeModal("companyDetailModal");
                location.href = "/pages/leads.html";
              });
            }
          } else {
            leadsBox.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
              "<th>Lead</th><th>Status</th><th>Value</th><th>Next follow-up</th>" +
              "</tr></thead><tbody>" + leads.map(function (l) {
                return "<tr>" +
                  '<td><div class="cell-main">' + esc(l.name) + "</div>" +
                  '<div class="cell-sub">' + esc(l.email || "—") + "</div></td>" +
                  "<td>" + CRM.badge(l.status) + "</td>" +
                  "<td>" + CRM.money(l.value) + "</td>" +
                  "<td>" + (l.next_followup ? CRM.formatDate(l.next_followup) : "—") + "</td>" +
                  "</tr>";
              }).join("") + "</tbody></table></div>";
          }
        }
      }).catch(toastError);
    }

    function removeCompany(id) {
      CRM.confirmAction({
        title: "Delete company?",
        message: "The company record will be permanently removed.",
        confirmText: "Delete"
      }).then(function (yes) {
        if (!yes) return;
        CRM.api.del("/companies/" + id).then(function () {
          CRM.showToast("Company deleted.", "success");
          load();
        }).catch(toastError);
      });
    }

    load();
  }

  function initSendMessage() {
    var card = byId("sendMessageCard");
    if (!card || CRM.effectiveRole(user) !== "admin") return;
    card.style.display = "";

    var empSelect = byId("msgEmployee");
    CRM.api.get("/employees" + CRM.qs({ per_page: 200, sort: "name", dir: "asc" }))
      .then(function (data) {
        fillSelect(empSelect, (data.items || []).map(function (emp) {
          return { value: emp.id, label: emp.name + (emp.role ? " · " + emp.role : "") };
        }), "", "Select employee");
      })
      .catch(toastError);

    var form = byId("sendMessageForm");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var employeeId = fieldVal("msgEmployee");
      var title = fieldVal("msgTitle");
      var message = fieldVal("msgBody");
      if (!employeeId || !message) {
        CRM.showToast("Select an employee and write a message.", "error");
        return;
      }
      var btn = byId("msgSendBtn");
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      CRM.api.post("/auth/notifications", {
        user_id: employeeId,
        title: title || "Message from the admin",
        message: message
      }).then(function () {
        CRM.showToast("Message sent.", "success");
        form.reset();
      }).catch(toastError).then(function () {
        if (btn) { btn.disabled = false; btn.textContent = "Send message"; }
      });
    });
  }

  function initFollowups() {
    var tbody = byId("followupRows");
    var pag = byId("pagination");
    if (!tbody) return;

    var state = { q: "", status: "", due: false, page: 1, per_page: 15, editId: "", items: [] };
    var leadPromise = null;
    var empNames = {};

    CRM.api.get("/employees" + CRM.qs({ per_page: 200 })).then(function (data) {
      (data.items || []).forEach(function (emp) { empNames[emp.id] = emp.name; });
    }).catch(function () { });

    var search = byId("followupSearch");
    if (search) {
      search.addEventListener("input", CRM.debounce(function () {
        state.q = search.value.trim();
        state.page = 1;
        load();
      }));
    }

    var statusSel = byId("filterStatus");
    if (statusSel) {
      statusSel.addEventListener("change", function () {
        state.status = statusSel.value;
        state.page = 1;
        load();
      });
    }

    var dueBox = byId("filterDue");
    if (dueBox) {
      dueBox.addEventListener("change", function () {
        state.due = dueBox.checked;
        state.page = 1;
        load();
      });
    }

    var clearBtn = byId("btnFollowupClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.q = ""; state.status = ""; state.due = false; state.page = 1;
        setVal("followupSearch", "");
        setVal("filterStatus", "");
        if (dueBox) dueBox.checked = false;
        load();
      });
    }

    var newBtn = byId("btnNewFollowup");
    if (newBtn) newBtn.addEventListener("click", function () { openFollowupModal(""); });

    initSendMessage();

    if (pag) CRM.bindPagination(pag, function (num) { state.page = num; load(); });

    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var id = btn.getAttribute("data-id") || "";
      if (act === "done") markDone(id);
      else if (act === "edit") openFollowupModal(id);
      else if (act === "new") openFollowupModal("");
      else if (act === "delete") removeFollowup(id);
    });

    var form = byId("followupForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var body = {
          type: fieldVal("fuType"),
          notes: fieldVal("fuNotes"),
          due_date: fieldVal("fuDue"),
          status: fieldVal("fuStatus")
        };
        if (state.editId) {
          CRM.api.put("/followups/" + state.editId, body).then(function () {
            CRM.closeModal("followupModal");
            CRM.showToast("Follow-up updated.", "success");
            state.editId = "";
            load();
          }).catch(toastError);
          return;
        }
        var leadId = fieldVal("fuLead");
        if (!leadId) {
          CRM.showToast("Please select a lead.", "error");
          return;
        }
        if (!body.notes && !body.due_date) {
          CRM.showToast("Notes or a due date is required.", "error");
          return;
        }
        CRM.api.post("/leads/" + leadId + "/followups", body).then(function () {
          CRM.closeModal("followupModal");
          CRM.showToast("Follow-up created.", "success");
          load();
        }).catch(toastError);
      });
    }

    function loadLeads() {
      if (leadPromise) return leadPromise;
      leadPromise = CRM.api.get("/leads" + CRM.qs({ per_page: 200 })).then(function (data) {
        fillSelect(byId("fuLead"), (data.items || []).map(function (l) {
          return { value: l.id, label: l.name };
        }), "", "Select lead");
        return data;
      }).catch(function (e) {
        leadPromise = null;
        throw e;
      });
      return leadPromise;
    }

    function rowHtml(item) {
      var overdue = item.status === "Pending" && item.due_date &&
        String(item.due_date).slice(0, 10) < todayStr();
      var due = item.due_date ? CRM.formatDate(item.due_date) : "—";
      var dueCell = overdue ? '<span class="badge badge-danger">' + esc(due) + "</span>" : esc(due);
      var creator = empNames[item.created_by] || item.created_by || "—";
      var buttons = '<div class="actions">' +
        (item.status === "Done" ? "" :
          '<button class="btn btn-ghost btn-sm" type="button" data-act="done" data-id="' + esc(item.id) + '">Done</button>') +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="edit" data-id="' + esc(item.id) + '">Edit</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="delete" data-id="' + esc(item.id) + '">Delete</button>' +
        "</div>";
      return "<tr" + (overdue ? ' class="row-overdue"' : "") + ">" +
        '<td><div class="cell-main">' + esc(item.lead_name || "—") + "</div>" +
        '<div class="cell-sub">' + esc(item.lead_status || "") + "</div></td>" +
        "<td>" + esc(item.type || "—") + "</td>" +
        "<td>" + esc(item.notes || "—") + "</td>" +
        "<td>" + dueCell + "</td>" +
        "<td>" + CRM.badge(item.status) + "</td>" +
        "<td><div>" + esc(CRM.formatDate(item.created_at)) + "</div>" +
        '<div class="cell-sub">' + esc(creator) + "</div></td>" +
        "<td>" + buttons + "</td>" +
        "</tr>";
    }

    function load() {
      tbody.innerHTML = loadingRow(7);
      CRM.api.get("/followups" + CRM.qs({
        status: state.status,
        due: state.due ? 1 : "",
        page: state.page,
        per_page: state.q ? 200 : state.per_page
      })).then(function (data) {
        var items = data.items || [];
        var meta = data.meta || {};
        if (state.q) {
          var needle = state.q.toLowerCase();
          items = items.filter(function (f) {
            return String(f.lead_name || "").toLowerCase().indexOf(needle) > -1 ||
              String(f.notes || "").toLowerCase().indexOf(needle) > -1 ||
              String(f.type || "").toLowerCase().indexOf(needle) > -1;
          });
        }
        state.items = items;
        var countEl = byId("followupCount");
        if (countEl) {
          countEl.textContent = state.q ?
            items.length + " of " + (meta.total || 0) + " follow-ups" :
            (meta.total || 0) + " follow-ups";
        }
        if (!items.length) {
          tbody.innerHTML = emptyRow(7, "&#9200;", "No follow-ups found",
            state.q || state.status || state.due ? "Nothing matches the current filters." : "Schedule your first follow-up.",
            '<button class="btn btn-primary btn-sm" type="button" data-act="new">&#65291; Quick follow-up</button>');
        } else {
          tbody.innerHTML = items.map(rowHtml).join("");
        }
        if (pag) pag.innerHTML = CRM.paginationHtml(meta);
      }).catch(function (e) {
        tbody.innerHTML = emptyRow(7, "&#9888;", "Could not load follow-ups", e.message);
        toastError(e);
      });
    }

    function openFollowupModal(id) {
      var form = byId("followupForm");
      if (!form) return;
      form.reset();
      state.editId = id || "";
      var title = byId("followupModalTitle");
      if (title) title.textContent = id ? "Edit follow-up" : "Quick follow-up";
      var leadSel = byId("fuLead");
      if (leadSel) leadSel.disabled = !!id;
      CRM.openModal("followupModal");
      loadLeads().then(fill).catch(function (e) {
        toastError(e);
        fill();
      });

      function fill() {
        if (!state.editId) return;
        var item = null;
        state.items.forEach(function (f) { if (f.id === state.editId) item = f; });
        if (!item) {
          CRM.showToast("Follow-up not found in the loaded list.", "error");
          return;
        }
        setVal("fuLead", item.lead_id);
        setVal("fuType", item.type);
        setVal("fuStatus", item.status);
        setVal("fuDue", item.due_date ? String(item.due_date).slice(0, 10) : "");
        setVal("fuNotes", item.notes);
      }
    }

    function markDone(id) {
      CRM.api.put("/followups/" + id, { status: "Done" }).then(function () {
        CRM.showToast("Follow-up marked as done.", "success");
        load();
      }).catch(toastError);
    }

    function removeFollowup(id) {
      CRM.confirmAction({
        title: "Delete follow-up?",
        message: "This follow-up will be permanently removed.",
        confirmText: "Delete"
      }).then(function (yes) {
        if (!yes) return;
        CRM.api.del("/followups/" + id).then(function () {
          CRM.showToast("Follow-up deleted.", "success");
          load();
        }).catch(toastError);
      });
    }

    load();
  }
})();
