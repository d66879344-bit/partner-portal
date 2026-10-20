(function () {
  var $ = function (id) { return document.getElementById(id); };
  var secret = "";
  var partners = [];
  var orders = [];
  var detailCache = {};
  var openId = null;
  var openOrderId = null;
  var STAGE_LABELS = { on_the_way: "On the way", arrived: "Arrived at pickup", in_car: "Passenger on board", dropped_off: "Dropped off" };
  var orderNumberManual = false;
  var bufferManual = false;

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
  function badge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + "</span>";
  }
  function fileUrl(id) {
    return "/api/admin/partner-file?secret=" + encodeURIComponent(secret) + "&id=" + id;
  }
  function downloadUrl(id) {
    return fileUrl(id) + "&dl=1";
  }

  async function api(path, opts) {
    var sep = path.indexOf("?") === -1 ? "?" : "&";
    var res = await fetch(path + sep + "secret=" + encodeURIComponent(secret), opts);
    if (res.status === 401) throw new Error("unauthorized");
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "request_failed");
    return data;
  }

  /* ---------- tabs ---------- */
  $("mainTabs").querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("mainTabs").querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + tab.getAttribute("data-tab")); });
    });
  });

  /* ---------- order sub-tabs (Not accepted / In progress / Completed / Declined-cancelled) ---------- */
  var orderTab = "offered";
  $("orderTabs").querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("orderTabs").querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      orderTab = tab.getAttribute("data-order-tab");
      renderOrders();
    });
  });

  /* ---------- partners ---------- */
  async function loadPartners() {
    $("partnersStatus").textContent = "Loading…";
    $("partnersStatus").className = "status";
    try {
      var data = await api("/api/admin/partners");
      partners = data.partners || [];
      populatePartnersCountryFilter();
      renderPartners();
      populatePartnerSelect();
      populateOrderPartnerFilter();
      populateFinancePartnerFilter();
      renderFinance();
      $("partnersStatus").textContent = partners.length + " partner(s)";
    } catch (e) {
      if (e.message === "unauthorized") {
        $("gateStatus").textContent = "Wrong password.";
        showGate();
      } else {
        $("partnersStatus").textContent = "Could not load partners.";
        $("partnersStatus").className = "status err";
      }
    }
  }

  function matchesPartnerFilter(p) {
    var fs = $("fStatus").value, fc = $("fCountry").value, ft = $("fTrialState").value;
    if (fs && p.status !== fs) return false;
    if (fc && p.country !== fc) return false;
    if (ft) {
      var info = window.TrialInfo ? TrialInfo.compute(p.trialStartedAt) : { state: "not_started" };
      if (info.state !== ft) return false;
    }
    return true;
  }

  function trialPillHtml(startedAt) {
    if (!window.TrialInfo) return "—";
    var info = TrialInfo.compute(startedAt);
    if (info.state === "not_started") {
      return '<span class="badge badge-not_started">Not started</span>';
    }
    var label = info.state === "ended" ? "Ended" : "Day " + info.dayNumber + "/" + TrialInfo.TRIAL_DAYS;
    var pct = Math.max(0, Math.min(100, Math.round((info.dayNumber / TrialInfo.TRIAL_DAYS) * 100)));
    return '<div class="trial-pill">' +
      '<span class="trial-pill-badge badge badge-' + info.state + '">' + esc(label) + "</span>" +
      '<div class="trial-bar-track" style="width:70px;margin-top:4px;"><div class="trial-bar-fill' +
      (info.state === "ending" ? " ending" : info.state === "ended" ? " ended" : "") +
      '" style="width:' + pct + '%;"></div></div>' +
      "</div>";
  }

  function populatePartnersCountryFilter() {
    var prev = $("fCountry").value;
    var seen = {};
    var rows = [];
    partners.forEach(function (p) {
      if (!p.country || seen[p.country]) return;
      seen[p.country] = true;
      rows.push([p.country, p.countryName || p.country]);
    });
    rows.sort(function (a, b) { return a[1].localeCompare(b[1]); });
    $("fCountry").innerHTML = '<option value="">All countries</option>' +
      rows.map(function (r) { return '<option value="' + esc(r[0]) + '">' + esc(r[1]) + "</option>"; }).join("");
    $("fCountry").value = prev;
  }

  function renderPartners() {
    var rows = partners.filter(matchesPartnerFilter);
    if (!rows.length) { $("partnersList").innerHTML = '<tr><td colspan="7" class="empty-cell">No matching partners.</td></tr>'; return; }
    $("partnersList").innerHTML = rows.map(function (p) {
      var isOpen = openId === p.id;
      return '<tr class="data-row" data-toggle="' + p.id + '">' +
        '<td class="col-main">' + esc(p.companyName) + "</td>" +
        "<td>" + esc(p.email) + "</td>" +
        "<td>" + esc(p.countryName || p.country) + "</td>" +
        '<td class="mono">' + esc(fmtDate(p.createdAt)) + "</td>" +
        "<td>" + badge(p.status) + "</td>" +
        "<td>" + trialPillHtml(p.trialStartedAt) + "</td>" +
        '<td class="col-chev">' + (isOpen ? "▾" : "›") + "</td>" +
        "</tr>" +
        '<tr><td colspan="7" class="detail-cell"><div class="detail' + (isOpen ? " open" : "") + '" id="detail-' + p.id + '"></div></td></tr>';
    }).join("");
    if (openId != null) renderDetail(openId);
  }

  $("partnersList").addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-toggle]");
    if (!toggle) return;
    var id = Number(toggle.getAttribute("data-toggle"));
    openId = openId === id ? null : id;
    renderPartners();
  });

  async function renderDetail(id) {
    var el = $("detail-" + id);
    if (!el) return;
    if (!detailCache[id]) {
      el.innerHTML = "Loading…";
      try {
        detailCache[id] = await api("/api/admin/partner-detail?id=" + id);
      } catch (e) {
        el.innerHTML = "Could not load details.";
        return;
      }
    }
    var d = detailCache[id];
    var p = d.partner;

    function docList(docs) {
      if (!docs.length) return '<p class="docrow" style="color:var(--ink-2);">No documents.</p>';
      return docs.map(function (doc) {
        return '<div class="docrow"><div class="docrow-main">' + esc(doc.label) +
          ' · <a href="' + fileUrl(doc.id) + '" target="_blank" rel="noopener">' + esc(doc.filename || "file") + "</a>" +
          ' · <a href="' + downloadUrl(doc.id) + '" download>Download</a> ' + badge(doc.status) + "</div>" +
          '<div class="docrow-actions">' +
          '<button type="button" class="minibtn good" data-doc-approve="' + doc.id + '">Approve</button>' +
          '<button type="button" class="minibtn crit" data-doc-reject="' + doc.id + '">Reject</button>' +
          "</div></div>";
      }).join("");
    }

    var vehicleBlocks = d.vehicles.map(function (v, i) {
      var sub = [v.make, v.category].filter(Boolean).join(", ");
      return '<div class="block"><div class="block-title">Vehicle ' + (i + 1) + (v.plate ? " — " + esc(v.plate) : "") + (sub ? " (" + esc(sub) + ")" : "") + "</div>" + docList(v.documents) + "</div>";
    }).join("");
    var driverBlocks = d.drivers.map(function (dr, i) {
      var sub = [dr.phone, dr.language].filter(Boolean).join(" · ");
      return '<div class="block"><div class="block-title">Driver ' + (i + 1) + (dr.fullName ? " — " + esc(dr.fullName) : "") + (sub ? " (" + esc(sub) + ")" : "") + "</div>" + docList(dr.documents) + "</div>";
    }).join("");

    el.innerHTML =
      '<div class="block"><div class="block-title">Contact</div>' +
      '<div class="row-meta">' + esc(p.contactName || "—") + (p.phone ? " · " + esc(p.phone) : "") + (p.accountId ? ' · <span class="mono">' + esc(p.accountId) + "</span>" : "") + "</div>" +
      (p.serviceCity || (p.airports && p.airports.length) ? '<div class="row-meta">' + esc(p.serviceCity || "") + (p.airports && p.airports.length ? (p.serviceCity ? " · " : "") + "Airports: " + esc(p.airports.join(", ")) : "") + "</div>" : "") +
      '<div class="row-meta">Registered ' + esc(fmtDate(p.createdAt)) + (p.activatedAt ? " · activated " + esc(fmtDate(p.activatedAt)) : "") + "</div>" +
      (p.status === "pending" ? '<div class="row-meta">Account can sign in, but documents are not yet reviewed — it will not receive orders until activated.</div>' : "") +
      (p.adminNote ? '<div class="row-meta">Note: ' + esc(p.adminNote) + "</div>" : "") +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="minibtn good" data-partner-approve="' + p.id + '">Activate account</button>' +
      '<button type="button" class="minibtn crit" data-partner-reject="' + p.id + '">Block account</button>' +
      '<button type="button" class="minibtn ghost-crit" data-partner-delete="' + p.id + '" data-partner-name="' + esc(p.companyName) + '" style="margin-left:auto;">Delete partner</button>' +
      "</div></div>" +
      '<div class="block"><div class="block-title">Company documents</div>' + docList(d.company.documents) + "</div>" +
      vehicleBlocks +
      driverBlocks +
      (d.other.documents.length ? '<div class="block"><div class="block-title">Other</div>' + docList(d.other.documents) + "</div>" : "");
  }

  $("partnersList").addEventListener("click", async function (e) {
    var approveDoc = e.target.closest("[data-doc-approve]");
    var rejectDoc = e.target.closest("[data-doc-reject]");
    var approveP = e.target.closest("[data-partner-approve]");
    var rejectP = e.target.closest("[data-partner-reject]");
    var deleteP = e.target.closest("[data-partner-delete]");
    if (!approveDoc && !rejectDoc && !approveP && !rejectP && !deleteP) return;
    e.stopPropagation();

    if (deleteP) {
      var delPid = Number(deleteP.getAttribute("data-partner-delete"));
      var delPname = deleteP.getAttribute("data-partner-name") || "";
      var typed = prompt(
        "This permanently deletes \"" + delPname + "\" and all of their vehicles, drivers, documents and orders. " +
        "This cannot be undone.\n\nType the company name exactly to confirm:"
      );
      if (typed === null) return;
      if (typed.trim() !== delPname.trim()) {
        alert("Name didn't match — nothing was deleted.");
        return;
      }
      try {
        await api("/api/admin/partner-delete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: delPid })
        });
        delete detailCache[delPid];
        openId = null;
        await loadPartners();
      } catch (err) {
        alert("Could not delete the partner.");
      }
      return;
    }

    try {
      if (approveDoc || rejectDoc) {
        var docId = (approveDoc || rejectDoc).getAttribute(approveDoc ? "data-doc-approve" : "data-doc-reject");
        await api("/api/admin/document-status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: Number(docId), status: approveDoc ? "approved" : "rejected" })
        });
        delete detailCache[openId];
        renderDetail(openId);
      } else {
        var pid = Number((approveP || rejectP).getAttribute(approveP ? "data-partner-approve" : "data-partner-reject"));
        await api("/api/admin/partner-status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pid, status: approveP ? "active" : "blocked" })
        });
        delete detailCache[pid];
        await loadPartners();
        openId = pid;
        renderPartners();
      }
    } catch (err) {
      alert("Could not update. Try again.");
    }
  });

  $("fStatus").addEventListener("change", renderPartners);
  $("fCountry").addEventListener("change", renderPartners);
  $("fTrialState").addEventListener("change", renderPartners);

  /* ---------- orders: create form ---------- */
  function populatePartnerSelect() {
    var active = partners.filter(function (p) { return p.status === "active"; });
    $("opPartner").innerHTML = active.length
      ? active.map(function (p) { return '<option value="' + p.id + '">' + esc(p.companyName) + "</option>"; }).join("")
      : '<option value="">No active partners yet</option>';
    if (!orderNumberManual) regenerateOrderNumberForSelectedPartner();
  }

  /* ---------- order number: auto-generate [city code][4 digits][2 letters][4 digits] ---------- */
  var ORDER_NUMBER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function randDigits(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
  }
  function randLetters(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += ORDER_NUMBER_LETTERS.charAt(Math.floor(Math.random() * ORDER_NUMBER_LETTERS.length));
    return s;
  }
  function orderNumberExists(num) {
    return orders.some(function (o) { return o.orderNumber === num; });
  }
  function generateOrderNumber(cityCode) {
    var candidate, attempts = 0;
    do {
      candidate = cityCode + randDigits(4) + randLetters(2) + randDigits(4);
      attempts++;
    } while (orderNumberExists(candidate) && attempts < 20);
    return candidate;
  }
  function regenerateOrderNumberForSelectedPartner() {
    var partnerId = Number($("opPartner").value);
    if (!partnerId) return;
    var p = partners.filter(function (x) { return x.id === partnerId; })[0];
    var cityCode = (window.CityCodes && window.CityCodes.codeFor(p && p.serviceCity)) || "XX";
    $("opOrderNumber").value = generateOrderNumber(cityCode);
  }
  $("opPartner").addEventListener("change", function () {
    if (!orderNumberManual) regenerateOrderNumberForSelectedPartner();
  });
  $("opOrderNumber").addEventListener("input", function () {
    orderNumberManual = true;
  });

  /* ---------- waiting time: auto 60 min with a flight number, 15 min without ---------- */
  function computeAutoBuffer() {
    return $("opFlight").value.trim() ? 60 : 15;
  }
  function applyAutoBuffer() {
    if (!bufferManual) $("opBuffer").value = computeAutoBuffer();
  }
  $("opFlight").addEventListener("input", applyAutoBuffer);
  $("opBuffer").addEventListener("input", function () {
    bufferManual = true;
  });
  applyAutoBuffer();

  function populateOrderPartnerFilter() {
    var prev = $("fOrderPartner").value;
    var sorted = partners.slice().sort(function (a, b) { return a.companyName.localeCompare(b.companyName); });
    $("fOrderPartner").innerHTML = '<option value="">All partners</option>' +
      sorted.map(function (p) { return '<option value="' + p.id + '">' + esc(p.companyName) + "</option>"; }).join("");
    $("fOrderPartner").value = prev;
  }

  /* ---------- finance ---------- */
  function populateFinancePartnerFilter() {
    var prev = $("finPartner").value;
    var sorted = partners.slice().sort(function (a, b) { return a.companyName.localeCompare(b.companyName); });
    $("finPartner").innerHTML = '<option value="">All partners</option>' +
      sorted.map(function (p) { return '<option value="' + p.id + '">' + esc(p.companyName) + "</option>"; }).join("");
    $("finPartner").value = prev;
  }
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
  function renderFinance() {
    var rows = orders.filter(function (o) { return o.status === "completed"; });
    var partnerFilter = $("finPartner").value;
    if (partnerFilter) rows = rows.filter(function (o) { return String(o.partnerId) === partnerFilter; });
    var from = $("finDateFrom").value, to = $("finDateTo").value;
    if (from) rows = rows.filter(function (o) { return o.orderDate >= from; });
    if (to) rows = rows.filter(function (o) { return o.orderDate <= to; });
    lastFinanceOrders = rows;

    var totals = {};
    var noShowCount = 0;
    rows.forEach(function (o) {
      if (o.price) {
        var cur = o.currency || "—";
        totals[cur] = (totals[cur] || 0) + Number(o.price);
      }
      if (o.noShowReviewStatus === "confirmed") noShowCount++;
    });
    var partnerCount = {};
    rows.forEach(function (o) { partnerCount[o.partnerId] = true; });

    var cards = '<div class="card stat-card"><div class="stat-label">Completed</div><div class="stat-value mono">' + rows.length + "</div></div>" +
      '<div class="card stat-card"><div class="stat-label">Partners</div><div class="stat-value mono">' + Object.keys(partnerCount).length + "</div></div>";
    Object.keys(totals).sort().forEach(function (cur) {
      cards += '<div class="card stat-card"><div class="stat-label">' + esc(cur) + '</div><div class="stat-value mono">' +
        totals[cur].toLocaleString(undefined, { maximumFractionDigits: 2 }) + "</div></div>";
    });
    cards += '<div class="card stat-card"><div class="stat-label">No-shows (confirmed)</div><div class="stat-value mono">' + noShowCount + "</div></div>";
    $("finStatGrid").innerHTML = cards;

    if (!rows.length) {
      $("financeList").innerHTML = '<tr><td colspan="5" class="empty-cell">No completed orders match these filters.</td></tr>';
      return;
    }

    // Group by partner, each group sorted by date desc, with a subtotal row, then a grand total.
    var byPartner = {};
    rows.forEach(function (o) {
      (byPartner[o.partnerId] = byPartner[o.partnerId] || []).push(o);
    });
    var partnerIds = Object.keys(byPartner).sort(function (a, b) {
      var na = byPartner[a][0].companyName || "", nb = byPartner[b][0].companyName || "";
      return na.localeCompare(nb);
    });
    var html = "";
    var grandTotals = {};
    partnerIds.forEach(function (pid) {
      var group = byPartner[pid].slice().sort(function (a, b) {
        var ka = (a.orderDate || "") + " " + (a.orderTime || "");
        var kb = (b.orderDate || "") + " " + (b.orderTime || "");
        return ka < kb ? 1 : ka > kb ? -1 : 0;
      });
      var subtotals = {};
      group.forEach(function (o) {
        var tag = o.noShowReviewStatus === "confirmed"
          ? ' <span class="badge" style="background:var(--warn-bg);border:1px solid var(--warn-border);color:var(--warn-ink);">no-show</span>'
          : "";
        html += "<tr>" +
          "<td>" + esc(o.companyName) + "</td>" +
          '<td class="mono">' + (o.orderNumber ? "#" + esc(o.orderNumber) : "#" + o.id) + "</td>" +
          '<td class="mono">' + esc(fmtDay(o.orderDate)) + "</td>" +
          "<td>" + esc(o.pickup) + " → " + esc(o.dropoff) + tag + "</td>" +
          '<td class="mono">' + (o.price ? esc(o.price) + " " + esc(o.currency || "") : "—") + "</td>" +
          "</tr>";
        if (o.price) {
          var cur = o.currency || "—";
          subtotals[cur] = (subtotals[cur] || 0) + Number(o.price);
          grandTotals[cur] = (grandTotals[cur] || 0) + Number(o.price);
        }
      });
      var subtotalText = Object.keys(subtotals).sort().map(function (cur) {
        return subtotals[cur].toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + cur;
      }).join(" · ") || "—";
      html += '<tr class="subtotal-row" style="background:var(--surface-2);">' +
        '<td colspan="4" style="font-weight:600;">' + esc(group[0].companyName) + " — subtotal</td>" +
        '<td class="mono" style="font-weight:600;">' + esc(subtotalText) + "</td>" +
        "</tr>";
    });
    var grandText = Object.keys(grandTotals).sort().map(function (cur) {
      return grandTotals[cur].toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + cur;
    }).join(" · ") || "—";
    html += '<tr class="grand-row" style="background:var(--surface-2);border-top:2px solid var(--line-strong);">' +
      '<td colspan="4" style="font-weight:700;">Grand total</td>' +
      '<td class="mono" style="font-weight:700;">' + esc(grandText) + "</td>" +
      "</tr>";
    $("financeList").innerHTML = html;
  }
  $("finPartner").addEventListener("change", renderFinance);
  $("finDateFrom").addEventListener("change", renderFinance);
  $("finDateTo").addEventListener("change", renderFinance);
  $("finExportBtn").addEventListener("click", function () {
    var rows = [["Partner", "Order #", "Date", "Pickup", "Dropoff", "No-show", "Price", "Currency"]];
    lastFinanceOrders.forEach(function (o) {
      rows.push([
        o.companyName, o.orderNumber || o.id, o.orderDate, o.pickup, o.dropoff,
        o.noShowReviewStatus === "confirmed" ? "yes" : "", o.price || "", o.currency || "",
      ]);
    });
    downloadCsv("finance-all-partners.csv", rows);
  });
  $("finPrintBtn").addEventListener("click", function () { window.print(); });

  (function initVehicleTypes() {
    var types = (window.VEHICLE_TYPES || []);
    $("opVehicleType").innerHTML = types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("");
  })();

  $("createOrderBtn").addEventListener("click", async function () {
    var partnerId = Number($("opPartner").value);
    var pickup = $("opPickup").value.trim();
    var dropoff = $("opDropoff").value.trim();
    var orderDate = $("opDate").value;
    if (!$("opOrderNumber").value.trim() || !partnerId || !pickup || !dropoff || !orderDate) {
      $("createOrderStatus").textContent = "Order number, partner, pickup, dropoff and date are required.";
      $("createOrderStatus").className = "status err";
      return;
    }
    this.disabled = true;
    var btn = this;
    var attempts = 0;
    (async function attempt() {
      try {
        await api("/api/admin/orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber: $("opOrderNumber").value.trim(), partnerId: partnerId, pickup: pickup, dropoff: dropoff, orderDate: orderDate,
            flightNumber: $("opFlight").value.trim(), flightTime: $("opFlightTime").value, bufferMinutes: $("opBuffer").value.trim(),
            orderTime: $("opTime").value, vehicleType: $("opVehicleType").value,
            passengers: $("opPassengers").value.trim(), luggage: $("opLuggage").value.trim(),
            passengerName: $("opPassengerName").value.trim(), passengerPhone: $("opPassengerPhone").value.trim(),
            price: $("opPrice").value.trim(), currency: $("opCurrency").value || "EUR",
            meetGreet: $("opMeetGreet").value.trim(), notes: $("opNotes").value.trim()
          })
        });
        ["opOrderNumber", "opPickup", "opDropoff", "opFlight", "opFlightTime", "opBuffer", "opDate", "opTime", "opPassengers", "opLuggage",
          "opPassengerName", "opPassengerPhone", "opPrice", "opMeetGreet", "opNotes"].forEach(function (id) { $(id).value = ""; });
        $("opCurrency").value = "EUR";
        orderNumberManual = false;
        bufferManual = false;
        regenerateOrderNumberForSelectedPartner();
        applyAutoBuffer();
        $("createOrderStatus").textContent = "Order created and assigned.";
        $("createOrderStatus").className = "status ok";
        loadOrders();
        btn.disabled = false;
      } catch (e) {
        if (e.message === "order_number_taken" && !orderNumberManual && attempts < 8) {
          attempts++;
          regenerateOrderNumberForSelectedPartner();
          attempt();
          return;
        }
        $("createOrderStatus").textContent = e.message === "order_number_taken"
          ? "This order number is already in use — try another."
          : "Could not create the order.";
        $("createOrderStatus").className = "status err";
        btn.disabled = false;
      }
    })();
  });

  /* ---------- orders: list ---------- */
  async function loadOrders(silent) {
    if (!silent) {
      $("ordersStatus").textContent = "Loading…";
      $("ordersStatus").className = "status";
    }
    try {
      var data = await api("/api/admin/orders");
      orders = data.orders || [];
      renderOrders();
      renderFinance();
      $("ordersStatus").textContent = orders.length + " order(s)";
      $("ordersStatus").className = "status";
    } catch (e) {
      if (silent) return;
      $("ordersStatus").textContent = "Could not load orders.";
      $("ordersStatus").className = "status err";
    }
  }

  var CLOSED_STATUSES = ["declined", "cancelled"];
  var EMPTY_ORDER_MESSAGE = {
    offered: "No orders waiting on a partner right now.",
    accepted: "Nothing in progress right now.",
    completed: "No completed orders yet.",
    closed: "No declined or cancelled orders.",
    no_show: "No customer no-show reports right now.",
  };

  function updateOrderTabCounts() {
    var cOffered = orders.filter(function (o) { return o.status === "offered"; }).length;
    var cAccepted = orders.filter(function (o) { return o.status === "accepted"; }).length;
    var cCompleted = orders.filter(function (o) { return o.status === "completed"; }).length;
    var cClosed = orders.filter(function (o) { return CLOSED_STATUSES.indexOf(o.status) !== -1; }).length;
    var cNoShow = orders.filter(function (o) { return o.status === "no_show"; }).length;
    $("countOffered").textContent = cOffered || "";
    $("countAccepted").textContent = cAccepted || "";
    $("countCompleted").textContent = cCompleted || "";
    $("countClosed").textContent = cClosed || "";
    $("countNoShow").textContent = cNoShow || "";
    $("statOffered").textContent = cOffered;
    $("statAccepted").textContent = cAccepted;
    $("statCompleted").textContent = cCompleted;
    $("statClosed").textContent = cClosed;
    $("statNoShow").textContent = cNoShow;
  }

  function matchesOrderFilter(o) {
    var q = $("fOrderSearch").value.trim().toLowerCase();
    if (q) {
      // Searching by order # looks across every status, not just the open tab.
      var orderNum = (o.orderNumber || String(o.id)).toLowerCase();
      if (orderNum.indexOf(q) === -1) return false;
    } else {
      var inTab = orderTab === "closed" ? CLOSED_STATUSES.indexOf(o.status) !== -1 : o.status === orderTab;
      if (!inTab) return false;
    }
    var partnerFilter = $("fOrderPartner").value;
    if (partnerFilter && String(o.partnerId) !== partnerFilter) return false;
    var from = $("fDateFrom").value, to = $("fDateTo").value;
    if (from && o.orderDate < from) return false;
    if (to && o.orderDate > to) return false;
    return true;
  }

  var evidenceCache = {};
  async function loadOrderEvidence(id) {
    try {
      var data = await api("/api/admin/order-evidence?id=" + id);
      evidenceCache[id] = data.documents || [];
    } catch (e) {
      evidenceCache[id] = [];
    }
    if (openOrderId === id) renderOrderDetail(id);
  }

  function statusBadge(o) {
    if (o.status === "accepted" && o.tripStage && STAGE_LABELS[o.tripStage]) {
      return '<span class="badge badge-accepted">' + esc(STAGE_LABELS[o.tripStage]) + "</span>";
    }
    return badge(o.status);
  }

  function renderOrders() {
    updateOrderTabCounts();
    var rows = orders.filter(matchesOrderFilter);
    var dir = $("fSort").value === "desc" ? -1 : 1;
    rows = rows.slice().sort(function (a, b) {
      var ka = (a.orderDate || "") + " " + (a.orderTime || "");
      var kb = (b.orderDate || "") + " " + (b.orderTime || "");
      return ka < kb ? -dir : ka > kb ? dir : 0;
    });
    if (!rows.length) { $("ordersList").innerHTML = '<tr><td colspan="7" class="empty-cell">' + EMPTY_ORDER_MESSAGE[orderTab] + "</td></tr>"; return; }
    $("ordersList").innerHTML = rows.map(function (o) {
      var isOpen = openOrderId === o.id;
      return '<tr class="data-row" data-order-toggle="' + o.id + '">' +
        '<td class="mono col-main">' + (o.orderNumber ? "#" + esc(o.orderNumber) : "#" + o.id) + "</td>" +
        "<td>" + esc(o.companyName) + "</td>" +
        "<td>" + esc(o.pickup) + " → " + esc(o.dropoff) + "</td>" +
        '<td class="mono">' + esc(fmtDay(o.orderDate)) + (o.orderTime ? " · " + esc(o.orderTime) : "") + "</td>" +
        '<td class="mono">' + (o.price ? esc(o.price) + " " + esc(o.currency) : "—") + "</td>" +
        "<td>" + statusBadge(o) + "</td>" +
        '<td class="col-chev">' + (isOpen ? "▾" : "›") + "</td>" +
        "</tr>" +
        '<tr><td colspan="7" class="detail-cell"><div class="detail' + (isOpen ? " open" : "") + '" id="orderdetail-' + o.id + '"></div></td></tr>';
    }).join("");
    if (openOrderId != null) renderOrderDetail(openOrderId);
  }

  function renderOrderDetail(id) {
    var el = $("orderdetail-" + id);
    if (!el) return;
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;

    var actions = (o.status === "accepted" || o.status === "offered")
      ? '<button type="button" class="minibtn good" data-order-complete="' + o.id + '">Mark completed</button>' +
        '<button type="button" class="minibtn crit" data-order-cancel="' + o.id + '">Cancel</button>'
      : "";

    var evidenceBlock = "";
    if (o.status === "no_show") {
      var evidenceDocs = evidenceCache[id];
      if (!evidenceDocs) {
        evidenceBlock = '<div class="block"><div class="row-meta">Loading evidence…</div></div>';
      } else if (!evidenceDocs.length) {
        evidenceBlock = '<div class="block"><div class="row-meta">No evidence was uploaded for this report.</div></div>';
      } else {
        evidenceBlock = '<div class="block"><h3 style="font-family:inherit;text-transform:none;font-size:15px;font-weight:700;margin-bottom:10px;">Customer no-show evidence</h3>' +
          evidenceDocs.map(function (d) {
            var fileLink = d.hasFile
              ? '<div><a href="' + fileUrl(d.id) + '" target="_blank" rel="noopener">View upload' + (d.filename ? ": " + esc(d.filename) : "") + '</a> &middot; <a href="' + downloadUrl(d.id) + '" download>Download</a></div>'
              : "";
            var noteText = d.note ? '<div class="row-meta" style="margin-top:2px;">' + esc(d.note) + "</div>" : "";
            if (!d.hasFile && !d.note) noteText = '<div class="row-meta" style="margin-top:2px;">No file or note provided.</div>';
            return '<div class="row-meta" style="margin-bottom:10px;"><b>' + esc(d.label || d.field) + "</b>" + fileLink + noteText + "</div>";
          }).join("") +
          "</div>";
      }
      if (o.noShowReviewStatus === "rejected") {
        evidenceBlock += '<div class="block"><div class="row-meta">This no-show report was <b>rejected</b> by an admin.</div></div>';
      } else {
        evidenceBlock += '<div class="block" style="display:flex;gap:8px;">' +
          '<button type="button" class="minibtn good" data-noshow-confirm="' + o.id + '">Confirm no-show</button>' +
          '<button type="button" class="minibtn crit" data-noshow-reject="' + o.id + '">Reject</button>' +
          '<span class="status" id="noshowReviewStatus-' + o.id + '" style="margin:0;"></span>' +
          "</div>";
      }
    }

    var reassignBlock = "";
    if (CLOSED_STATUSES.indexOf(o.status) !== -1) {
      var activePartners = partners.filter(function (p) { return p.status === "active"; });
      var partnerOpts = activePartners.length
        ? activePartners.map(function (p) { return '<option value="' + p.id + '">' + esc(p.companyName) + "</option>"; }).join("")
        : '<option value="">No active partners</option>';
      reassignBlock =
        '<details class="block">' +
        '<summary class="minibtn" style="display:inline-block;">Reassign to another partner</summary>' +
        '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;">' +
        '<div class="field" style="min-width:170px;flex:1 1 170px;margin-bottom:0;"><label>New partner</label><select data-reassign-field="partnerId">' + partnerOpts + "</select></div>" +
        '<div class="field" style="min-width:150px;flex:1 1 150px;margin-bottom:0;"><label>Pickup</label><input type="text" data-reassign-field="pickup" value="' + esc(o.pickup) + '"></div>' +
        '<div class="field" style="min-width:150px;flex:1 1 150px;margin-bottom:0;"><label>Dropoff</label><input type="text" data-reassign-field="dropoff" value="' + esc(o.dropoff) + '"></div>' +
        '<div class="field" style="min-width:130px;flex:1 1 130px;margin-bottom:0;"><label>Date</label><input type="date" data-reassign-field="orderDate" value="' + esc(o.orderDate) + '"></div>' +
        '<div class="field" style="min-width:110px;flex:1 1 110px;margin-bottom:0;"><label>Pickup time</label><input type="time" data-reassign-field="orderTime" value="' + esc(o.orderTime || "") + '"></div>' +
        '<div class="field" style="min-width:100px;flex:1 1 100px;margin-bottom:0;"><label>Price</label><input type="text" data-reassign-field="price" value="' + esc(o.price || "") + '"></div>' +
        '<div class="field" style="min-width:140px;flex:1 1 140px;margin-bottom:0;"><label>Currency</label><select data-reassign-field="currency">' +
        ["EUR", "USD", "GBP"].map(function (c) { return '<option value="' + c + '"' + (c === o.currency ? " selected" : "") + '>' + c + "</option>"; }).join("") +
        "</select></div>" +
        '<div style="flex:1 1 100%;display:flex;align-items:center;gap:10px;">' +
        '<button type="button" class="minibtn good" data-order-reassign="' + o.id + '">Reassign &amp; offer to new partner</button>' +
        '<span class="status" id="reassignStatus-' + o.id + '" style="margin:0;"></span>' +
        "</div></div></details>";
    }

    var dateLine = esc(fmtDay(o.orderDate)) + (o.orderTime ? " · pickup " + esc(o.orderTime) : "") + (o.bufferMinutes != null ? " · waiting " + esc(o.bufferMinutes) + " min" : "");

    var routeBlock =
      '<div style="display:flex;gap:10px;">' +
      '<div class="route-track" style="padding-top:3px;">' +
      '<div class="route-dot"></div>' +
      '<div class="route-dotted" style="min-height:40px;"></div>' +
      '<div class="route-dot end"></div>' +
      "</div>" +
      '<div style="flex:1;min-width:0;padding-bottom:4px;">' +
      '<div style="font-weight:700;font-size:14px;">' + esc(o.pickup) + "</div>" +
      (o.flightNumber
        ? '<div style="margin:7px 0;"><span class="badge" style="background:var(--surface-2);color:var(--ink-2);border:1px solid var(--line);">Flight ' + esc(o.flightNumber) + (o.flightTime ? " · arrives " + esc(o.flightTime) : "") + "</span></div>"
        : "") +
      '<div style="font-weight:700;font-size:14px;margin-top:' + (o.flightNumber ? "20" : "7") + 'px;">' + esc(o.dropoff) + "</div>" +
      "</div></div>" +
      '<div class="row-meta" style="margin-top:6px;">' + dateLine + "</div>";

    var iconRows =
      '<div class="icon-row" style="margin-top:10px;">' +
      '<div class="icon-dot"><svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="10" cy="7" r="3.2"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg></div>' +
      esc(o.driverName || "Not assigned") + '<span style="margin-left:auto;color:var(--ink-2);">Driver</span>' +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 10h11l3 4v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Z"/><path d="M6.5 13.5h7"/></svg></div>' +
      esc([o.vehicleType, o.vehiclePlate].filter(Boolean).join(" · ") || "Not assigned") + '<span style="margin-left:auto;color:var(--ink-2);">Vehicle</span>' +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="10" cy="7" r="3.2"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg></div>' +
      esc(o.passengerName || "—") + (o.passengerPhone ? " · " + esc(o.passengerPhone) : "") + '<span style="margin-left:auto;color:var(--ink-2);">Passenger</span>' +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2 3 6v5c0 4 3 6.5 7 7 4-.5 7-3 7-7V6l-7-4Z"/></svg></div>' +
      esc(o.passengers != null ? o.passengers : "—") + " passengers · " + esc(o.luggage != null ? o.luggage : "—") + " bags" +
      "</div>" +
      '<div class="icon-row">' +
      '<div class="icon-dot"><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="5" width="16" height="10" rx="2"/><circle cx="10" cy="10" r="2.1" fill="currentColor" stroke="none"/></svg></div>' +
      (o.price ? esc(o.price) + " " + esc(o.currency) : "—") +
      "</div>" +
      (o.status === "accepted" || o.status === "completed"
        ? '<div class="row-meta" style="margin-top:8px;">Trip stage: ' + esc(o.tripStage ? STAGE_LABELS[o.tripStage] : "Accepted, not started yet") + "</div>"
        : "");

    var meetGreetBlock = o.meetGreet
      ? '<div class="meetgreet-box">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        '<svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style="margin-top:2px;flex:none;color:var(--warn-ink);" aria-hidden="true"><path d="M3 5h14v2H3zM3 9h14v2H3zM3 13h9v2H3z"/></svg>' +
        '<div class="mg-instruction">' + esc(o.meetGreet) + "</div>" +
        "</div></div>"
      : "";

    el.innerHTML =
      '<div class="block" style="margin-top:0;padding-top:0;border-top:0;">' +
      routeBlock +
      iconRows +
      meetGreetBlock +
      (o.notes ? '<div class="row-meta" style="margin-top:10px;">Instructions: ' + esc(o.notes) + "</div>" : "") +
      '<div class="row-meta" style="margin-top:10px;">Created ' + esc(fmtDate(o.createdAt)) + (o.respondedAt ? " · responded " + esc(fmtDate(o.respondedAt)) : "") + "</div>" +
      "</div>" +
      evidenceBlock +
      '<div class="block" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' + actions +
      '<button type="button" class="minibtn ghost-crit" data-order-hide="' + o.id + '" style="margin-left:auto;">Delete order</button>' +
      '<button type="button" class="linkbtn-crit" data-order-delete="' + o.id + '" title="Permanently deletes this order from the database. Use only for cleaning up test data.">Delete permanently</button>' +
      "</div>" +
      reassignBlock;
  }

  $("ordersList").addEventListener("click", async function (e) {
    var toggle = e.target.closest("[data-order-toggle]");
    var complete = e.target.closest("[data-order-complete]");
    var cancel = e.target.closest("[data-order-cancel]");
    var hide = e.target.closest("[data-order-hide]");
    var del = e.target.closest("[data-order-delete]");
    var reassign = e.target.closest("[data-order-reassign]");
    var noshowConfirm = e.target.closest("[data-noshow-confirm]");
    var noshowReject = e.target.closest("[data-noshow-reject]");

    if (toggle && !complete && !cancel && !hide && !del && !reassign && !noshowConfirm && !noshowReject) {
      var id = Number(toggle.getAttribute("data-order-toggle"));
      openOrderId = openOrderId === id ? null : id;
      renderOrders();
      if (openOrderId != null) {
        var openedOrder = orders.filter(function (x) { return x.id === openOrderId; })[0];
        if (openedOrder && openedOrder.status === "no_show" && !evidenceCache[openOrderId]) {
          loadOrderEvidence(openOrderId);
        }
      }
      return;
    }
    if (hide) {
      e.stopPropagation();
      var hideId = Number(hide.getAttribute("data-order-hide"));
      if (!confirm("Delete this order from your admin view? It stays untouched and visible to the partner.")) return;
      try {
        await api("/api/admin/order-hide", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: hideId })
        });
        openOrderId = null;
        await loadOrders();
      } catch (err) {
        alert("Could not delete the order.");
      }
      return;
    }
    if (del) {
      e.stopPropagation();
      var delId = Number(del.getAttribute("data-order-delete"));
      if (!confirm("Permanently delete this order from the database? This removes it for the partner too and cannot be undone. Use this only to clean up test data.")) return;
      try {
        await api("/api/admin/order-delete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: delId })
        });
        openOrderId = null;
        await loadOrders();
      } catch (err) {
        alert("Could not delete the order.");
      }
      return;
    }
    if (reassign) {
      e.stopPropagation();
      var reId = Number(reassign.getAttribute("data-order-reassign"));
      var form = reassign.closest("details");
      var statusEl = $("reassignStatus-" + reId);
      var fields = {};
      form.querySelectorAll("[data-reassign-field]").forEach(function (f) { fields[f.getAttribute("data-reassign-field")] = f.value; });
      if (!fields.partnerId) {
        if (statusEl) { statusEl.textContent = "Pick a partner first."; statusEl.className = "status err"; }
        return;
      }
      reassign.disabled = true;
      if (statusEl) { statusEl.textContent = "Reassigning…"; statusEl.className = "status"; }
      try {
        await api("/api/admin/order-reassign", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: reId, partnerId: Number(fields.partnerId), pickup: fields.pickup, dropoff: fields.dropoff,
            orderDate: fields.orderDate, orderTime: fields.orderTime, price: fields.price, currency: fields.currency
          })
        });
        openOrderId = null;
        await loadOrders();
      } catch (err) {
        if (statusEl) { statusEl.textContent = "Could not reassign. Try again."; statusEl.className = "status err"; }
        reassign.disabled = false;
      }
      return;
    }
    if (noshowConfirm) {
      e.stopPropagation();
      var ncId = Number(noshowConfirm.getAttribute("data-noshow-confirm"));
      var ncStatusEl = $("noshowReviewStatus-" + ncId);
      noshowConfirm.disabled = true;
      if (ncStatusEl) { ncStatusEl.textContent = "Confirming…"; ncStatusEl.className = "status"; }
      try {
        await api("/api/admin/order-no-show-review", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ncId, action: "confirm" })
        });
        openOrderId = null;
        await loadOrders();
      } catch (err) {
        noshowConfirm.disabled = false;
        if (ncStatusEl) { ncStatusEl.textContent = "Could not confirm. Try again."; ncStatusEl.className = "status err"; }
      }
      return;
    }
    if (noshowReject) {
      e.stopPropagation();
      var nrId = Number(noshowReject.getAttribute("data-noshow-reject"));
      if (!confirm("Reject this no-show report? The order stays marked as a no-show but will no longer need action.")) return;
      var nrStatusEl = $("noshowReviewStatus-" + nrId);
      noshowReject.disabled = true;
      if (nrStatusEl) { nrStatusEl.textContent = "Rejecting…"; nrStatusEl.className = "status"; }
      try {
        await api("/api/admin/order-no-show-review", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: nrId, action: "reject" })
        });
        await loadOrders();
      } catch (err) {
        noshowReject.disabled = false;
        if (nrStatusEl) { nrStatusEl.textContent = "Could not reject. Try again."; nrStatusEl.className = "status err"; }
      }
      return;
    }
    if (!complete && !cancel) return;
    e.stopPropagation();

    try {
      var oid = Number((complete || cancel).getAttribute(complete ? "data-order-complete" : "data-order-cancel"));
      await api("/api/admin/order-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: oid, status: complete ? "completed" : "cancelled" })
      });
      await loadOrders();
    } catch (err) {
      alert("Could not update the order.");
    }
  });

  $("fOrderSearch").addEventListener("input", renderOrders);
  $("fOrderPartner").addEventListener("change", renderOrders);
  $("fDateFrom").addEventListener("change", renderOrders);
  $("fDateTo").addEventListener("change", renderOrders);
  $("fSort").addEventListener("change", renderOrders);

  /* ---------- gate ---------- */
  function showGate() {
    $("gate").hidden = false;
    $("panelsWrap").hidden = true;
  }

  function tryUnlock() {
    secret = $("secret").value.trim();
    if (!secret) { $("gateStatus").textContent = "Enter the password."; return; }
    try { sessionStorage.setItem("fdi_secret", secret); } catch (e) {}
    $("gateStatus").textContent = "";
    $("gate").hidden = true;
    $("panelsWrap").hidden = false;
    loadPartners();
    loadOrders();
  }
  $("unlock").addEventListener("click", tryUnlock);
  $("secret").addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryUnlock();
  });

  try {
    var saved = sessionStorage.getItem("fdi_secret");
    if (saved) {
      secret = saved;
      $("secret").value = saved;
      $("gate").hidden = true;
      $("panelsWrap").hidden = false;
      loadPartners();
      loadOrders();
    }
  } catch (e) {}

  /* ---------- live updates: poll orders every 5s, pause while the tab is hidden ---------- */
  var POLL_MS = 5000;
  var pollTimer = setInterval(function () {
    if ($("panelsWrap").hidden || document.hidden) return;
    loadOrders(true);
  }, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !$("panelsWrap").hidden) loadOrders(true);
  });
})();
