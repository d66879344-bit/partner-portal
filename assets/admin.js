(function () {
  var $ = function (id) { return document.getElementById(id); };
  var secret = "";
  var partners = [];
  var orders = [];
  var detailCache = {};
  var fleetCache = {}; // partnerId -> { vehicles: [...], drivers: [...] }
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

  async function loadPartnerFleet(partnerId) {
    if (fleetCache[partnerId]) return fleetCache[partnerId];
    var data = await api("/api/admin/partner-detail?id=" + partnerId);
    var fleet = { vehicles: data.vehicles || [], drivers: data.drivers || [] };
    fleetCache[partnerId] = fleet;
    return fleet;
  }

  /* ---------- tabs ---------- */
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + tab.getAttribute("data-tab")); });
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
    if (!rows.length) { $("partnersList").innerHTML = '<li class="row">No matching partners.</li>'; return; }
    $("partnersList").innerHTML = rows.map(function (p) {
      var isOpen = openId === p.id;
      return '<li class="row">' +
        '<div class="row-top" data-toggle="' + p.id + '">' +
        '<span class="row-title">' + esc(p.companyName) + "</span>" +
        '<span class="row-meta">' + esc(p.email) + " · " + esc(p.countryName || p.country) + " · " + esc(fmtDate(p.createdAt)) + "</span>" +
        badge(p.status) + "</div>" +
        '<div class="detail' + (isOpen ? " open" : "") + '" id="detail-' + p.id + '"></div>' +
        "</li>";
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
    if (!approveDoc && !rejectDoc && !approveP && !rejectP) return;
    e.stopPropagation();

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
    onOpPartnerChange();
  }

  function fleetSelectOptions(list, labelFn) {
    var opts = '<option value="">— not assigned —</option>';
    opts += list.map(function (x) { return '<option value="' + x.id + '">' + esc(labelFn(x)) + "</option>"; }).join("");
    return opts;
  }

  async function onOpPartnerChange() {
    var pid = Number($("opPartner").value);
    if (!pid) {
      $("opDriver").innerHTML = '<option value="">Pick a partner first</option>';
      $("opVehicle").innerHTML = '<option value="">Pick a partner first</option>';
      return;
    }
    $("opDriver").innerHTML = '<option value="">Loading…</option>';
    $("opVehicle").innerHTML = '<option value="">Loading…</option>';
    try {
      var fleet = await loadPartnerFleet(pid);
      $("opDriver").innerHTML = fleetSelectOptions(fleet.drivers, function (d) { return d.fullName || ("Driver #" + d.id); });
      $("opVehicle").innerHTML = fleetSelectOptions(fleet.vehicles, function (v) { return v.plate || ("Vehicle #" + v.id); });
    } catch (e) {
      $("opDriver").innerHTML = '<option value="">Could not load</option>';
      $("opVehicle").innerHTML = '<option value="">Could not load</option>';
    }
  }
  $("opPartner").addEventListener("change", onOpPartnerChange);

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
          flightNumber: $("opFlight").value.trim(),
          orderTime: $("opTime").value, vehicleType: $("opVehicleType").value,
          passengers: $("opPassengers").value.trim(), luggage: $("opLuggage").value.trim(),
          passengerName: $("opPassengerName").value.trim(), passengerPhone: $("opPassengerPhone").value.trim(),
          driverId: $("opDriver").value || null, vehicleId: $("opVehicle").value || null,
          price: $("opPrice").value.trim(), currency: $("opCurrency").value || "EUR",
          meetGreet: $("opMeetGreet").value.trim(), notes: $("opNotes").value.trim()
        })
      });
      ["opOrderNumber", "opPickup", "opDropoff", "opFlight", "opDate", "opTime", "opPassengers", "opLuggage",
        "opPassengerName", "opPassengerPhone", "opPrice", "opMeetGreet", "opNotes"].forEach(function (id) { $(id).value = ""; });
      $("opCurrency").value = "EUR";
      $("opDriver").value = "";
      $("opVehicle").value = "";
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

  function matchesOrderFilter(o) {
    var fs = $("fOrderStatus").value, q = $("fOrderSearch").value.trim().toLowerCase();
    if (fs && o.status !== fs) return false;
    if (q && (o.companyName + " " + o.pickup + " " + o.dropoff).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }

  function renderOrders() {
    var rows = orders.filter(matchesOrderFilter);
    if (!rows.length) { $("ordersList").innerHTML = '<li class="row">No matching orders.</li>'; return; }
    $("ordersList").innerHTML = rows.map(function (o) {
      var isOpen = openOrderId === o.id;
      return '<li class="row">' +
        '<div class="row-top" data-order-toggle="' + o.id + '">' +
        '<span class="row-title">' + (o.orderNumber ? "#" + esc(o.orderNumber) + " · " : "") + esc(o.companyName) + " — " + esc(o.pickup) + " → " + esc(o.dropoff) + "</span>" +
        '<span class="row-meta">' + esc(o.orderDate) + (o.orderTime ? " " + esc(o.orderTime) : "") +
        (o.vehicleType ? " · " + esc(o.vehicleType) : "") + (o.price ? " · " + esc(o.price) + " " + esc(o.currency) : "") + "</span>" +
        badge(o.status) + "</div>" +
        '<div class="detail' + (isOpen ? " open" : "") + '" id="orderdetail-' + o.id + '"></div>' +
        "</li>";
    }).join("");
    if (openOrderId != null) renderOrderDetail(openOrderId);
  }

  async function renderOrderDetail(id) {
    var el = $("orderdetail-" + id);
    if (!el) return;
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    el.innerHTML = "Loading…";
    var fleet;
    try { fleet = await loadPartnerFleet(o.partnerId); } catch (e) { fleet = { vehicles: [], drivers: [] }; }

    var actions = (o.status === "accepted" || o.status === "offered")
      ? '<button type="button" class="minibtn good" data-order-complete="' + o.id + '">Mark completed</button>' +
        '<button type="button" class="minibtn crit" data-order-cancel="' + o.id + '">Cancel</button>'
      : "";

    el.innerHTML =
      '<div class="block" style="margin-top:0;padding-top:0;border-top:0;">' +
      '<div class="row-meta">Flight: ' + esc(o.flightNumber || "—") + "</div>" +
      '<div class="row-meta">Passengers: ' + esc(o.passengers != null ? o.passengers : "—") + " · Luggage: " + esc(o.luggage != null ? o.luggage : "—") + "</div>" +
      '<div class="row-meta">Passenger: ' + esc(o.passengerName || "—") + (o.passengerPhone ? " · " + esc(o.passengerPhone) : "") + "</div>" +
      (o.status === "accepted" || o.status === "completed"
        ? '<div class="row-meta">Trip stage: ' + esc(o.tripStage ? STAGE_LABELS[o.tripStage] : "Accepted, not started yet") + "</div>"
        : "") +
      (o.meetGreet ? '<div class="row-meta">Meet &amp; greet: ' + esc(o.meetGreet) + "</div>" : "") +
      (o.notes ? '<div class="row-meta">Instructions: ' + esc(o.notes) + "</div>" : "") +
      '<div class="row-meta">Created ' + esc(fmtDate(o.createdAt)) + (o.respondedAt ? " · responded " + esc(fmtDate(o.respondedAt)) : "") + "</div>" +
      "</div>" +
      '<div class="block">' +
      '<div class="block-title">Driver &amp; vehicle</div>' +
      '<div class="addrow" style="margin-top:0;">' +
      '<select id="odDriver-' + o.id + '">' + fleetSelectOptions(fleet.drivers, function (d) { return d.fullName || ("Driver #" + d.id); }) + "</select>" +
      '<select id="odVehicle-' + o.id + '">' + fleetSelectOptions(fleet.vehicles, function (v) { return v.plate || ("Vehicle #" + v.id); }) + "</select>" +
      '<button type="button" class="minibtn" data-order-save-assign="' + o.id + '">Save</button>' +
      "</div></div>" +
      (actions ? '<div class="block" style="display:flex;gap:8px;">' + actions + "</div>" : "");

    $("odDriver-" + o.id).value = o.driverId || "";
    $("odVehicle-" + o.id).value = o.vehicleId || "";
  }

  $("ordersList").addEventListener("click", async function (e) {
    var toggle = e.target.closest("[data-order-toggle]");
    var complete = e.target.closest("[data-order-complete]");
    var cancel = e.target.closest("[data-order-cancel]");
    var saveAssign = e.target.closest("[data-order-save-assign]");

    if (toggle && !complete && !cancel && !saveAssign) {
      var id = Number(toggle.getAttribute("data-order-toggle"));
      openOrderId = openOrderId === id ? null : id;
      renderOrders();
      return;
    }
    if (!complete && !cancel && !saveAssign) return;
    e.stopPropagation();

    try {
      if (complete || cancel) {
        var oid = Number((complete || cancel).getAttribute(complete ? "data-order-complete" : "data-order-cancel"));
        await api("/api/admin/order-status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: oid, status: complete ? "completed" : "cancelled" })
        });
        await loadOrders();
      } else if (saveAssign) {
        var sid = Number(saveAssign.getAttribute("data-order-save-assign"));
        var driverVal = $("odDriver-" + sid).value;
        var vehicleVal = $("odVehicle-" + sid).value;
        await api("/api/admin/order-status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sid, driverId: driverVal || null, vehicleId: vehicleVal || null })
        });
        await loadOrders();
      }
    } catch (err) {
      alert("Could not update the order.");
    }
  });

  $("fOrderStatus").addEventListener("change", renderOrders);
  $("fOrderSearch").addEventListener("input", renderOrders);

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
