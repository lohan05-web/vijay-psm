/* ============================================================
   auth.js — session guard, API client, shared shell (sidebar /
   navbar / footer / modals), toasts and small UI utilities.
   Every page includes this file first.
   ============================================================ */
(function () {
  "use strict";

  var TOKEN_KEY = "crm_token";
  var USER_KEY = "crm_user";

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch (e) { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function toLogin() {
    clearSession();
    if (!/login\.html$/.test(location.pathname)) location.href = "/pages/login.html";
  }

  /* ------------------------------------------------------- API client */
  function api(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    var init = {
      method: options.method || (options.body ? "POST" : "GET"),
      headers: headers
    };
    if (options.body !== undefined && options.body !== null && !(options.body instanceof FormData)) {
      init.body = JSON.stringify(options.body);
    } else if (options.body instanceof FormData) {
      delete headers["Content-Type"];
      init.body = options.body;
    }

    return fetch("/api" + path, init).then(function (res) {
      if (res.status === 401 && token) {
        toLogin();
        throw new Error("Session expired");
      }
      var type = res.headers.get("content-type") || "";
      if (type.indexOf("application/json") !== -1) {
        return res.json().then(function (data) {
          if (!res.ok || data.success === false) {
            var message = data.message || "Request failed";
            if (data.errors && data.errors.length) message += ": " + data.errors.join(", ");
            throw new Error(message);
          }
          return data.data !== undefined ? data.data : data;
        });
      }
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      return res;
    });
  }

  api.get = function (p) { return api(p, { method: "GET" }); };
  api.post = function (p, body) { return api(p, { method: "POST", body: body || {} }); };
  api.put = function (p, body) { return api(p, { method: "PUT", body: body || {} }); };
  api.del = function (p) { return api(p, { method: "DELETE" }); };

  /* --------------------------------------------------------- toasts */
  function showToast(message, type) {
    type = type || "info";
    var root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      root.className = "toast-container";
      document.body.appendChild(root);
    }
    var icons = { success: "&#10003;", error: "&#10007;", warning: "&#9888;", info: "&#8505;" };
    var toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.innerHTML = '<span>' + (icons[type] || icons.info) + "</span><span>" +
      escapeHtml(message) + '</span><button class="t-close" type="button">&times;</button>';
    toast.querySelector(".t-close").onclick = function () { toast.remove(); };
    root.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 4200);
  }

  /* --------------------------------------------------------- modals */
  function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("open");
  }
  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("open");
  }

  function confirmAction(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var title = document.getElementById("confirmTitle");
      var msg = document.getElementById("confirmMessage");
      var yes = document.getElementById("confirmYes");
      if (title) title.textContent = opts.title || "Are you sure?";
      if (msg) msg.textContent = opts.message || "This action cannot be undone.";
      if (yes) yes.textContent = opts.confirmText || "Delete";
      openModal("confirmModal");

      function cleanup(result) {
        closeModal("confirmModal");
        yes.removeEventListener("click", onYes);
        var overlay = document.getElementById("confirmModal");
        if (overlay) overlay.removeEventListener("click", onOverlay);
        resolve(result);
      }
      function onYes() { cleanup(true); }
      function onOverlay(e) { if (e.target.id === "confirmModal") cleanup(false); }
      yes.addEventListener("click", onYes);
      var overlay = document.getElementById("confirmModal");
      if (overlay) overlay.addEventListener("click", onOverlay);
    });
  }

  var shellReady = false;
  var pendingSubmits = [];

  function flushPendingSubmits() {
    if (!shellReady) return;
    pendingSubmits.splice(0, pendingSubmits.length).forEach(function (replay) { replay(); });
  }

  function markShellReady() {
    if (shellReady) return;
    shellReady = true;
    flushPendingSubmits();
  }

  document.addEventListener("submit", function (e) {
    if (shellReady) return;
    var form = e.target;
    if (!form || form.dataset.submitQueued === "1") return;
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    form.dataset.submitQueued = "1";
    pendingSubmits.push(function () {
      delete form.dataset.submitQueued;
      var ev;
      try { ev = new Event("submit", { bubbles: true, cancelable: true }); }
      catch (err) { ev = document.createEvent("Event"); ev.initEvent("submit", true, true); }
      form.dispatchEvent(ev);
    });
  }, true);

  setTimeout(markShellReady, 4000);

  /* ----------------------------------------------------- shell loader */
  function loadComponent(url, targetId) {
    var target = document.getElementById(targetId);
    if (!target) return Promise.resolve();
    return fetch(url).then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (html) { target.outerHTML = html; })
      .catch(function () { });
  }

  function initShell(pageName, title) {
    return Promise.all([
      loadComponent("/components/sidebar.html", "sidebar"),
      loadComponent("/components/navbar.html", "navbar"),
      loadComponent("/components/footer.html", "footer"),
      loadComponent("/components/modals.html", "modal-root")
    ]).then(function () {
      wireShell(pageName, title);
      markShellReady();
    });
  }

  function wireShell(pageName, title) {
    var user = getUser() || {};

    // active nav + role visibility
    var links = document.querySelectorAll(".sidebar .nav-link");
    Array.prototype.forEach.call(links, function (link) {
      var roles = (link.getAttribute("data-roles") || "").split(",");
      if (roles.indexOf(effectiveRole(user)) === -1) { link.style.display = "none"; return; }
      if (link.getAttribute("data-page") === pageName) link.classList.add("active");
    });

    // page title
    var active = document.querySelector('.sidebar .nav-link.active');
    var pageTitle = document.getElementById("pageTitle");
    if (pageTitle) pageTitle.textContent = title || (active ? active.textContent.trim() : "Dashboard");
    var sub = document.getElementById("pageSubtitle");
    if (sub) sub.textContent = roleLabel(user.role) + " · " + formatDate(new Date().toISOString());

    // user chip
    var avatar = document.getElementById("userAvatar");
    if (avatar) avatar.textContent = initials(user.name || "U");
    var nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.name || "User";
    var roleEl = document.getElementById("userRole");
    if (roleEl) roleEl.textContent = roleLabel(user.role);

    // mobile menu
    var toggle = document.getElementById("menuToggle");
    if (toggle) toggle.onclick = function () {
      var sidebar = document.querySelector(".sidebar");
      if (sidebar) sidebar.classList.toggle("open");
      var backdrop = document.querySelector(".sidebar-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "sidebar-backdrop";
        document.body.appendChild(backdrop);
        backdrop.onclick = function () {
          sidebar.classList.remove("open");
          backdrop.classList.remove("show");
        };
      }
      backdrop.classList.toggle("show", sidebar.classList.contains("open"));
    };

    // user menu
    var chip = document.getElementById("userChip");
    var menu = document.getElementById("userMenu");
    if (chip && menu) {
      chip.onclick = function (e) {
        e.stopPropagation();
        menu.classList.toggle("open");
      };
      document.addEventListener("click", function () { menu.classList.remove("open"); });
      menu.onclick = function (e) { e.stopPropagation(); };
    }
    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = function () {
      clearSession();
      location.href = "/pages/login.html";
    };

    // notifications
    var notifBtn = document.getElementById("notifBtn");
    if (notifBtn) notifBtn.onclick = function () {
      openModal("notifModal");
      renderNotifications();
    };
    var markAll = document.getElementById("markAllRead");
    if (markAll) markAll.onclick = function () {
      api.put("/auth/notifications/read-all").then(function () {
        updateNotifBadge(0);
        renderNotifications();
      }).catch(function (e) { showToast(e.message, "error"); });
    };
    refreshNotifBadge();

    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-reply]");
      if (!btn) return;
      openReply(btn.getAttribute("data-reply"), btn.getAttribute("data-reply-title") || "");
    });

    // close buttons + overlay click for all modals
    document.addEventListener("click", function (e) {
      var closer = e.target.getAttribute && e.target.getAttribute("data-close");
      if (closer) closeModal(closer);
      if (e.target.classList && e.target.classList.contains("modal-overlay")) {
        e.target.classList.remove("open");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        Array.prototype.forEach.call(document.querySelectorAll(".modal-overlay.open"),
          function (m) { m.classList.remove("open"); });
      }
    });

    var foot = document.getElementById("app-footer") || document.querySelector(".site-foot");
    if (foot && !foot.dataset.wired) {
      foot.dataset.wired = "1";
    }
  }

  function updateNotifBadge(count) {
    var el = document.getElementById("notifCount");
    if (!el) return;
    if (count > 0) { el.hidden = false; el.textContent = count > 9 ? "9+" : count; }
    else el.hidden = true;
  }

  function refreshNotifBadge() {
    api.get("/auth/notifications").then(function (data) {
      updateNotifBadge(data.unread || 0);
    }).catch(function () { });
  }

  function renderNotifications() {
    var list = document.getElementById("notifList");
    if (!list) return;
    list.innerHTML = '<div class="loading"><div><div class="spinner"></div>Loading…</div></div>';
    api.get("/auth/notifications").then(function (data) {
      var items = data.items || [];
      if (!items.length) {
        list.innerHTML = '<div class="empty-state"><div class="es-ico">&#9853;</div>' +
          "<h4>No notifications</h4><p>You are all caught up.</p></div>";
        return;
      }
      list.innerHTML = '<div class="feed">' + items.map(function (n) {
        var icon = n.type === "lead" ? "&#10148;" : n.type === "project" ? "&#9635;"
          : n.type === "task" ? "&#9636;" : n.type === "reply" ? "&#8617;" : "&#9888;";
        var replyBtn = n.created_by
          ? '<div style="margin-top:6px"><button class="btn btn-ghost btn-sm" type="button"' +
            ' data-reply="' + escapeHtml(n.id) + '"' +
            ' data-reply-title="' + escapeHtml(n.title || "") + '">Reply</button></div>'
          : "";
        return '<div class="feed-item">' +
          '<span class="feed-ico">' + icon + "</span>" +
          '<div><div class="fi-title">' + escapeHtml(n.title) + "</div>" +
          '<div class="fi-sub">' + escapeHtml(n.message) + "</div>" + replyBtn + "</div>" +
          '<span class="fi-time">' + escapeHtml((n.created_at || "").slice(0, 16)) + "</span></div>";
      }).join("") + "</div>";
    }).catch(function (e) {
      list.innerHTML = '<div class="empty-state"><p>' + escapeHtml(e.message) + "</p></div>";
    });
  }

  var replyTargetId = "";

  function openReply(notificationId, title) {
    replyTargetId = notificationId || "";
    if (!replyTargetId) return;
    var context = document.getElementById("replyContext");
    if (context) context.textContent = title;
    var bodyEl = document.getElementById("replyBody");
    if (bodyEl) bodyEl.value = "";
    var form = document.getElementById("replyForm");
    if (form) form.onsubmit = submitReply;
    openModal("replyModal");
    if (bodyEl) bodyEl.focus();
  }

  function submitReply(e) {
    e.preventDefault();
    var bodyEl = document.getElementById("replyBody");
    var message = bodyEl ? bodyEl.value.trim() : "";
    if (!message) { showToast("Write a reply first.", "error"); return; }
    var btn = document.getElementById("replySendBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    api.post("/auth/notifications/" + encodeURIComponent(replyTargetId) + "/reply",
      { message: message })
      .then(function () {
        showToast("Reply sent.", "success");
        closeModal("replyModal");
        renderNotifications();
        refreshNotifBadge();
      })
      .catch(function (err) { showToast(err.message, "error"); })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = "Send reply"; }
      });
  }

  /* ---------------------------------------------------------- guards */
  function effectiveRole(user) {
    return (user && (user.access || user.role)) || "";
  }

  function requireAuth(roles) {
    var token = getToken();
    var user = getUser();
    if (!token || !user) { toLogin(); return null; }
    if (roles && roles.length && roles.indexOf(effectiveRole(user)) === -1) {
      showToast("You do not have permission to view this page.", "error");
      setTimeout(function () { location.href = homeFor(effectiveRole(user)); }, 700);
      return null;
    }
    return user;
  }

  function homeFor(role) {
    if (role === "admin") return "/pages/admin-dashboard.html";
    if (role === "developer") return "/pages/developer-dashboard.html";
    return "/pages/employee-dashboard.html";
  }

  /* ------------------------------------------------------- utilities */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function initials(name) {
    return String(name || "").trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return p.charAt(0).toUpperCase(); }).join("") || "U";
  }

  function roleLabel(role) {
    return String(role || "").charAt(0).toUpperCase() + String(role || "").slice(1);
  }

  function formatDate(value) {
    if (!value) return "—";
    var raw = String(value).slice(0, 10);
    var parts = raw.split("-");
    if (parts.length !== 3) return String(value).slice(0, 10);
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var idx = parseInt(parts[1], 10) - 1;
    return (isNaN(idx) ? parts[1] : months[idx] || parts[1]) + " " + parts[2] + ", " + parts[0];
  }

  function formatMoney(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return "—";
    var sign = num < 0 ? "-" : "";
    num = Math.abs(num);
    if (num >= 1000000) return sign + "$" + (num / 1000000).toFixed(2) + "M";
    if (num >= 1000) return sign + "$" + (num / 1000).toFixed(1) + "K";
    return sign + "$" + num.toFixed(0);
  }

  function formatNumber(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-US");
  }

  var BADGE_MAP = {
    "Won": "success", "Completed": "success", "Done": "success", "Active": "success",
    "Paid": "success", "Available": "success",
    "New": "primary", "Planning": "info", "To Do": "muted",
    "Contacted": "info", "Qualified": "info", "In Progress": "info", "Review": "info",
    "Proposal": "warning", "Negotiation": "warning", "Pending": "warning",
    "On Hold": "warning", "On Leave": "warning", "Rescheduled": "warning",
    "High": "warning", "Urgent": "danger", "Critical": "danger", "Blocked": "danger",
    "Lost": "danger", "Cancelled": "danger", "Inactive": "danger", "Churned": "danger",
    "Medium": "info", "Low": "muted", "Prospect": "info", "Skipped": "muted",
    "Admin": "info", "Employee": "primary", "Developer": "success"
  };

  function badge(value) {
    var text = value === null || value === undefined || value === "" ? "—" : value;
    var plain = String(text);
    var capitalized = plain.charAt(0).toUpperCase() + plain.slice(1);
    var color = BADGE_MAP[plain] || BADGE_MAP[capitalized] || "muted";
    return '<span class="badge badge-' + color + '">' + escapeHtml(text) + "</span>";
  }

  function money(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return "—";
    return "$" + num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function emptyState(icon, title, subtitle, actionHtml) {
    return '<div class="empty-state"><div class="es-ico">' + icon + "</div><h4>" +
      escapeHtml(title) + "</h4><p>" + escapeHtml(subtitle || "") + "</p>" +
      (actionHtml || "") + "</div>";
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 280);
    };
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== "") {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
      }
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  /* pagination renderer: returns HTML for .pagination */
  function paginationHtml(meta, onPage) {
    if (!meta || meta.pages <= 1) {
      return '<div class="pagination"><span>' + (meta ? meta.total : 0) + " records</span></div>";
    }
    var buttons = "";
    for (var i = 1; i <= meta.pages; i++) {
      if (meta.pages > 7 && i > 2 && i < meta.pages - 1 && Math.abs(i - meta.page) > 1) {
        if (i === 3) buttons += '<span class="page-btn" style="border:none">…</span>';
        continue;
      }
      buttons += '<button class="page-btn' + (i === meta.page ? " active" : "") +
        '" data-page-num="' + i + '">' + i + "</button>";
    }
    var start = (meta.page - 1) * meta.per_page + 1;
    var end = Math.min(meta.total, meta.page * meta.per_page);
    return '<div class="pagination"><span>Showing ' + start + "–" + end + " of " + meta.total +
      '</span><div class="pages">' +
      '<button class="page-btn" data-page-num="' + Math.max(1, meta.page - 1) + '">&#8249;</button>' +
      buttons +
      '<button class="page-btn" data-page-num="' + Math.min(meta.pages, meta.page + 1) + '">&#8250;</button>' +
      "</div></div>";
  }

  function bindPagination(container, handler) {
    if (!container) return;
    container.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-page-num]");
      if (btn) handler(parseInt(btn.getAttribute("data-page-num"), 10));
    });
  }

  /* --------------------------------------------------- login page hook */
  function initLoginPage() {
    var form = document.getElementById("loginForm");
    if (!form) return;

    markShellReady();

    if (getToken() && getUser()) { location.href = homeFor(effectiveRole(getUser())); return; }

    var alertBox = document.getElementById("loginAlert");
    var submitBtn = document.getElementById("loginSubmit");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideAlert();
      var email = document.getElementById("loginEmail").value.trim();
      var password = document.getElementById("loginPassword").value;
      if (!email || !password) { showAlert("Please enter your email and password.", false); return; }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-sm"></span> Signing in…';

      api.post("/auth/login", { email: email, password: password })
        .then(function (data) {
          setSession(data.token, data.user);
          showAlert("Welcome back, " + data.user.name + "!", true);
          setTimeout(function () { location.href = homeFor(effectiveRole(data.user)); }, 350);
        })
        .catch(function (err) {
          showAlert(err.message || "Login failed", false);
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign in";
        });
    });

    function showAlert(message, success) {
      if (!alertBox) return;
      alertBox.textContent = message;
      alertBox.className = "auth-alert show" + (success ? " success" : "");
    }

    function hideAlert() {
      if (!alertBox) return;
      alertBox.textContent = "";
      alertBox.className = "auth-alert";
    }

    ["loginEmail", "loginPassword"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", hideAlert);
    });

    var togglePass = document.getElementById("togglePassword");
    if (togglePass) togglePass.onclick = function () {
      var field = document.getElementById("loginPassword");
      var showing = field.type === "text";
      field.type = showing ? "password" : "text";
      togglePass.innerHTML = showing ? "&#128065;" : "&#128584;";
    };

    Array.prototype.forEach.call(document.querySelectorAll("[data-fill-email]"), function (btn) {
      btn.addEventListener("click", function () {
        document.getElementById("loginEmail").value = btn.getAttribute("data-fill-email");
        document.getElementById("loginPassword").value = btn.getAttribute("data-fill-pass");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLoginPage);
  } else {
    initLoginPage();
  }

  window.CRM = {
    api: api,
    getToken: getToken,
    getUser: getUser,
    setSession: setSession,
    clearSession: clearSession,
    toLogin: toLogin,
    requireAuth: requireAuth,
    effectiveRole: effectiveRole,
    homeFor: homeFor,
    initShell: initShell,
    showToast: showToast,
    openModal: openModal,
    closeModal: closeModal,
    confirmAction: confirmAction,
    refreshNotifBadge: refreshNotifBadge,
    escapeHtml: escapeHtml,
    initials: initials,
    formatDate: formatDate,
    formatMoney: formatMoney,
    formatNumber: formatNumber,
    badge: badge,
    money: money,
    emptyState: emptyState,
    debounce: debounce,
    qs: qs,
    paginationHtml: paginationHtml,
    bindPagination: bindPagination
  };
})();
