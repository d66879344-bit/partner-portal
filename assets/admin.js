(function () {
  var $ = function (id) { return document.getElementById(id); };
  var secret = "";
  var partners = [];
  var orders = [];
  var detailCache = {};
  var openId = null;
  var openOrderId = null;
  var STAGE_LABELS = { on_the_way: "On the way", arrived: "Arrived at pickup", in_car: "Passenger on board", dropped_off: "Dropped off" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso.replace(" ", "T") + "Z").toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return iso; }
  }
  function badge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + "</span>";
  }
  function fileUrl(id) {
    return "/api/admin/partner-file?secret=" + encodeURIComponent(secret) + "&id=" + id;
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
      renderPartners();
      populatePartnerSelect();
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
    var fs = $("fStatus").value, q = $("fSearch").value.trim().toLowerCase();
    if (fs && p.status !== fs) return false;
    if (q && (p.companyName + " " + p.email).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }

  function renderPartners() {
    var rows = partners.filter(matchesPartnerFilter);
    if (!rows.length) { $("partnersList").innerHTML = '<tr><td colspan="6" class="empty-cell">No matching partners.</td></tr>'; return; }
    $("partnersList").innerHTML = rows.map(function (p) {
      var isOpen = openId === p.id;
      return '<tr class="data-row" data-toggle="' + p.id + '">' +
        '<td class="col-main">' + esc(p.companyName) + "</td>" +
        "<td>" + esc(p.email) + "</td>" +
        "<td>" + esc(p.countryName || p.country) + "</td>" +
        '<td class="mono">' + esc(fmtDate(p.createdAt)) + "</td>" +
        "<td>" + badge(p.status) + "</td>" +
        '<td class="col-chev">' + (isOpen ? "▾" : "›") + "</td>" +
        "</tr>" +
        '<tr><td colspan="6" class="detail-cell"><div class="detail' + (isOpen ? " open" : "") + '" id="detail-' + p.id + '"></div></td></tr>';
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
          ' · <a href="' + fileUrl(doc.id) + '" target="_blank" rel="noopener">' + esc(doc.filename || "file") + "</a> " + badge(doc.status) + "</div>" +
          '<div class="docrow-actions">' +
          '<button type="button" class="minibtn good" data-doc-approve="' + doc.id + '">Approve</button>' +
          '<button type="button" class="minibtn crit" data-doc-reject="' + doc.id + '">Reject</button>' +
          "</div></div>";
      }).join("");
    }

    var vehicleBlocks = d.vehicles.map(function (v, i) {
      return '<div class="block"><div class="block-title">Vehicle ' + (i + 1) + (v.plate ? " — " + esc(v.plate) : "") + (v.category ? " (" + esc(v.category) + ")" : "") + "</div>" + docList(v.documents) + "</div>";
    }).join("");
    var driverBlocks = d.drivers.map(function (dr, i) {
      return '<div class="block"><div class="block-title">Driver ' + (i + 1) + (dr.fullName ? " — " + esc(dr.fullName) : "") + "</div>" + docList(dr.documents) + "</div>";
    }).join("");

    el.innerHTML =
      '<div class="block"><div class="block-title">Contact</div>' +
      '<div class="row-meta">' + esc(p.contactName || "—") + (p.phone ? " · " + esc(p.phone) : "") + "</div>" +
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
  $("fSearch").addEventListener("input", renderPartners);

  /* ---------- orders: create form ---------- */
  function populatePartnerSelect() {
    var active = partners.filter(function (p) { return p.status === "active"; });
    $("opPartner").innerHTML = active.length
      ? active.map(function (p) { return '<option value="' + p.id + '">' + esc(p.companyName) + "</option>"; }).join("")
      : '<option value="">No active partners yet</option>';
  }

  (function initVehicleTypes() {
    var types = (window.VEHICLE_TYPES || []);
    $("opVehicleType").innerHTML = types.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + "</option>"; }).join("");
  })();

  $("createOrderBtn").addEventListener("click", async function () {
    var partnerId = Number($("opPartner").value);
    var orderNumber = $("opOrderNumber").value.trim();
    var pickup = $("opPickup").value.trim();
    var dropoff = $("opDropoff").value.trim();
    var orderDate = $("opDate").value;
    if (!orderNumber || !partnerId || !pickup || !dropoff || !orderDate) {
      $("createOrderStatus").textContent = "Order number, partner, pickup, dropoff and date are required.";
      $("createOrderStatus").className = "status err";
      return;
    }
    this.disabled = true;
    try {
      await api("/api/admin/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: orderNumber, partnerId: partnerId, pickup: pickup, dropoff: dropoff, orderDate: orderDate,
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
      $("createOrderStatus").textContent = "Order created and assigned.";
      $("createOrderStatus").className = "status ok";
      loadOrders();
    } catch (e) {
      $("createOrderStatus").textContent = "Could not create the order.";
      $("createOrderStatus").className = "status err";
    } finally {
      this.disabled = false;
    }
  });

  /* ---------- orders: list ---------- */
  async function loadOrders() {
    $("ordersStatus").textContent = "Loading…";
    $("ordersStatus").className = "status";
    try {
      var data = await api("/api/admin/orders");
      orders = data.orders || [];
      renderOrders();
      $("ordersStatus").textContent = orders.length + " order(s)";
    } catch (e) {
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
  };

  function updateOrderTabCounts() {
    var cOffered = orders.filter(function (o) { return o.status === "offered"; }).length;
    var cAccepted = orders.filter(function (o) { return o.status === "accepted"; }).length;
    var cCompleted = orders.filter(function (o) { return o.status === "completed"; }).length;
    var cClosed = orders.filter(function (o) { return CLOSED_STATUSES.indexOf(o.status) !== -1; }).length;
    $("countOffered").textContent = cOffered || "";
    $("countAccepted").textContent = cAccepted || "";
    $("countCompleted").textContent = cCompleted || "";
    $("countClosed").textContent = cClosed || "";
    $("statOffered").textContent = cOffered;
    $("statAccepted").textContent = cAccepted;
    $("statCompleted").textContent = cCompleted;
    $("statClosed").textContent = cClosed;
  }

  function matchesOrderFilter(o) {
    var q = $("fOrderSearch").value.trim().toLowerCase();
    var inTab = orderTab === "closed" ? CLOSED_STATUSES.indexOf(o.status) !== -1 : o.status === orderTab;
    if (!inTab) return false;
    if (q && (o.companyName + " " + o.pickup + " " + o.dropoff).toLowerCase().indexOf(q) === -1) return false;
    var from = $("fDateFrom").value, to = $("fDateTo").value;
    if (from && o.orderDate < from) return false;
    if (to && o.orderDate > to) return false;
    return true;
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
        '<td class="mono">' + esc(o.orderDate) + (o.orderTime ? " · " + esc(o.orderTime) : "") + "</td>" +
        '<td class="mono">' + (o.price ? esc(o.price) + " " + esc(o.currency) : "—") + "</td>" +
        "<td>" + badge(o.status) + "</td>" +
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

    el.innerHTML =
      '<div class="block" style="margin-top:0;padding-top:0;border-top:0;">' +
      '<div class="row-meta">Flight: ' + esc(o.flightNumber || "—") + (o.flightTime ? " · arrives " + esc(o.flightTime) : "") + (o.bufferMinutes != null ? " · buffer " + esc(o.bufferMinutes) + " min" : "") + " · pickup " + esc(o.orderTime || "—") + "</div>" +
      '<div class="row-meta">Passengers: ' + esc(o.passengers != null ? o.passengers : "—") + " · Luggage: " + esc(o.luggage != null ? o.luggage : "—") + "</div>" +
      '<div class="row-meta">Passenger: ' + esc(o.passengerName || "—") + (o.passengerPhone ? " · " + esc(o.passengerPhone) : "") + "</div>" +
      (o.status === "accepted" || o.status === "completed"
        ? '<div class="row-meta">Trip stage: ' + esc(o.tripStage ? STAGE_LABELS[o.tripStage] : "Accepted, not started yet") + "</div>"
        : "") +
      (o.meetGreet ? '<div class="row-meta">Meet &amp; greet: ' + esc(o.meetGreet) + "</div>" : "") +
      (o.notes ? '<div class="row-meta">Instructions: ' + esc(o.notes) + "</div>" : "") +
      '<div class="row-meta">Created ' + esc(fmtDate(o.createdAt)) + (o.respondedAt ? " · responded " + esc(fmtDate(o.respondedAt)) : "") + "</div>" +
      "</div>" +
      '<div class="block" style="display:flex;gap:8px;flex-wrap:wrap;">' + actions +
      '<button type="button" class="minibtn ghost-crit" data-order-delete="' + o.id + '" style="margin-left:auto;">Delete order</button>' +
      "</div>";
  }

  $("ordersList").addEventListener("click", async function (e) {
    var toggle = e.target.closest("[data-order-toggle]");
    var complete = e.target.closest("[data-order-complete]");
    var cancel = e.target.closest("[data-order-cancel]");
    var del = e.target.closest("[data-order-delete]");

    if (toggle && !complete && !cancel && !del) {
      var id = Number(toggle.getAttribute("data-order-toggle"));
      openOrderId = openOrderId === id ? null : id;
      renderOrders();
      return;
    }
    if (del) {
      e.stopPropagation();
      var delId = Number(del.getAttribute("data-order-delete"));
      if (!confirm("Delete this order permanently? This cannot be undone.")) return;
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
})();
