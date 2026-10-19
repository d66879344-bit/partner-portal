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
    { key: "on_the_way", label: "On the way" },
    { key: "arrived", label: "Arrived at pickup" },
    { key: "in_car", label: "Passenger on board" },
    { key: "dropped_off", label: "Dropped off" },
  ];

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
  function fmtDay(d) {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return d; }
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

  async function loadMe() {
    var data = await api("/api/partner/me");
    me = data.partner;
    $("whoCompany").textContent = me.companyName;
    $("acctId").textContent = me.accountId || "—";
    $("acctEmail").textContent = me.email;
    $("acctCompany").textContent = me.companyName;
    $("acctCountry").textContent = me.countryName || me.country;
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

  /* ---------- orders ---------- */
  async function loadOrders(silent) {
    if (!silent) {
      $("ordersStatus").textContent = "Loading…";
      $("ordersStatus").className = "status";
    }
    try {
      var data = await api("/api/partner/orders");
      lastOrders = data.orders || [];
      renderOrders(lastOrders);
    } catch (e) {
      if (silent) return;
      $("ordersStatus").textContent = "Could not load orders.";
      $("ordersStatus").className = "status err";
    }
  }
  var STATUS_FOR_TAB = { new: "offered", accepted: "accepted", completed: "completed" };
  var EMPTY_MESSAGE = { new: "No new orders right now.", accepted: "Nothing in progress right now.", completed: "No completed orders yet." };

  function updateTabCounts(allOrders) {
    var newCount = allOrders.filter(function (o) { return o.status === "offered"; }).length;
    var acceptedCount = allOrders.filter(function (o) { return o.status === "accepted"; }).length;
    $("countNew").textContent = newCount || "";
    $("countAccepted").textContent = acceptedCount || "";
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

    $("ordersStatus").textContent = orders.length ? "" : EMPTY_MESSAGE[orderTab];
    $("ordersStatus").className = "status";
    $("ordersList").innerHTML = orders.map(function (o) {
      var actions = o.status === "offered"
        ? '<div class="orow-actions">' +
          '<button type="button" class="minibtn accept" data-accept="' + o.id + '">Accept</button>' +
          '<button type="button" class="minibtn decline" data-decline="' + o.id + '">Decline</button>' +
          "</div>"
        : "";
      return '<div class="orow" data-order-open="' + o.id + '">' +
        '<div class="orow-top"><span class="orow-route">' + esc(o.pickup) + " → " + esc(o.dropoff) + "</span>" + badge(o.status) + "</div>" +
        '<div class="orow-meta">' + (o.orderNumber ? "#" + esc(o.orderNumber) : "#" + o.id) + " · " + esc(fmtDay(o.orderDate)) + (o.orderTime ? " · " + esc(o.orderTime) : "") +
        (o.vehicleType ? " · " + esc(o.vehicleType) : "") +
        (o.passengers ? " · " + esc(o.passengers) + " pax" : "") +
        (o.price ? " · " + esc(o.price) + " " + esc(o.currency || "") : "") + "</div>" +
        (o.passengerName ? '<div class="orow-meta">' + esc(o.passengerName) + "</div>" : "") +
        actions + "</div>";
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

  /* ---------- order detail (full-page view) ---------- */
  function stageTrackerHtml(o) {
    if (o.status !== "accepted" && o.status !== "completed") return "";
    var keys = STAGES.map(function (s) { return s.key; });
    var currentIndex = o.tripStage ? keys.indexOf(o.tripStage) : -1;
    var items = STAGES.map(function (s, i) {
      var state = i <= currentIndex ? "done" : (i === currentIndex + 1 && o.status === "accepted" ? "next" : "upcoming");
      return '<span class="stage-chip stage-' + state + '">' + (i <= currentIndex ? "✓ " : "") + esc(s.label) + "</span>";
    }).join("");
    var actionBtn = "";
    if (o.status === "accepted" && currentIndex < STAGES.length - 1) {
      var next = STAGES[currentIndex + 1];
      var btnLabel = next.key === "dropped_off" ? "Mark dropped off (completes the trip)" : "Mark: " + next.label;
      actionBtn = '<button type="button" class="minibtn good" style="margin-top:8px;" data-stage-next="' + next.key + '" data-stage-order="' + o.id + '">' + esc(btnLabel) + "</button>";
    }
    return '<div class="om-row"><div class="om-label">Trip progress</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">' + items + "</div>" +
      actionBtn + '<p class="status" id="omStageStatus"></p></div>';
  }

  function openOrderDetail(id) {
    var o = lastOrders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    $("odTitle").textContent = "Order " + (o.orderNumber ? "#" + o.orderNumber : "#" + o.id);

    var body =
      '<div class="om-row"><div class="om-label">Status</div>' + badge(o.status) + "</div>" +
      '<div class="om-row"><div class="om-label">Pickup</div>' + esc(o.pickup) + "</div>" +
      '<div class="om-row"><div class="om-label">Dropoff</div>' + esc(o.dropoff) + "</div>" +
      (o.flightNumber ? '<div class="om-row"><div class="om-label">Flight number</div>' + esc(o.flightNumber) + "</div>" : "") +
      '<div class="om-row"><div class="om-label">Date</div>' + esc(fmtDay(o.orderDate)) + "</div>" +
      (o.flightTime ? '<div class="om-row"><div class="om-label">Flight arrival time</div>' + esc(o.flightTime) + "</div>" : "") +
      (o.bufferMinutes != null ? '<div class="om-row"><div class="om-label">Buffer time</div>' + esc(o.bufferMinutes) + " min</div>" : "") +
      '<div class="om-row"><div class="om-label">Pickup time</div>' + esc(o.orderTime || "—") + "</div>" +
      '<div class="om-row"><div class="om-label">Vehicle type</div>' + esc(o.vehicleType || "—") + "</div>" +
      '<div class="om-row"><div class="om-label">Passengers / luggage</div>' + esc(o.passengers != null ? o.passengers : "—") + " / " + esc(o.luggage != null ? o.luggage : "—") + "</div>" +
      '<div class="om-row"><div class="om-label">Passenger name</div>' + esc(o.passengerName || "—") + "</div>" +
      '<div class="om-row"><div class="om-label">Passenger phone</div>' + esc(o.passengerPhone || "—") + "</div>" +
      (o.meetGreet ? '<div class="om-row"><div class="om-label">Meet &amp; greet</div>' + esc(o.meetGreet) + "</div>" : "") +
      (o.notes ? '<div class="om-row"><div class="om-label">Additional instructions</div>' + esc(o.notes) + "</div>" : "") +
      (o.price ? '<div class="om-row"><div class="om-label">Price</div>' + esc(o.price) + " " + esc(o.currency || "") + "</div>" : "") +
      stageTrackerHtml(o) +
      (o.status === "offered"
        ? '<div class="om-row" style="display:flex;gap:8px;">' +
          '<button type="button" class="minibtn accept" data-accept="' + o.id + '">Accept</button>' +
          '<button type="button" class="minibtn decline" data-decline="' + o.id + '">Decline</button>' +
          "</div>"
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
  }

  function closeOrderDetail() {
    $("orderDetailView").hidden = true;
    $("ordersListView").hidden = false;
  }
  $("orderDetailBack").addEventListener("click", closeOrderDetail);
  $("orderDetailView").addEventListener("click", async function (e) {
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

  /* ---------- fleet & documents ---------- */
  var UPLOAD_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5"/><path d="M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14"/></svg>';
  var FILE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h7l4 4V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M11 2.5V7h4"/></svg>';
  var CAR_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16V11.5a1.5 1.5 0 0 1 .3-.9l1.9-2.5A2 2 0 0 1 7.8 7h8.4a2 2 0 0 1 1.6 1.1l1.9 2.5a1.5 1.5 0 0 1 .3.9V16"/><path d="M4 16a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1H4Zm16 0a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1h3Z"/><circle cx="7.5" cy="16" r="1.3"/><circle cx="16.5" cy="16" r="1.3"/></svg>';
  var PERSON_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.2" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';

  var fleetTab = "company";
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
    var inner = hasFile
      ? FILE_ICON + '<div class="doc-tile-label">' + esc(label) + '</div>' +
        '<div class="doc-tile-file">' + esc(doc.filename || "file") + '</div>' + badge(doc.status)
      : UPLOAD_ICON + '<div class="doc-tile-label">' + esc(label) + '</div>' +
        (required ? '<span class="doc-required">Required</span>' : '<span class="doc-optional">Optional</span>');
    return '<div class="doc-item">' +
      '<label class="doc-tile' + (hasFile ? " has-file" : "") + '" for="file-' + uid + '">' + inner + '</label>' +
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
      '<span class="doc-tile-add-icon">+</span><div class="doc-tile-label">Add document</div>' +
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
    var inner = hasFile
      ? FILE_ICON + '<div class="doc-tile-label">' + esc(label) + '</div>' +
        '<div class="doc-tile-file">' + esc(pending.file.name) + "</div>"
      : UPLOAD_ICON + '<div class="doc-tile-label">' + esc(label) + '</div>' +
        (required ? '<span class="doc-required">Required</span>' : '<span class="doc-optional">Optional</span>');
    return '<div class="doc-item">' +
      '<label class="doc-tile' + (hasFile ? " has-file" : "") + '" for="file-' + uid + '">' + inner + '</label>' +
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
      ["company", "vehicles", "drivers"].forEach(function (k) { $("fleetTab-" + k).hidden = k !== fleetTab; });
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
