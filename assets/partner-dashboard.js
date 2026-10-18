(function () {
  var $ = function (id) { return document.getElementById(id); };
  var slotsFor = (window.DOC_DEFS && window.DOC_DEFS.slotsFor) || function () { return []; };
  var MAX_BYTES = 20 * 1024 * 1024;
  var OK_TYPES = { "application/pdf": 1, "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1 };
  var EXT_TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

  var me = null;
  var lastOrders = [];
  var myFleet = { vehicles: [], drivers: [] };
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

  /* ---------- order sub-tabs (New / Accepted) ---------- */
  var orderTab = "new";
  $("orderTabs").querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      $("orderTabs").querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-pressed", String(t === tab)); });
      orderTab = tab.getAttribute("data-order-tab");
      renderOrders(lastOrders);
    });
  });

  /* ---------- account / nav ---------- */
  async function loadMe() {
    var data = await api("/api/partner/me");
    me = data.partner;
    $("whoCompany").textContent = me.companyName;
    $("acctEmail").textContent = me.email;
    $("acctCompany").textContent = me.companyName;
    $("acctCountry").textContent = me.countryName || me.country;
    $("acctStatus").innerHTML = badge(me.status);
    $("acctSince").textContent = fmtDate(me.createdAt);
    $("pendingBanner").hidden = me.status === "active";
  }

  $("logoutBtn").addEventListener("click", async function () {
    try { await fetch("/api/logout", { method: "POST" }); } catch (e) {}
    window.location.href = "/login.html";
  });

  /* ---------- orders ---------- */
  async function loadOrders() {
    $("ordersStatus").textContent = "Loading…";
    $("ordersStatus").className = "status";
    try {
      var data = await api("/api/partner/orders");
      lastOrders = data.orders || [];
      renderOrders(lastOrders);
    } catch (e) {
      $("ordersStatus").textContent = "Could not load orders.";
      $("ordersStatus").className = "status err";
    }
  }
  function renderOrders(allOrders) {
    var orders = allOrders.filter(function (o) {
      return orderTab === "new" ? o.status === "offered" : o.status !== "offered";
    });
    $("ordersStatus").textContent = orders.length ? "" : (orderTab === "new" ? "No new orders right now." : "No accepted orders yet.");
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
    if (open) openOrderModal(Number(open.getAttribute("data-order-open")));
  });

  /* ---------- order detail modal ---------- */
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

  function openOrderModal(id) {
    var o = lastOrders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    $("omTitle").textContent = "Order " + (o.orderNumber ? "#" + o.orderNumber : "#" + o.id);

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

    $("omBody").innerHTML = body;
    $("orderModalBackdrop").hidden = false;

    var stageBtn = $("omBody").querySelector("[data-stage-next]");
    if (stageBtn) {
      stageBtn.addEventListener("click", async function () {
        var stage = this.getAttribute("data-stage-next");
        var orderId = Number(this.getAttribute("data-stage-order"));
        this.disabled = true;
        try {
          await api("/api/partner/order-stage", { method: "POST", json: true, body: JSON.stringify({ id: orderId, stage: stage }) });
          await loadOrders();
          openOrderModal(orderId);
        } catch (e) {
          $("omStageStatus").textContent = "Could not update. Try again.";
          $("omStageStatus").className = "status err";
          this.disabled = false;
        }
      });
    }
  }

  function closeOrderModal() { $("orderModalBackdrop").hidden = true; }
  $("orderModalClose").addEventListener("click", closeOrderModal);
  $("orderModalBackdrop").addEventListener("click", async function (e) {
    if (e.target === $("orderModalBackdrop")) { closeOrderModal(); return; }
    var acc = e.target.closest("[data-accept]");
    var dec = e.target.closest("[data-decline]");
    if (!acc && !dec) return;
    var id = Number((acc || dec).getAttribute(acc ? "data-accept" : "data-decline"));
    var btn = acc || dec;
    btn.disabled = true;
    try {
      await api("/api/partner/respond", { method: "POST", json: true, body: JSON.stringify({ id: id, action: acc ? "accept" : "decline" }) });
      closeOrderModal();
      loadOrders();
    } catch (err) {
      btn.disabled = false;
    }
  });

  /* ---------- fleet & documents ---------- */
  function docListHtml(docs) {
    if (!docs.length) return '<p class="docrow" style="color:var(--ink-2);">No documents uploaded yet.</p>';
    return docs.map(function (d) {
      return '<div class="docrow"><div class="docrow-main">' + esc(d.label) +
        (d.reviewNote ? " — " + esc(d.reviewNote) : "") +
        ' · <a href="/api/partner/file?id=' + d.id + '" target="_blank" rel="noopener">' + esc(d.filename || "file") + "</a></div>" +
        badge(d.status) + "</div>";
    }).join("");
  }
  function addFormHtml(ownerType, ownerId, defs) {
    var uid = ownerType + "-" + (ownerId || "x");
    var opts = defs.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.label) + "</option>"; }).join("");
    return '<div class="addrow" data-owner-type="' + ownerType + '" data-owner-id="' + (ownerId || "") + '">' +
      '<select id="field-' + uid + '">' + opts + '<option value="__custom__">Other / custom document…</option></select>' +
      '<input type="text" id="custom-' + uid + '" placeholder="Document name" hidden>' +
      '<label class="minibtn" for="file-' + uid + '">Choose file</label>' +
      '<input type="file" id="file-' + uid + '" data-uid="' + uid + '" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*">' +
      '<span id="filename-' + uid + '" style="font-size:12px;color:var(--ink-2);"></span>' +
      "</div>";
  }

  async function loadFleet() {
    var data = await api("/api/partner/fleet");
    var country = me ? me.country : null;
    myFleet = { vehicles: data.vehicles || [], drivers: data.drivers || [] };

    $("companyDocs").innerHTML = docListHtml(data.company.documents) + addFormHtml("company", null, slotsFor(country, "company"));
    $("otherDocs").innerHTML = docListHtml(data.other.documents) + addFormHtml("other", null, [{ id: "document", label: "Document" }]);

    $("vehiclesList").innerHTML = data.vehicles.map(function (v) {
      return '<div class="block"><div class="block-title">' + esc(v.plate || ("Vehicle #" + v.id)) + (v.category ? " — " + esc(v.category) : "") + "</div>" +
        docListHtml(v.documents) + addFormHtml("vehicle", v.id, slotsFor(country, "vehicle")) + "</div>";
    }).join("") || '<p style="color:var(--ink-2);font-size:13px;">No vehicles yet — add one below.</p>';

    $("driversList").innerHTML = data.drivers.map(function (d) {
      return '<div class="block"><div class="block-title">' + esc(d.fullName || ("Driver #" + d.id)) + "</div>" +
        docListHtml(d.documents) + addFormHtml("driver", d.id, slotsFor(country, "driver")) + "</div>";
    }).join("") || '<p style="color:var(--ink-2);font-size:13px;">No drivers yet — add one below.</p>';
  }

  document.body.addEventListener("change", async function (e) {
    var input = e.target.closest("input[type=file][data-uid]");
    if (!input) return;
    var file = input.files && input.files[0];
    if (!file) return;
    var row = input.closest(".addrow");
    var ownerType = row.getAttribute("data-owner-type");
    var ownerId = row.getAttribute("data-owner-id") || null;
    var uid = input.getAttribute("data-uid");
    var select = $("field-" + uid);
    var field = select.value;
    var label = field === "__custom__" ? ($("custom-" + uid).value.trim() || "Document") : select.options[select.selectedIndex].text;
    if (field === "__custom__") field = "custom_" + Date.now();

    if (!typeFor(file)) { $("filename-" + uid).textContent = "Unsupported file type."; input.value = ""; return; }
    if (file.size > MAX_BYTES) { $("filename-" + uid).textContent = "File larger than 20 MB."; input.value = ""; return; }

    $("filename-" + uid).textContent = "Uploading…";
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
      $("filename-" + uid).textContent = "Upload failed. Try again.";
    }
  });

  document.body.addEventListener("change", function (e) {
    var select = e.target.closest("select[id^='field-']");
    if (!select) return;
    var uid = select.id.slice(6);
    var customInput = $("custom-" + uid);
    if (customInput) customInput.hidden = select.value !== "__custom__";
  });

  $("addVehicleBtn").addEventListener("click", async function () {
    var plate = $("newPlate").value.trim();
    if (!plate) { $("newPlate").focus(); return; }
    this.disabled = true;
    try {
      await api("/api/partner/vehicles", { method: "POST", json: true, body: JSON.stringify({ plate: plate, category: $("newCategory").value.trim() }) });
      $("newPlate").value = ""; $("newCategory").value = "";
      await loadFleet();
    } finally { this.disabled = false; }
  });

  $("addDriverBtn").addEventListener("click", async function () {
    var name = $("newDriver").value.trim();
    if (!name) { $("newDriver").focus(); return; }
    this.disabled = true;
    try {
      await api("/api/partner/drivers", { method: "POST", json: true, body: JSON.stringify({ fullName: name }) });
      $("newDriver").value = "";
      await loadFleet();
    } finally { this.disabled = false; }
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
})();
