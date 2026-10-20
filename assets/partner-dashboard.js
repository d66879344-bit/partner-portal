(function () {
  var $ = function (id) { return document.getElementById(id); };
  var slotsFor = (window.DOC_DEFS && window.DOC_DEFS.slotsFor) || function () { return []; };
  var expandSlots = (window.DOC_DEFS && window.DOC_DEFS.expandSlots) || function (d) { return d; };
  var MAX_BYTES = 20 * 1024 * 1024;
  var OK_TYPES = { "application/pdf": 1, "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1 };
  var EXT_TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

  var me = null;
  var lastOrders = [];
  var myFleet = { company: { documents: [] }, other: { documents: [] }, vehicles: [], drivers: [] };
  var STAGES = [
    { key: "on_the_way" },
    { key: "arrived" },
    { key: "in_car" },
    { key: "dropped_off" },
  ];
  var STAGE_I18N_KEY = {
    on_the_way: "stage_on_the_way", arrived: "stage_arrived",
    in_car: "stage_in_car", dropped_off: "stage_dropped_off",
  };
  function stageLabel(key) { return window.I18N ? I18N.t(STAGE_I18N_KEY[key]) : key; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso.replace(" ", "T") + "Z");
      return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + ", " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    } catch (e) { return iso; }
  }
  function fmtDay(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      return pad2(dt.getDate()) + "/" + pad2(dt.getMonth() + 1) + "/" + dt.getFullYear();
    } catch (e) { return d; }
  }
  function copyBtnHtml(value) {
    if (value == null || value === "") return "";
    return '<button type="button" class="copy-btn" data-copy="' + esc(value) + '" title="Copy">' +
      '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M4.5 12.5V5A1.5 1.5 0 0 1 6 3.5h7"/></svg>' +
      "</button>";
  }
  async function handleCopyClick(btn) {
    var val = btn.getAttribute("data-copy") || "";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(val);
      } else {
        var ta = document.createElement("textarea");
        ta.value = val; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      }
      var prevHtml = btn.innerHTML;
      btn.classList.add("copied");
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 8 14.5 16 5.5"/></svg>';
      setTimeout(function () { btn.classList.remove("copied"); btn.innerHTML = prevHtml; }, 1200);
    } catch (e) { /* clipboard unavailable; ignore */ }
  }
  function typeFor(f) {
    if (OK_TYPES[f.type]) return f.type;
    var m = /\.([a-z0-9]+)$/i.exec(f.name || "");
    return m ? (EXT_TYPES[m[1].toLowerCase()] || null) : null;
  }
  function badge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + "</span>";
  }

  async function api(path, opts) {
    var res = await fetch(path, Object.assign({ headers: opts && opts.json ? { "Content-Type": "application/json" } : undefined }, opts || {}));
    if (res.status === 401) { window.location.href = "/login.html"; throw new Error("unauthorized"); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { var err = new Error(data.error || "request_failed"); err.data = data; throw err; }
    return data;
  }

  /* ---------- tabs ---------- */
  $("mainTabs").querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("mainTabs").querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + tab.getAttribute("data-tab")); });
    });
  });

  /* ---------- order sub-tabs (New / Accepted / Completed) ---------- */
  var orderTab = "new";
  $("orderTabs").querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("orderTabs").querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      orderTab = tab.getAttribute("data-order-tab");
      renderOrders(lastOrders);
    });
  });
  $("fDateFrom").addEventListener("change", function () { renderOrders(lastOrders); });
  $("fDateTo").addEventListener("change", function () { renderOrders(lastOrders); });
  $("fSort").addEventListener("change", function () { renderOrders(lastOrders); });

  /* ---------- account / nav ---------- */
  var acctAirportPicker = null;
  var acctCityCombo = null;
  var acctLastCity = null;

  function fmtShortDate(d) {
    if (!d) return "";
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function renderTrial(startedAt) {
    if (!window.TrialInfo) return;
    var info = TrialInfo.compute(startedAt);
    if (info.state === "not_started") {
      $("trialCard").hidden = true;
      $("trialChip").hidden = true;
      return;
    }
    $("trialCard").hidden = false;
    $("trialDayLabel").textContent = "Day " + info.dayNumber + " / " + TrialInfo.TRIAL_DAYS;
    $("trialBadge").innerHTML = '<span class="badge badge-' + info.state + '">' +
      (info.state === "ended" ? "Ended" : info.daysLeft + " day" + (info.daysLeft === 1 ? "" : "s") + " left") + "</span>";
    var pct = Math.max(0, Math.min(100, Math.round((info.dayNumber / TrialInfo.TRIAL_DAYS) * 100)));
    var fill = $("trialBarFill");
    fill.style.width = pct + "%";
    fill.className = "trial-bar-fill" + (info.state === "ending" ? " ending" : info.state === "ended" ? " ended" : "");
    $("trialStartDate").textContent = fmtShortDate(info.start);
    $("trialEndDate").textContent = fmtShortDate(info.end);

    $("trialChip").hidden = false;
    $("trialChip").className = "trial-chip" + (info.state === "ending" ? " ending" : info.state === "ended" ? " ended" : "");
    $("trialChip").textContent = info.state === "ended" ? "Trial ended" : "Trial: " + info.daysLeft + "d left";
  }

  async function loadMe() {
    var data = await api("/api/partner/me");
    me = data.partner;

    if (window.I18N) {
      I18N.setLang(me.language || "en");
      I18N.apply(document);
      I18N.renderLangSwitcher("acctLang", async function (lang) {
        try {
          await api("/api/partner/account-update", { method: "POST", json: true, body: JSON.stringify({ language: lang }) });
          me.language = lang;
        } catch (e) { /* language still applies locally even if the save fails */ }
      });
      renderOrders(lastOrders);
      renderFinance(lastOrders);
    }

    renderTrial(me.trialStartedAt);

    $("whoCompany").textContent = me.companyName;
    $("acctId").textContent = me.accountId || "—";
    $("acctEmail").textContent = me.email;
    $("acctCompany").textContent = me.companyName;
    $("acctCountry").textContent = me.countryName || me.country;
    if ($("coCompanyName")) $("coCompanyName").value = me.companyName || "";
    if ($("whoAvatar")) $("whoAvatar").textContent = (me.companyName || "?").trim().charAt(0).toUpperCase() || "?";
    if ($("whoCompanyFoot")) $("whoCompanyFoot").textContent = me.companyName;
    $("acctStatus").innerHTML = badge(me.status);
    $("acctSince").textContent = fmtDate(me.createdAt);
    $("pendingBanner").hidden = me.status === "active";

    $("acctPhone").value = me.phone || "";
    acctLastCity = me.serviceCity || null;

    if (window.AirportPicker && $("acctAirports")) {
      acctAirportPicker = window.AirportPicker.create($("acctAirports"), {
        country: me.country,
        city: acctLastCity,
        selected: me.airports || [],
      });
    }
    if (window.Combobox && $("acctCityCombo")) {
      var cities = window.citiesForCountry ? window.citiesForCountry(me.country) : [];
      acctCityCombo = window.Combobox.create($("acctCityCombo"), {
        items: cities.map(function (c) { return [c, c]; }),
        placeholder: "Start typing a city…",
        allowFreeText: true,
        value: acctLastCity,
        onChange: function (city) {
          // The initial value we just passed in also fires this — ignore that
          // "no-op" sync so we don't wipe out the airports we just loaded.
          if (city === acctLastCity) return;
          acctLastCity = city;
          if (acctAirportPicker) acctAirportPicker.setCity(city || null);
        },
      });
    }
  }

  $("logoutBtn").addEventListener("click", async function () {
    try { await fetch("/api/logout", { method: "POST" }); } catch (e) {}
    window.location.href = "/login.html";
  });

  $("acctSaveBtn").addEventListener("click", async function () {
    var phone = $("acctPhone").value.trim();
    var statusEl = $("acctStatus2");
    if (!phone) {
      statusEl.textContent = "Enter a contact phone number.";
      statusEl.className = "status err";
      return;
    }
    $("acctSaveBtn").disabled = true;
    statusEl.textContent = "";
    statusEl.className = "status";
    try {
      var airports = acctAirportPicker ? acctAirportPicker.getSelected() : (me.airports || []);
      var serviceCity = acctCityCombo ? (acctCityCombo.getValue() || "") : (me.serviceCity || "");
      await api("/api/partner/account-update", { method: "POST", json: true, body: JSON.stringify({ phone: phone, airports: airports, serviceCity: serviceCity }) });
      me.phone = phone;
      me.airports = airports;
      me.serviceCity = serviceCity;
      acctLastCity = serviceCity || null;
      statusEl.textContent = "Saved.";
      statusEl.className = "status ok";
    } catch (e) {
      statusEl.textContent = "Something went wrong. Please try again.";
      statusEl.className = "status err";
    } finally {
      $("acctSaveBtn").disabled = false;
    }
  });

  $("coSaveBtn").addEventListener("click", async function () {
    var name = $("coCompanyName").value.trim();
    var statusEl = $("coStatus");
    if (!name) {
      statusEl.textContent = "Enter a company name.";
      statusEl.className = "status err";
      return;
    }
    $("coSaveBtn").disabled = true;
    statusEl.textContent = "";
    statusEl.className = "status";
    try {
      await api("/api/partner/account-update", { method: "POST", json: true, body: JSON.stringify({ companyName: name }) });
      me.companyName = name;
      $("whoCompany").textContent = name;
      $("acctCompany").textContent = name;
      statusEl.textContent = "Saved.";
      statusEl.className = "status ok";
    } catch (e) {
      statusEl.textContent = "Something went wrong. Please try again.";
      statusEl.className = "status err";
    } finally {
      $("coSaveBtn").disabled = false;
    }
  });

  /* ---------- orders ---------- */
  var lastClosedCount = 0;
  async function loadOrders(silent) {
    if (!silent) {
      $("ordersStatus").textContent = "Loading…";
      $("ordersStatus").className = "status";
    }
    try {
      var data = await api("/api/partner/orders");
      lastOrders = data.orders || [];
      lastClosedCount = data.declinedCount || 0;
      renderOrders(lastOrders);
      renderFinance(lastOrders);
    } catch (e) {
      if (silent) return;
      $("ordersStatus").textContent = "Could not load orders.";
      $("ordersStatus").className = "status err";
    }
  }
  var STATUS_FOR_TAB = { new: "offered", accepted: "accepted", completed: "completed" };
  var EMPTY_MESSAGE_KEY = { new: "empty_new", accepted: "empty_accepted", completed: "empty_completed" };
  function emptyMessage(tab) { return window.I18N ? I18N.t(EMPTY_MESSAGE_KEY[tab]) : ""; }

  function updateTabCounts(allOrders) {
    var newCount = allOrders.filter(function (o) { return o.status === "offered"; }).length;
    var acceptedCount = allOrders.filter(function (o) { return o.status === "accepted"; }).length;
    var completedCount = allOrders.filter(function (o) { return o.status === "completed"; }).length;
    $("countNew").textContent = newCount || "";
    $("countAccepted").textContent = acceptedCount || "";
    if ($("statNew")) $("statNew").textContent = newCount;
    if ($("statAccepted")) $("statAccepted").textContent = acceptedCount;
    if ($("statCompleted")) $("statCompleted").textContent = completedCount;
    if ($("statClosed")) $("statClosed").textContent = lastClosedCount;
  }

  function renderOrders(allOrders) {
    updateTabCounts(allOrders);
    var wantStatus = STATUS_FOR_TAB[orderTab];
    var orders = allOrders.filter(function (o) { return o.status === wantStatus; });

    var from = $("fDateFrom").value, to = $("fDateTo").value;
    if (from) orders = orders.filter(function (o) { return o.orderDate >= from; });
    if (to) orders = orders.filter(function (o) { return o.orderDate <= to; });

    var dir = $("fSort").value === "desc" ? -1 : 1;
    orders = orders.slice().sort(function (a, b) {
      var ka = (a.orderDate || "") + " " + (a.orderTime || "");
      var kb = (b.orderDate || "") + " " + (b.orderTime || "");
      return ka < kb ? -dir : ka > kb ? dir : 0;
    });

    $("ordersStatus").className = "status";
    if (!orders.length) {
      $("ordersStatus").textContent = "";
      $("ordersList").innerHTML = '<tr><td colspan="9" class="empty-cell">' + esc(emptyMessage(orderTab)) + "</td></tr>";
      return;
    }
    $("ordersStatus").textContent = "";
    $("ordersList").innerHTML = orders.map(function (o) {
      var stageObj = o.status === "accepted" && o.tripStage ? STAGES.filter(function (s) { return s.key === o.tripStage; })[0] : null;
      var action = o.status === "offered"
        ? '<div style="display:flex;gap:8px;">' +
          '<button type="button" class="minibtn accept" data-accept="' + o.id + '">' + esc(I18N.t("btn_accept")) + '</button>' +
          '<button type="button" class="minibtn decline" data-decline="' + o.id + '">' + esc(I18N.t("btn_decline")) + '</button>' +
          "</div>"
        : (stageObj ? '<span class="badge badge-accepted">' + esc(stageLabel(stageObj.key)) + "</span>" : badge(o.status));
      return '<tr class="data-row" data-order-open="' + o.id + '">' +
        '<td class="col-main">' + (o.orderNumber ? "#" + esc(o.orderNumber) : "#" + o.id) + "</td>" +
        "<td>" + esc(o.pickup) + "</td>" +
        "<td>" + esc(o.dropoff) + "</td>" +
        "<td>" + esc(fmtDay(o.orderDate)) + "</td>" +
        "<td>" + esc(o.orderTime || "—") + "</td>" +
        "<td>" + esc(o.vehicleType || "—") + "</td>" +
        "<td>" + esc(o.passengers != null ? o.passengers : "—") + "</td>" +
        "<td>" + (o.price ? esc(o.price) + " " + esc(o.currency || "") : "—") + "</td>" +
        "<td>" + action + "</td>" +
        "</tr>";
    }).join("");
  }
  $("ordersList").addEventListener("click", async function (e) {
    var acc = e.target.closest("[data-accept]");
    var dec = e.target.closest("[data-decline]");
    if (acc || dec) {
      e.stopPropagation();
      var id = (acc || dec).getAttribute(acc ? "data-accept" : "data-decline");
      var btn = acc || dec;
      btn.disabled = true;
      try {
        await api("/api/partner/respond", { method: "POST", json: true, body: JSON.stringify({ id: Number(id), action: acc ? "accept" : "decline" }) });
        loadOrders();
      } catch (err) {
        btn.disabled = false;
        $("ordersStatus").textContent = "Could not update the order. Try again.";
        $("ordersStatus").className = "status err";
      }
      return;
    }
    var open = e.target.closest("[data-order-open]");
    if (open) openOrderDetail(Number(open.getAttribute("data-order-open")));
  });

  /* ---------- finance ---------- */
  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  var lastFinanceOrders = [];
  function renderFinance(allOrders) {
    var orders = (allOrders || []).filter(function (o) { return o.status === "completed"; });
    var from = $("finDateFrom").value, to = $("finDateTo").value;
    if (from) orders = orders.filter(function (o) { return o.orderDate >= from; });
    if (to) orders = orders.filter(function (o) { return o.orderDate <= to; });
    orders = orders.slice().sort(function (a, b) {
      var ka = (a.orderDate || "") + " " + (a.orderTime || "");
      var kb = (b.orderDate || "") + " " + (b.orderTime || "");
      return ka < kb ? 1 : ka > kb ? -1 : 0;
    });
    lastFinanceOrders = orders;

    var totals = {};
    var noShowCount = 0;
    orders.forEach(function (o) {
      if (o.price) {
        var cur = o.currency || "—";
        totals[cur] = (totals[cur] || 0) + Number(o.price);
      }
      if (o.noShowReviewStatus === "confirmed") noShowCount++;
    });

    var cards = '<div class="card stat-card"><div class="stat-label">' +
      esc(window.I18N ? I18N.t("stat_completed") : "Completed") + '</div><div class="stat-value mono">' + orders.length + "</div></div>";
    Object.keys(totals).sort().forEach(function (cur) {
      cards += '<div class="card stat-card"><div class="stat-label">' + esc(cur) + '</div><div class="stat-value mono">' +
        totals[cur].toLocaleString(undefined, { maximumFractionDigits: 2 }) + "</div></div>";
    });
    cards += '<div class="card stat-card"><div class="stat-label">' +
      esc(window.I18N ? I18N.t("fin_stat_noshows") : "No-shows (confirmed)") + '</div><div class="stat-value mono">' + noShowCount + "</div></div>";
    $("finStatGrid").innerHTML = cards;

    if (!orders.length) {
      $("financeList").innerHTML = '<tr><td colspan="4" class="empty-cell">' + esc(emptyMessage("completed")) + "</td></tr>";
      return;
    }
    $("financeList").innerHTML = orders.map(function (o) {
      var tag = o.noShowReviewStatus === "confirmed"
        ? ' <span class="badge" style="background:var(--warn-bg);border:1px solid var(--warn-border);color:var(--warn-ink);">no-show</span>'
        : "";
      return "<tr>" +
        '<td class="col-main">' + (o.orderNumber ? "#" + esc(o.orderNumber) : "#" + o.id) + "</td>" +
        "<td>" + esc(fmtDay(o.orderDate)) + "</td>" +
        "<td>" + esc(o.pickup) + " → " + esc(o.dropoff) + tag + "</td>" +
        "<td>" + (o.price ? esc(o.price) + " " + esc(o.currency || "") : "—") + "</td>" +
        "</tr>";
    }).join("");
  }
  $("finDateFrom").addEventListener("change", function () { renderFinance(lastOrders); });
  $("finDateTo").addEventListener("change", function () { renderFinance(lastOrders); });
  $("finExportBtn").addEventListener("click", function () {
    var rows = [["Order #", "Date", "Pickup", "Dropoff", "No-show", "Price", "Currency"]];
    lastFinanceOrders.forEach(function (o) {
      rows.push([
        o.orderNumber || o.id, o.orderDate, o.pickup, o.dropoff,
        o.noShowReviewStatus === "confirmed" ? "yes" : "", o.price || "", o.currency || "",
      ]);
    });
    downloadCsv("finance-" + (me ? me.companyName || "partner" : "partner") + ".csv", rows);
  });
  $("finPrintBtn").addEventListener("click", function () { window.print(); });

  /* ---------- order detail (full-page view) ---------- */
  function fleetOptionsHtml(list, selectedId, kind) {
    var opts = '<option value="">' + (kind === "vehicle" ? "Select a vehicle…" : "Select a driver…") + "</option>";
    opts += (list || []).map(function (x) {
      var label = kind === "vehicle"
        ? ([x.make, x.plate].filter(Boolean).join(" · ") || ("Vehicle #" + x.id))
        : (x.fullName || ("Driver #" + x.id));
      var sel = selectedId && Number(selectedId) === Number(x.id) ? " selected" : "";
      return '<option value="' + x.id + '"' + sel + ">" + esc(label) + "</option>";
    }).join("");
    return opts;
  }

  function assignBlockHtml(o) {
    if (o.status !== "accepted" && o.status !== "completed" && o.status !== "no_show") return "";
    var missing = !o.driverId || !o.vehicleId;
    var warning = missing && o.status === "accepted"
      ? '<div class="warn-chip" style="margin:8px 0 0;">Please assign a vehicle and driver before the pickup time</div>'
      : "";
    return '<div class="card" style="padding:14px 20px;">' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<h2 style="margin:0;font-size:13px;flex:none;">' + esc(I18N.t("od_vehicle_driver")) + "</h2>" +
      '<select id="assignVehicle" style="flex:1 1 140px;min-width:120px;">' + fleetOptionsHtml(myFleet.vehicles, o.vehicleId, "vehicle") + "</select>" +
      '<select id="assignDriver" style="flex:1 1 120px;min-width:100px;">' + fleetOptionsHtml(myFleet.drivers, o.driverId, "driver") + "</select>" +
      '<button type="button" class="minibtn good" data-assign-order="' + o.id + '" style="flex:none;">' + esc(I18N.t("btn_save")) + "</button>" +
      "</div>" + warning +
      '<p class="status" id="assignStatus" style="margin:6px 0 0;"></p>' +
      "</div>";
  }

  function stageProgressHtml(o) {
    if (o.status !== "accepted" && o.status !== "completed" && o.status !== "no_show") return "";
    var keys = STAGES.map(function (s) { return s.key; });
    var currentIndex = o.tripStage ? keys.indexOf(o.tripStage) : -1;
    var items = STAGES.map(function (s, i) {
      var state = i <= currentIndex ? "done" : (i === currentIndex + 1 && o.status === "accepted" ? "next" : "upcoming");
      return '<span class="stage-chip stage-' + state + '">' + (i <= currentIndex ? "✓ " : "") + esc(stageLabel(s.key)) + "</span>";
    }).join("");
    return '<div class="card" style="padding:14px 20px;">' +
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<h2 style="margin:0;font-size:13px;flex:none;">' + esc(I18N.t("od_trip_progress")) + "</h2>" +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + items + "</div>" +
      "</div></div>";
  }

  function moreMenuHtml(orderId) {
    return '<div class="more-wrap">' +
      '<button type="button" class="minibtn" id="moreBtn">' + esc(I18N.t("btn_more")) + ' &#9662;</button>' +
      '<div class="more-menu" id="moreMenu" hidden>' +
      '<button type="button" class="more-menu-item danger" id="reportNoShowBtn" data-order="' + orderId + '">' + esc(I18N.t("report_no_show_btn")) + "</button>" +
      "</div></div>";
  }

  // Content of the sticky status-action bar fixed under the order view.
  function actionBarHtml(o) {
    if (o.status === "offered") {
      return '<button type="button" class="minibtn accept" style="flex:1;max-width:320px;" data-accept="' + o.id + '">' + esc(I18N.t("btn_accept")) + '</button>' +
        '<button type="button" class="minibtn decline" data-decline="' + o.id + '">' + esc(I18N.t("btn_decline")) + "</button>";
    }
    if (o.status === "no_show") {
      return '<p class="status" style="margin:0;">' + esc(I18N.t("no_show_pending")) + "</p>";
    }
    if (o.status === "accepted") {
      var keys = STAGES.map(function (s) { return s.key; });
      var currentIndex = o.tripStage ? keys.indexOf(o.tripStage) : -1;
      if (currentIndex < STAGES.length - 1) {
        var next = STAGES[currentIndex + 1];
        var canReportNoShow = currentIndex >= keys.indexOf("arrived");
        return '<button type="button" class="minibtn good" style="flex:1;max-width:420px;" data-stage-next="' + next.key + '" data-stage-order="' + o.id + '">' + esc(stageLabel(next.key)) + "</button>" +
          (canReportNoShow ? moreMenuHtml(o.id) : "");
      }
    }
    return "";
  }

  function openOrderDetail(id) {
    var o = lastOrders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    $("odTitle").textContent = "Order " + (o.orderNumber ? "#" + o.orderNumber : "#" + o.id);
    $("odStatusBadge").innerHTML = badge(o.status);

    var tripCard = '<div class="card" style="border-left:4px solid var(--accent);">' +
      '<h2 style="margin:0 0 14px;font-size:14px;">' + esc(I18N.t("od_trip")) + "</h2>" +
      '<div style="display:flex;gap:12px;margin-bottom:16px;">' +
      '<div class="route-track" style="padding-top:4px;">' +
      '<div class="route-dot"></div>' +
      '<div class="route-dotted" style="min-height:48px;"></div>' +
      '<div class="route-dot end"></div>' +
      "</div>" +
      '<div style="flex:1;min-width:0;">' +
      '<div class="route-line"><span style="font-weight:700;font-size:14px;">' + esc(o.pickup) + "</span>" + copyBtnHtml(o.pickup) + "</div>" +
      (o.flightNumber
        ? '<div class="route-line" style="margin:6px 0;"><span class="badge" style="background:var(--surface-2);color:var(--ink-2);border:1px solid var(--line);">Flight ' + esc(o.flightNumber) + (o.flightTime ? " · arrives " + esc(o.flightTime) : "") + "</span>" + copyBtnHtml(o.flightNumber) + "</div>"
        : "") +
      '<div class="route-line" style="margin-top:' + (o.flightNumber ? "20" : "6") + 'px;"><span style="font-weight:700;font-size:14px;">' + esc(o.dropoff) + "</span>" + copyBtnHtml(o.dropoff) + "</div>" +
      "</div></div>" +
      '<div class="od-fields">' +
      '<div class="field"><div class="field-label">' + esc(I18N.t("fl_date")) + '</div><div class="field-val">' + esc(fmtDay(o.orderDate)) + "</div></div>" +
      '<div class="field"><div class="field-label">' + esc(I18N.t("fl_pickup_time")) + '</div><div class="field-val">' + esc(o.orderTime || "—") + "</div></div>" +
      (o.bufferMinutes != null ? '<div class="field"><div class="field-label">' + esc(I18N.t("fl_buffer_time")) + '</div><div class="field-val">' + esc(o.bufferMinutes) + " min</div></div>" : "") +
      '<div class="field"><div class="field-label">' + esc(I18N.t("fl_vehicle_type")) + '</div><div class="field-val">' + esc(o.vehicleType || "—") + copyBtnHtml(o.vehicleType) + "</div></div>" +
      "</div></div>";

    var passengerCard = '<div class="card">' +
      '<h2 style="margin:0 0 10px;font-size:14px;">' + esc(I18N.t("od_passenger_price")) + "</h2>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="10" cy="7" r="3.2"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg></div>' +
      esc(o.passengerName || "—") + copyBtnHtml(o.passengerName) +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.6 2.3c.5-.2 1 0 1.3.4l1.4 2.1c.3.4.2 1-.2 1.4l-1.1 1c-.2.2-.2.5-.1.7.6 1.2 1.6 2.2 2.8 2.8.2.1.5.1.7-.1l1-1.1c.4-.4 1-.5 1.4-.2l2.1 1.4c.5.3.6.9.4 1.3l-.8 1.5c-.3.5-.8.8-1.4.7-4-.6-7.2-3.8-7.8-7.8-.1-.6.2-1.1.7-1.4l1.5-.7Z"/></svg></div>' +
      esc(o.passengerPhone || "—") + copyBtnHtml(o.passengerPhone) +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2 3 6v5c0 4 3 6.5 7 7 4-.5 7-3 7-7V6l-7-4Z"/></svg></div>' +
      esc(o.passengers != null ? o.passengers : "—") + " passengers · " + esc(o.luggage != null ? o.luggage : "—") + " bags" +
      copyBtnHtml(o.passengers != null ? (o.passengers + " passengers · " + (o.luggage != null ? o.luggage : 0) + " bags") : "") +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="5" width="16" height="10" rx="2"/><circle cx="10" cy="10" r="2.1" fill="currentColor" stroke="none"/></svg></div>' +
      (o.price ? esc(o.price) + " " + esc(o.currency || "") : "—") +
      "</div>" +
      (o.notes ? '<div class="row-meta" style="margin-top:10px;">Instructions: ' + esc(o.notes) + "</div>" : "") +
      (o.meetGreet
        ? '<div class="meetgreet-box">' +
          '<div class="route-line"><span class="mg-instruction">' + esc(o.meetGreet) + "</span>" + copyBtnHtml(o.meetGreet) + "</div>" +
          "</div>"
        : "") +
      "</div>";

    var assignBlock = assignBlockHtml(o);
    var stageBlock = stageProgressHtml(o);
    var bottomRow = (assignBlock || stageBlock)
      ? '<div class="od-grid">' + (assignBlock || "<div></div>") + (stageBlock || "<div></div>") + "</div>"
      : "";
    var actionBar = actionBarHtml(o);

    var body = '<div class="od-grid">' + tripCard + passengerCard + "</div>" +
      bottomRow +
      (actionBar
        ? '<div class="od-actionbar"><div style="display:flex;gap:10px;align-items:center;flex:1;flex-wrap:wrap;">' + actionBar + "</div>" +
          '<p class="status" id="omStageStatus" style="margin:0;"></p></div>'
        : "");

    $("odBody").innerHTML = body;
    $("ordersListView").hidden = true;
    $("orderDetailView").hidden = false;
    window.scrollTo(0, 0);

    var stageBtn = $("odBody").querySelector("[data-stage-next]");
    if (stageBtn) {
      stageBtn.addEventListener("click", async function () {
        var stage = this.getAttribute("data-stage-next");
        var orderId = Number(this.getAttribute("data-stage-order"));
        this.disabled = true;
        try {
          await api("/api/partner/order-stage", { method: "POST", json: true, body: JSON.stringify({ id: orderId, stage: stage }) });
          await loadOrders();
          openOrderDetail(orderId);
        } catch (e) {
          $("omStageStatus").textContent = "Could not update. Try again.";
          $("omStageStatus").className = "status err";
          this.disabled = false;
        }
      });
    }

    var assignBtn = $("odBody").querySelector("[data-assign-order]");
    if (assignBtn) {
      assignBtn.addEventListener("click", async function () {
        var orderId = Number(this.getAttribute("data-assign-order"));
        var vehicleId = $("assignVehicle").value || null;
        var driverId = $("assignDriver").value || null;
        this.disabled = true;
        $("assignStatus").textContent = "";
        $("assignStatus").className = "status";
        try {
          await api("/api/partner/order-assign", { method: "POST", json: true, body: JSON.stringify({ id: orderId, vehicleId: vehicleId, driverId: driverId }) });
          await loadOrders();
          openOrderDetail(orderId);
        } catch (e) {
          $("assignStatus").textContent = "Could not save. Try again.";
          $("assignStatus").className = "status err";
          this.disabled = false;
        }
      });
    }

    var moreBtn = $("odBody").querySelector("#moreBtn");
    if (moreBtn) {
      moreBtn.addEventListener("click", function () {
        $("moreMenu").hidden = !$("moreMenu").hidden;
      });
    }
    var reportNoShowBtn = $("odBody").querySelector("#reportNoShowBtn");
    if (reportNoShowBtn) {
      reportNoShowBtn.addEventListener("click", function () {
        openNoShowView(Number(this.getAttribute("data-order")));
      });
    }
  }

  function closeOrderDetail() {
    $("orderDetailView").hidden = true;
    $("noShowView").hidden = true;
    $("ordersListView").hidden = false;
  }
  $("orderDetailBack").addEventListener("click", closeOrderDetail);
  $("orderDetailView").addEventListener("click", async function (e) {
    var copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) { e.stopPropagation(); handleCopyClick(copyBtn); return; }
    var acc = e.target.closest("[data-accept]");
    var dec = e.target.closest("[data-decline]");
    if (!acc && !dec) return;
    var id = Number((acc || dec).getAttribute(acc ? "data-accept" : "data-decline"));
    var btn = acc || dec;
    btn.disabled = true;
    try {
      await api("/api/partner/respond", { method: "POST", json: true, body: JSON.stringify({ id: id, action: acc ? "accept" : "decline" }) });
      closeOrderDetail();
      loadOrders();
    } catch (err) {
      btn.disabled = false;
    }
  });

  /* ---------- customer no-show report ---------- */
  var NO_SHOW_CATEGORIES = [
    { field: "arrive_on_time", label: "Arrive on time", desc: "Proof that you arrived before the pick-up time — a parking ticket, GPS log, or a timestamped photo." },
    { field: "leave_after_wait", label: "Leave after waiting enough time", desc: "Proof that you left only after the free waiting period had passed." },
    { field: "chat_logs", label: "Chat logs", desc: "Contact the passenger during the waiting time — WhatsApp, SMS or WeChat. The passenger's phone number must be visible, not just a saved contact name." },
    { field: "call_logs", label: "Call logs", desc: "Call the passenger at least 3 times during the waiting time. The passenger's phone number must be visible." },
    { field: "meet_greet", label: "Meet & greet", desc: "A picture of your name/meet sign once you arrived and again before you left, with the time and date visible." },
    { field: "other", label: "Other", desc: "Any other evidence that supports the no-show — a flight-cancellation screenshot, a wrong pick-up location, and so on." },
  ];
  var currentNoShowOrderId = null;

  function noShowCategoryHtml(cat, index, doc) {
    var done = !!doc;
    var pill = done ? '<span class="ns-pill ok">Submitted</span>' : "";
    var body;
    if (done) {
      var icon = doc.hasFile ? FILE_ICON : UPLOAD_ICON;
      var detail = doc.hasFile ? esc(doc.filename || "file") : esc(doc.note || "");
      body = '<div class="ns-cat-body">' +
        '<div class="ns-upload-tile has-file">' + icon + "</div>" +
        '<div class="ns-cat-fields"><div style="font-size:12.5px;color:var(--ink-2);">' + detail + "</div></div>" +
        "</div>";
    } else {
      body = '<div class="ns-cat-body">' +
        '<label class="ns-upload-tile" for="ns-file-' + cat.field + '">' + UPLOAD_ICON +
        '<span style="font-size:10.5px;font-weight:700;">Upload photo</span></label>' +
        '<input type="file" id="ns-file-' + cat.field + '" data-ns-field="' + cat.field + '" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*">' +
        '<div class="ns-cat-fields">' +
        '<textarea rows="2" id="ns-note-' + cat.field + '" placeholder="You can enter a note if there is no evidence"></textarea>' +
        '<button type="button" class="minibtn good" style="align-self:flex-start;" data-ns-submit="' + cat.field + '">Submit</button>' +
        '<p class="status" id="ns-status-' + cat.field + '"></p>' +
        "</div></div>";
    }
    return '<div class="ns-cat' + (done ? " done" : "") + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
      '<div><div class="ns-cat-eyebrow">Step ' + (index + 1) + '</div>' +
      "<h3>" + esc(cat.label) + "</h3>" +
      '<p class="ns-cat-desc">' + esc(cat.desc) + "</p></div>" +
      pill +
      "</div>" + body + "</div>";
  }

  async function renderNoShowCategories() {
    var orderId = currentNoShowOrderId;
    try {
      var data = await api("/api/partner/order-evidence?id=" + orderId);
      var byField = {};
      (data.documents || []).forEach(function (d) { if (!byField[d.field]) byField[d.field] = d; });
      var submittedCount = NO_SHOW_CATEGORIES.filter(function (c) { return byField[c.field]; }).length;

      var html = '<div class="ns-steps">' +
        NO_SHOW_CATEGORIES.map(function (c, i) {
          return '<span class="ns-step-dot' + (byField[c.field] ? " done" : "") + '">' + (byField[c.field] ? "&#10003;" : (i + 1)) + "</span>";
        }).join("") +
        '<span style="margin-left:6px;font-size:12px;color:var(--ink-2);font-weight:700;">' + submittedCount + " of " + NO_SHOW_CATEGORIES.length + " submitted</span>" +
        "</div>";
      html += NO_SHOW_CATEGORIES.map(function (c, i) { return noShowCategoryHtml(c, i, byField[c.field]); }).join("");
      html += '<div style="display:flex;justify-content:flex-end;margin-top:6px;">' +
        '<button type="button" class="minibtn decline" id="nsSendBtn"' + (submittedCount ? "" : " disabled") + '>Send no-show report to admin</button>' +
        "</div>" +
        '<p class="status" id="nsSendStatus" style="text-align:right;"></p>';
      $("noShowBody").innerHTML = html;
      wireNoShowBody();
    } catch (e) {
      $("noShowBody").innerHTML = '<p class="status err">Could not load evidence. Try again.</p>';
    }
  }

  function wireNoShowBody() {
    $("noShowBody").querySelectorAll("[data-ns-submit]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var field = this.getAttribute("data-ns-submit");
        var fileInput = $("ns-file-" + field);
        var note = $("ns-note-" + field).value.trim();
        var statusEl = $("ns-status-" + field);
        var file = fileInput && fileInput.files && fileInput.files[0];
        if (!file && !note) {
          statusEl.textContent = "Add a photo or a note.";
          statusEl.className = "status err";
          return;
        }
        this.disabled = true;
        statusEl.textContent = "";
        statusEl.className = "status";
        try {
          var cat = NO_SHOW_CATEGORIES.filter(function (c) { return c.field === field; })[0];
          var fd = new FormData();
          fd.append("ownerType", "order");
          fd.append("ownerId", String(currentNoShowOrderId));
          fd.append("field", field);
          fd.append("label", cat ? cat.label : field);
          if (file) fd.append("file", file, file.name);
          if (note) fd.append("note", note);
          var res = await fetch("/api/partner/documents", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload_failed");
          await renderNoShowCategories();
        } catch (e) {
          statusEl.textContent = "Could not submit. Try again.";
          statusEl.className = "status err";
          this.disabled = false;
        }
      });
    });

    var sendBtn = $("nsSendBtn");
    if (sendBtn) {
      sendBtn.addEventListener("click", async function () {
        this.disabled = true;
        $("nsSendStatus").textContent = "";
        $("nsSendStatus").className = "status";
        try {
          await api("/api/partner/order-no-show", { method: "POST", json: true, body: JSON.stringify({ id: currentNoShowOrderId }) });
          await loadOrders();
          closeOrderDetail();
        } catch (e) {
          $("nsSendStatus").textContent = "Could not send the report. Try again.";
          $("nsSendStatus").className = "status err";
          this.disabled = false;
        }
      });
    }
  }

  async function openNoShowView(orderId) {
    currentNoShowOrderId = orderId;
    var o = lastOrders.filter(function (x) { return x.id === orderId; })[0];
    $("noShowSub").textContent = o ? ((o.orderNumber ? "Order #" + o.orderNumber + " · " : "") + o.pickup + " → " + o.dropoff) : "";
    $("noShowBody").innerHTML = '<p class="status">Loading…</p>';
    $("ordersListView").hidden = true;
    $("orderDetailView").hidden = true;
    $("noShowView").hidden = false;
    window.scrollTo(0, 0);
    await renderNoShowCategories();
  }

  $("noShowBack").addEventListener("click", function () {
    $("noShowView").hidden = true;
    if (currentNoShowOrderId) openOrderDetail(currentNoShowOrderId);
    else closeOrderDetail();
  });

  /* ---------- fleet & documents ---------- */
  var UPLOAD_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5"/><path d="M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14"/></svg>';
  var FILE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h7l4 4V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M11 2.5V7h4"/></svg>';
  var CAR_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16V11.5a1.5 1.5 0 0 1 .3-.9l1.9-2.5A2 2 0 0 1 7.8 7h8.4a2 2 0 0 1 1.6 1.1l1.9 2.5a1.5 1.5 0 0 1 .3.9V16"/><path d="M4 16a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1H4Zm16 0a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1h3Z"/><circle cx="7.5" cy="16" r="1.3"/><circle cx="16.5" cy="16" r="1.3"/></svg>';
  var PERSON_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.2" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  var PLUS_ICON = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';

  function statusBarClass(status) {
    if (status === "approved") return "ok";
    if (status === "rejected") return "rejected";
    return "pending";
  }
  function statusTextClass(status) {
    if (status === "approved") return "doc-status-ok";
    if (status === "rejected") return "doc-status-rejected";
    return "doc-status-pending";
  }
  function statusLabel(status) {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return "Pending review";
  }

  var fleetTab = "vehicles";
  // null, or { type: "vehicle"|"driver", id: Number|null } — id is null while adding, before "Create" is pressed.
  var currentForm = null;
  // Files picked on the Add screen before the vehicle/driver record exists yet, keyed by field id.
  // { [field]: { file: File, label: String } }
  var pendingUploads = { vehicle: {}, driver: {} };

  // Latest document for each slot "field", keyed by field (docs already come back newest-first).
  function latestByField(docs) {
    var map = {};
    (docs || []).forEach(function (d) { if (!map[d.field]) map[d.field] = d; });
    return map;
  }

  // One clickable upload tile for a single document slot. ownerId may be null (company/other).
  function docTileHtml(ownerType, ownerId, field, label, required, doc) {
    var uid = ownerType + "-" + (ownerId || "x") + "-" + field;
    var hasFile = !!doc;
    var needsAttention = required && !hasFile;
    var icon = hasFile ? FILE_ICON : UPLOAD_ICON;
    var body = hasFile
      ? '<div class="doc-tile-label">' + esc(label) + '</div>' +
        '<div class="doc-tile-file">' + esc(doc.filename || "file") + '</div>' +
        '<span class="doc-tile-status ' + statusTextClass(doc.status) + '">' + esc(statusLabel(doc.status)) + '</span>'
      : '<div class="doc-tile-label">' + esc(label) + '</div>' +
        (required ? '<span class="doc-required">Required</span>' : '<span class="doc-optional">Optional</span>');
    return '<div class="doc-item">' +
      '<label class="doc-tile' + (hasFile ? " has-file" : "") + (needsAttention ? " needed" : "") + '" for="file-' + uid + '">' +
      '<div class="doc-tile-icon">' + icon + '</div>' +
      '<div class="doc-tile-body">' + body + '</div>' +
      '<div class="doc-tile-bar' + (hasFile ? " " + statusBarClass(doc.status) : "") + '"></div>' +
      '</label>' +
      '<input type="file" id="file-' + uid + '" data-uid="' + uid + '" data-owner-type="' + ownerType + '"' +
      (ownerId ? ' data-owner-id="' + ownerId + '"' : "") +
      ' data-field="' + esc(field) + '" data-label="' + esc(label) + '" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*">' +
      (hasFile ? '<a class="doc-view" href="/api/partner/file?id=' + doc.id + '" target="_blank" rel="noopener">View file</a>' +
        (doc.reviewNote ? '<div class="doc-note">' + esc(doc.reviewNote) + "</div>" : "") : "") +
      "</div>";
  }

  // A grid of fixed required/optional slots for a given owner (company/vehicle/driver).
  function slotGridHtml(ownerType, ownerId, defs, docs) {
    var byField = latestByField(docs);
    return defs.map(function (d) { return docTileHtml(ownerType, ownerId, d.id, d.label, d.required, byField[d.id]); }).join("");
  }

  // Free-form "other documents": one tile per already-uploaded custom doc, plus a trailing "+" tile to add a new one.
  function otherGridHtml(docs) {
    var tiles = (docs || []).map(function (d) {
      return docTileHtml("other", null, d.field, d.label, false, d);
    }).join("");
    tiles += '<div class="doc-item">' +
      '<label class="doc-tile doc-tile-add" for="file-other-x-__custom__">' +
      '<div class="doc-tile-icon">' + PLUS_ICON + '</div>' +
      '<div class="doc-tile-body"><div class="doc-tile-label">Add document</div></div>' +
      '<div class="doc-tile-bar"></div>' +
      "</label>" +
      '<input type="file" id="file-other-x-__custom__" data-uid="other-x-__custom__" data-owner-type="other" data-field="__custom__" hidden ' +
      'accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*">' +
      "</div>";
    return tiles;
  }

  function vehicleDocSlots(country) {
    return [{ id: "photo", label: "Vehicle photo", required: true }].concat(expandSlots(slotsFor(country, "vehicle")));
  }

  // A tile for a document that hasn't been uploaded yet (used on the Add screen,
  // before the vehicle/driver record — and therefore an owner id — exists).
  // Picking a file just stores it in memory; it's actually uploaded once the
  // record is created.
  function pendingDocTileHtml(ownerType, field, label, required, pending) {
    var uid = "pending-" + ownerType + "-" + field;
    var hasFile = !!pending;
    var icon = hasFile ? FILE_ICON : UPLOAD_ICON;
    var body = hasFile
      ? '<div class="doc-tile-label">' + esc(label) + '</div>' +
        '<div class="doc-tile-file">' + esc(pending.file.name) + "</div>"
      : '<div class="doc-tile-label">' + esc(label) + '</div>' +
        (required ? '<span class="doc-required">Required</span>' : '<span class="doc-optional">Optional</span>');
    return '<div class="doc-item">' +
      '<label class="doc-tile' + (hasFile ? " has-file" : "") + '" for="file-' + uid + '">' +
      '<div class="doc-tile-icon">' + icon + '</div>' +
      '<div class="doc-tile-body">' + body + '</div>' +
      '<div class="doc-tile-bar' + (hasFile ? " selected" : "") + '"></div>' +
      '</label>' +
      '<input type="file" id="file-' + uid + '" data-pending-uid="' + uid + '" data-pending-owner="' + ownerType + '"' +
      ' data-field="' + esc(field) + '" data-label="' + esc(label) + '" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*">' +
      "</div>";
  }
  function pendingGridHtml(ownerType, defs, pendingMap) {
    return defs.map(function (d) { return pendingDocTileHtml(ownerType, d.id, d.label, d.required, pendingMap[d.id]); }).join("");
  }

  function imageDocThumb(doc, placeholderIcon) {
    if (doc) return '<img src="/api/partner/file?id=' + doc.id + '" alt="">';
    return placeholderIcon;
  }

  function vehicleCardHtml(v) {
    var byField = latestByField(v.documents);
    var photo = byField["photo"];
    var sub = [v.make, v.plate].filter(Boolean).join(" · ") || "Untitled vehicle";
    return '<div class="fleet-card" data-vehicle-open="' + v.id + '">' +
      '<div class="fleet-card-thumb">' + imageDocThumb(photo, CAR_ICON) + "</div>" +
      '<div><div class="fleet-card-name">' + esc(v.plate || v.make || ("Vehicle #" + v.id)) + '</div>' +
      '<div class="fleet-card-sub">' + esc(sub) + "</div></div>" +
      '<div class="fleet-card-foot">' + badge(v.status) + "</div>" +
      "</div>";
  }

  function driverCardHtml(d) {
    var byField = latestByField(d.documents);
    var license = byField["license_front"];
    return '<div class="fleet-card" data-driver-open="' + d.id + '">' +
      '<div class="fleet-card-thumb">' + imageDocThumb(license, PERSON_ICON) + "</div>" +
      '<div><div class="fleet-card-name">' + esc(d.fullName || ("Driver #" + d.id)) + '</div>' +
      '<div class="fleet-card-sub">' + esc(d.phone || "") + "</div></div>" +
      '<div class="fleet-card-foot">' + badge(d.status) + "</div>" +
      "</div>";
  }

  function renderFleetList() {
    var country = me ? me.country : null;
    var data = myFleet;

    $("companyDocGrid").innerHTML = slotGridHtml("company", null, slotsFor(country, "company"), data.company.documents);
    $("otherDocGrid").innerHTML = otherGridHtml(data.other.documents);

    $("countVehicles").textContent = data.vehicles.length || "";
    $("countDrivers").textContent = data.drivers.length || "";

    $("vehicleCards").innerHTML = data.vehicles.map(vehicleCardHtml).join("") +
      '<div class="fleet-card-add" data-vehicle-add="1"><span class="fleet-card-add-icon">+</span>Add vehicle</div>';

    $("driverCards").innerHTML = data.drivers.map(driverCardHtml).join("") +
      '<div class="fleet-card-add" data-driver-add="1"><span class="fleet-card-add-icon">+</span>Add driver</div>';

    updateDocAlerts();
  }

  // Whether any required company-document slot still has no approved file
  // (missing entirely, or uploaded but pending/rejected).
  function companyDocsNeedAttention(country, docs) {
    var byField = latestByField(docs);
    return slotsFor(country, "company").some(function (d) {
      if (!d.required) return false;
      var doc = byField[d.id];
      return !doc || doc.status !== "approved";
    });
  }

  // Sidebar dots + Company banner: cleared automatically once an admin approves
  // the relevant documents (myFleet is reloaded after every upload/review).
  function updateDocAlerts() {
    var country = me ? me.country : null;
    var companyNeeds = companyDocsNeedAttention(country, myFleet.company.documents);
    var fleetNeeds = !myFleet.vehicles.length || !myFleet.drivers.length ||
      myFleet.vehicles.some(function (v) { return v.status !== "approved"; }) ||
      myFleet.drivers.some(function (d) { return d.status !== "approved"; });
    if ($("companyTabDot")) $("companyTabDot").hidden = !companyNeeds;
    if ($("fleetTabDot")) $("fleetTabDot").hidden = !fleetNeeds;
    if ($("companyDocAlert")) $("companyDocAlert").hidden = !companyNeeds;
  }

  async function loadFleet() {
    var data = await api("/api/partner/fleet");
    myFleet = { company: data.company, other: data.other, vehicles: data.vehicles || [], drivers: data.drivers || [] };
    renderFleetList();
    if (currentForm && currentForm.id) {
      if (currentForm.type === "vehicle") renderVehicleForm();
      else renderDriverForm();
    }
  }

  /* ---------- fleet sub-tabs (Company / Vehicles / Drivers) ---------- */
  $("fleetTabs").querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("fleetTabs").querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      fleetTab = tab.getAttribute("data-fleet-tab");
      ["vehicles", "drivers"].forEach(function (k) { $("fleetTab-" + k).hidden = k !== fleetTab; });
    });
  });

  $("vehicleCards").addEventListener("click", function (e) {
    var add = e.target.closest("[data-vehicle-add]");
    if (add) { openVehicleForm(null); return; }
    var open = e.target.closest("[data-vehicle-open]");
    if (open) openVehicleForm(Number(open.getAttribute("data-vehicle-open")));
  });
  $("driverCards").addEventListener("click", function (e) {
    var add = e.target.closest("[data-driver-add]");
    if (add) { openDriverForm(null); return; }
    var open = e.target.closest("[data-driver-open]");
    if (open) openDriverForm(Number(open.getAttribute("data-driver-open")));
  });

  /* ---------- vehicle full-page view (add + view/edit) ---------- */
  function openVehicleForm(id) {
    currentForm = { type: "vehicle", id: id };
    if (id == null) pendingUploads.vehicle = {};
    $("fleetListView").hidden = true;
    $("driverFormView").hidden = true;
    $("vehicleFormView").hidden = false;
    $("vfStatus").textContent = "";
    window.scrollTo(0, 0);
    renderVehicleForm();
  }
  function renderVehicleForm() {
    var country = me ? me.country : null;
    var v = currentForm.id ? myFleet.vehicles.filter(function (x) { return x.id === currentForm.id; })[0] : null;

    if (!v) {
      $("vfTitle").textContent = "Add vehicle";
      $("vfStatusBadge").innerHTML = "";
      $("vfMake").value = ""; $("vfPlate").value = "";
      $("vfMake").disabled = false; $("vfPlate").disabled = false;
      $("vfCreateBtn").hidden = false;
      $("vfSaveBtn").hidden = true;
      $("vfDocsSection").hidden = false;
      $("vfDocGrid").innerHTML = pendingGridHtml("vehicle", vehicleDocSlots(country), pendingUploads.vehicle);
      return;
    }

    $("vfTitle").textContent = v.plate || v.make || ("Vehicle #" + v.id);
    $("vfStatusBadge").innerHTML = badge(v.status);
    $("vfMake").value = v.make || ""; $("vfPlate").value = v.plate || "";
    $("vfCreateBtn").hidden = true;
    $("vfSaveBtn").hidden = false;
    $("vfDocsSection").hidden = false;
    $("vfDocGrid").innerHTML = slotGridHtml("vehicle", v.id, vehicleDocSlots(country), v.documents);
  }
  $("vfCreateBtn").addEventListener("click", async function () {
    var make = $("vfMake").value.trim(), plate = $("vfPlate").value.trim();
    if (!plate) { $("vfStatus").textContent = "Plate number is required."; $("vfStatus").className = "status err"; $("vfPlate").focus(); return; }
    this.disabled = true;
    $("vfStatus").textContent = "Creating…";
    $("vfStatus").className = "status";
    try {
      var r = await api("/api/partner/vehicles", { method: "POST", json: true, body: JSON.stringify({ make: make, plate: plate }) });
      currentForm.id = r.id;

      var pending = pendingUploads.vehicle;
      var fields = Object.keys(pending);
      var failed = [];
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i], entry = pending[field];
        try {
          var fd = new FormData();
          fd.append("ownerType", "vehicle");
          fd.append("ownerId", r.id);
          fd.append("field", field);
          fd.append("label", entry.label);
          fd.append("file", entry.file, entry.file.name);
          var res = await fetch("/api/partner/documents", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload_failed");
        } catch (err) { failed.push(entry.label); }
      }
      pendingUploads.vehicle = {};

      await loadFleet();
      renderVehicleForm();
      if (failed.length) {
        $("vfStatus").textContent = "Vehicle created. Could not upload: " + failed.join(", ") + " — try those again below.";
        $("vfStatus").className = "status err";
      } else {
        $("vfStatus").textContent = "Vehicle created.";
        $("vfStatus").className = "status";
      }
    } catch (e) {
      $("vfStatus").textContent = "Could not create the vehicle. Try again.";
      $("vfStatus").className = "status err";
    } finally { this.disabled = false; }
  });
  $("vfSaveBtn").addEventListener("click", async function () {
    var make = $("vfMake").value.trim(), plate = $("vfPlate").value.trim();
    if (!plate) { $("vfStatus").textContent = "Plate number is required."; $("vfStatus").className = "status err"; $("vfPlate").focus(); return; }
    this.disabled = true;
    try {
      await api("/api/partner/vehicle-update", { method: "POST", json: true, body: JSON.stringify({ id: currentForm.id, make: make, plate: plate }) });
      $("vfStatus").textContent = "Saved.";
      $("vfStatus").className = "status";
      await loadFleet();
      renderVehicleForm();
    } catch (e) {
      $("vfStatus").textContent = "Could not save changes. Try again.";
      $("vfStatus").className = "status err";
    } finally { this.disabled = false; }
  });
  function closeVehicleForm() {
    currentForm = null;
    pendingUploads.vehicle = {};
    $("vehicleFormView").hidden = true;
    $("fleetListView").hidden = false;
  }
  $("vehicleFormBack").addEventListener("click", closeVehicleForm);

  /* ---------- driver full-page view (add + view/edit) ---------- */
  function openDriverForm(id) {
    currentForm = { type: "driver", id: id };
    if (id == null) pendingUploads.driver = {};
    $("fleetListView").hidden = true;
    $("vehicleFormView").hidden = true;
    $("driverFormView").hidden = false;
    $("dfStatus").textContent = "";
    window.scrollTo(0, 0);
    renderDriverForm();
  }
  function renderDriverForm() {
    var country = me ? me.country : null;
    var d = currentForm.id ? myFleet.drivers.filter(function (x) { return x.id === currentForm.id; })[0] : null;

    if (!d) {
      $("dfTitle").textContent = "Add driver";
      $("dfStatusBadge").innerHTML = "";
      $("dfName").value = ""; $("dfPhone").value = ""; $("dfLanguage").value = "";
      $("dfCreateBtn").hidden = false;
      $("dfSaveBtn").hidden = true;
      $("dfDocsSection").hidden = false;
      $("dfDocGrid").innerHTML = pendingGridHtml("driver", slotsFor(country, "driver"), pendingUploads.driver);
      return;
    }

    $("dfTitle").textContent = d.fullName || ("Driver #" + d.id);
    $("dfStatusBadge").innerHTML = badge(d.status);
    $("dfName").value = d.fullName || ""; $("dfPhone").value = d.phone || ""; $("dfLanguage").value = d.language || "";
    $("dfCreateBtn").hidden = true;
    $("dfSaveBtn").hidden = false;
    $("dfDocsSection").hidden = false;
    $("dfDocGrid").innerHTML = slotGridHtml("driver", d.id, slotsFor(country, "driver"), d.documents);
  }
  $("dfCreateBtn").addEventListener("click", async function () {
    var name = $("dfName").value.trim(), phone = $("dfPhone").value.trim(), language = $("dfLanguage").value.trim();
    if (!name) { $("dfStatus").textContent = "Name is required."; $("dfStatus").className = "status err"; $("dfName").focus(); return; }
    this.disabled = true;
    $("dfStatus").textContent = "Creating…";
    $("dfStatus").className = "status";
    try {
      var r = await api("/api/partner/drivers", { method: "POST", json: true, body: JSON.stringify({ fullName: name, phone: phone, language: language }) });
      currentForm.id = r.id;

      var pending = pendingUploads.driver;
      var fields = Object.keys(pending);
      var failed = [];
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i], entry = pending[field];
        try {
          var fd = new FormData();
          fd.append("ownerType", "driver");
          fd.append("ownerId", r.id);
          fd.append("field", field);
          fd.append("label", entry.label);
          fd.append("file", entry.file, entry.file.name);
          var res = await fetch("/api/partner/documents", { method: "POST", body: fd });
          if (!res.ok) throw new Error("upload_failed");
        } catch (err) { failed.push(entry.label); }
      }
      pendingUploads.driver = {};

      await loadFleet();
      renderDriverForm();
      if (failed.length) {
        $("dfStatus").textContent = "Driver created. Could not upload: " + failed.join(", ") + " — try those again below.";
        $("dfStatus").className = "status err";
      } else {
        $("dfStatus").textContent = "Driver created.";
        $("dfStatus").className = "status";
      }
    } catch (e) {
      $("dfStatus").textContent = "Could not create the driver. Try again.";
      $("dfStatus").className = "status err";
    } finally { this.disabled = false; }
  });
  $("dfSaveBtn").addEventListener("click", async function () {
    var name = $("dfName").value.trim(), phone = $("dfPhone").value.trim(), language = $("dfLanguage").value.trim();
    if (!name) { $("dfStatus").textContent = "Name is required."; $("dfStatus").className = "status err"; $("dfName").focus(); return; }
    this.disabled = true;
    try {
      await api("/api/partner/driver-update", { method: "POST", json: true, body: JSON.stringify({ id: currentForm.id, fullName: name, phone: phone, language: language }) });
      $("dfStatus").textContent = "Saved.";
      $("dfStatus").className = "status";
      await loadFleet();
      renderDriverForm();
    } catch (e) {
      $("dfStatus").textContent = "Could not save changes. Try again.";
      $("dfStatus").className = "status err";
    } finally { this.disabled = false; }
  });
  function closeDriverForm() {
    currentForm = null;
    pendingUploads.driver = {};
    $("driverFormView").hidden = true;
    $("fleetListView").hidden = false;
  }
  $("driverFormBack").addEventListener("click", closeDriverForm);

  document.body.addEventListener("change", async function (e) {
    var input = e.target.closest("input[type=file][data-uid]");
    if (!input) return;
    var file = input.files && input.files[0];
    if (!file) return;

    var ownerType = input.getAttribute("data-owner-type");
    var ownerIdAttr = input.getAttribute("data-owner-id");
    var ownerId = ownerIdAttr ? Number(ownerIdAttr) : null;
    var field = input.getAttribute("data-field");
    var label = input.getAttribute("data-label") || field;
    var tile = input.previousElementSibling;

    if (field === "__custom__") {
      var customLabel = window.prompt("Document name:", "Document");
      if (!customLabel || !customLabel.trim()) { input.value = ""; return; }
      label = customLabel.trim().slice(0, 150);
      field = "custom_" + Date.now();
    }

    if (!typeFor(file)) { alert("Unsupported file type. Use PDF, JPG, PNG, WEBP or GIF."); input.value = ""; return; }
    if (file.size > MAX_BYTES) { alert("File larger than 20 MB."); input.value = ""; return; }

    if (tile) tile.classList.add("uploading");
    try {
      var fd = new FormData();
      fd.append("ownerType", ownerType);
      if (ownerId) fd.append("ownerId", ownerId);
      fd.append("field", field);
      fd.append("label", label);
      fd.append("file", file, file.name);
      var res = await fetch("/api/partner/documents", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload_failed");
      await loadFleet();
    } catch (err) {
      if (tile) tile.classList.remove("uploading");
      input.value = "";
      alert("Upload failed. Try again.");
    }
  });

  // Picking a file on the Add-vehicle/Add-driver screen, before the record exists:
  // just hold onto it in memory and re-render that one tile — it's uploaded for
  // real once "Create vehicle"/"Create driver" is pressed.
  document.body.addEventListener("change", function (e) {
    var input = e.target.closest("input[type=file][data-pending-uid]");
    if (!input) return;
    var file = input.files && input.files[0];
    if (!file) return;

    if (!typeFor(file)) { alert("Unsupported file type. Use PDF, JPG, PNG, WEBP or GIF."); input.value = ""; return; }
    if (file.size > MAX_BYTES) { alert("File larger than 20 MB."); input.value = ""; return; }

    var ownerType = input.getAttribute("data-pending-owner");
    var field = input.getAttribute("data-field");
    var label = input.getAttribute("data-label") || field;
    pendingUploads[ownerType][field] = { file: file, label: label };

    if (ownerType === "vehicle") renderVehicleForm(); else renderDriverForm();
  });

  /* ---------- boot ---------- */
  (async function () {
    try {
      await loadMe();
      await Promise.all([loadOrders(), loadFleet()]);
    } catch (e) {
      // loadMe already redirects to /login.html on 401
    }
  })();

  /* ---------- live updates: poll orders every 5s, pause while the tab is hidden ---------- */
  var POLL_MS = 5000;
  var pollTimer = setInterval(function () {
    if (document.hidden) return;
    loadOrders(true);
  }, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) loadOrders(true);
  });
})();
