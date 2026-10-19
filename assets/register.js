(function () {
  var MAX_BYTES = 20 * 1024 * 1024;
  var OK_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  var EXT_TYPES = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

  var slotsFor = (window.DOC_DEFS && window.DOC_DEFS.slotsFor) || function () { return []; };
  var expandSlots = (window.DOC_DEFS && window.DOC_DEFS.expandSlots) || function (d) { return d; };
  // Matches the partner dashboard's Fleet & Documents tab: a vehicle photo plus
  // whichever documents the country requires, with "registration"/"insurance"
  // split into a required + an optional file (single combined PDF, or two photos).
  function vehicleSlotDefs(country) {
    return [{ id: "photo", label: "Vehicle photo", required: true }].concat(expandSlots(slotsFor(country, "vehicle")));
  }
  var COUNTRY_NAMES = {};
  (window.WORLD_COUNTRIES || []).forEach(function (row) { COUNTRY_NAMES[row[0]] = row[1]; });
  var OTHER_SLOT = [{ id: "document", label: "Document", required: false }];

  var $ = function (id) { return document.getElementById(id); };
  var state = { country: null, files: {}, labels: {} };
  var airportPicker = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function typeFor(f) {
    if (OK_TYPES[f.type]) return f.type;
    var m = /\.([a-z0-9]+)$/i.exec(f.name || "");
    return m ? (EXT_TYPES[m[1].toLowerCase()] || null) : null;
  }
  function hasFilesWithPrefix(prefix) {
    return Object.keys(state.files).some(function (k) { return k.indexOf(prefix + "_") === 0 && state.files[k]; });
  }

  /* ---------- country modal ---------- */
  function renderCountrySelect() {
    var rows = (window.WORLD_COUNTRIES || []).slice();
    var html = '<option value="" disabled selected>Select a country…</option>' +
      rows.map(function (r) { return '<option value="' + esc(r[0]) + '">' + esc(r[1]) + "</option>"; }).join("");
    $("countrySelect").innerHTML = html;
  }
  function openCountryModal() { $("countryModal").hidden = false; }
  function closeCountryModal() { $("countryModal").hidden = true; }
  function selectCountry(code) {
    state.country = code;
    state.files = {};
    $("countryLabel").textContent = COUNTRY_NAMES[code] || code;
    $("countryBar").hidden = false;
    $("formCard").hidden = false;
    closeCountryModal();
    renderAllSlots();
    if (window.AirportPicker && $("airportsPicker")) {
      if (!airportPicker) {
        airportPicker = window.AirportPicker.create($("airportsPicker"), { country: code });
      } else {
        airportPicker.setCountry(code);
      }
    }
  }

  /* ---------- file slots ---------- */
  function renderSlotsInto(containerId, prefix, defs) {
    var el = $(containerId);
    if (!el) return;
    el.innerHTML = defs.map(function (d) {
      var fid = prefix + "_" + d.id;
      state.labels[fid] = d.label;
      return '<div class="slot" id="slot-' + fid + '" data-id="' + fid + '">' +
        '<div class="slot-main"><span class="slot-label">' + esc(d.label) +
        (d.required ? '<span class="req">*</span>' : "") + '</span>' +
        '<div class="slot-file" id="slotfile-' + fid + '">No file selected</div></div>' +
        '<div class="slot-actions">' +
        '<label class="slot-btn" for="input-' + fid + '">Choose file</label>' +
        '<input type="file" id="input-' + fid + '" data-id="' + fid + '" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*">' +
        '<button type="button" class="slot-btn" data-clear="' + fid + '" hidden>Remove</button>' +
        "</div></div>";
    }).join("");
  }
  function renderAllSlots() {
    renderSlotsInto("slots-company", "company", slotsFor(state.country, "company"));
    renderSlotsInto("slots-vehicle1", "vehicle1", vehicleSlotDefs(state.country));
    renderSlotsInto("slots-vehicle2", "vehicle2", vehicleSlotDefs(state.country));
    renderSlotsInto("slots-driver1", "driver1", slotsFor(state.country, "driver"));
    renderSlotsInto("slots-driver2", "driver2", slotsFor(state.country, "driver"));
    renderSlotsInto("slots-other", "other", OTHER_SLOT);
  }
  function setSlotFile(fid, file, err) {
    var slot = $("slot-" + fid);
    if (!slot) return;
    var fileEl = $("slotfile-" + fid);
    var clearBtn = slot.querySelector("[data-clear]");
    if (err) {
      state.files[fid] = null;
      slot.classList.remove("filled"); slot.classList.add("error");
      fileEl.innerHTML = "No file selected" + '<div class="slot-err">' + esc(err) + "</div>";
      clearBtn.hidden = true;
      return;
    }
    if (!file) {
      delete state.files[fid];
      slot.classList.remove("filled", "error");
      fileEl.textContent = "No file selected";
      clearBtn.hidden = true;
      return;
    }
    state.files[fid] = file;
    slot.classList.add("filled"); slot.classList.remove("error");
    fileEl.textContent = file.name + " · " + fmtSize(file.size);
    clearBtn.hidden = false;
  }

  function setStatus(t, k) {
    var s = $("status");
    s.textContent = t || "";
    s.className = "status" + (k ? " " + k : "");
  }

  /* ---------- validation + submit ---------- */
  function validateRequiredSlots(prefix, defs, errors, blockLabel) {
    defs.forEach(function (d) {
      if (d.required && !state.files[prefix + "_" + d.id]) {
        errors.push(blockLabel + ": " + d.label);
      }
    });
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!state.country) return;

    var email = $("email").value.trim();
    var password = $("password").value;
    var password2 = $("password2").value;
    var company = $("company").value.trim();

    var phone = $("phone").value.trim();

    var errors = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
    if (password.length < 8) errors.push("Password must be at least 8 characters.");
    if (password !== password2) errors.push("Passwords do not match.");
    if (!company) errors.push("Enter the company name.");
    if (!phone) errors.push("Enter a contact phone number.");

    var v1ref = $("ref-vehicle1").value.trim().toUpperCase();
    var v2ref = $("ref-vehicle2").value.trim().toUpperCase();
    var d1ref = $("ref-driver1").value.trim();
    var d2ref = $("ref-driver2").value.trim();
    var otherDesc = $("otherDesc").value.trim();

    validateRequiredSlots("company", slotsFor(state.country, "company"), errors, "Company");

    if (!v1ref) errors.push("Vehicle 1: plate number is required");
    validateRequiredSlots("vehicle1", vehicleSlotDefs(state.country), errors, "Vehicle 1");

    var v2touched = !!v2ref || hasFilesWithPrefix("vehicle2");
    if (v2touched) {
      if (!v2ref) errors.push("Vehicle 2: plate number is required");
      validateRequiredSlots("vehicle2", vehicleSlotDefs(state.country), errors, "Vehicle 2");
    }

    if (!d1ref) errors.push("Driver 1: driver name is required");
    validateRequiredSlots("driver1", slotsFor(state.country, "driver"), errors, "Driver 1");

    var d2touched = !!d2ref || hasFilesWithPrefix("driver2");
    if (d2touched) {
      if (!d2ref) errors.push("Driver 2: driver name is required");
      validateRequiredSlots("driver2", slotsFor(state.country, "driver"), errors, "Driver 2");
    }

    if (errors.length) {
      setStatus(errors[0] + (errors.length > 1 ? " (+" + (errors.length - 1) + " more)" : ""), "err");
      return;
    }

    var toUpload = Object.keys(state.files).filter(function (id) { return state.files[id]; });

    $("submitBtn").disabled = true;
    setStatus("", "");
    $("progress").textContent = toUpload.length ? "Uploading " + toUpload.length + (toUpload.length === 1 ? " file…" : " files…") : "Submitting…";
    try {
      var fd = new FormData();
      fd.append("email", email);
      fd.append("password", password);
      fd.append("country", state.country);
      fd.append("countryName", COUNTRY_NAMES[state.country] || state.country);
      fd.append("company", company);
      fd.append("contactName", $("contactName").value.trim());
      fd.append("phone", phone);
      fd.append("airports", JSON.stringify(airportPicker ? airportPicker.getSelected() : []));
      fd.append("otherDescription", otherDesc);
      fd.append("vehicle1_ref", v1ref);
      fd.append("vehicle2_ref", v2ref);
      fd.append("driver1_ref", d1ref);
      fd.append("driver2_ref", d2ref);
      toUpload.forEach(function (fid) {
        var file = state.files[fid];
        fd.append("file_" + fid, file, file.name);
        fd.append("label_" + fid, state.labels[fid] || fid);
      });
      var res = await fetch("/api/register", { method: "POST", body: fd });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (data.error === "email_taken") throw new Error("That email is already registered.");
        throw new Error("Something went wrong. Please try again.");
      }
      $("countryBar").hidden = true;
      $("registerForm").hidden = true;
      $("successMsg").textContent = "You can sign in right away — we'll review your documents and activate order assignment once they're approved.";
      $("successCard").hidden = false;
      window.scrollTo(0, 0);
    } catch (e) {
      $("progress").textContent = "";
      setStatus(e.message || "Something went wrong. Please try again.", "err");
    } finally {
      $("submitBtn").disabled = false;
    }
  }

  /* ---------- wiring ---------- */
  renderCountrySelect();
  $("countryContinue").addEventListener("click", function () {
    var code = $("countrySelect").value;
    if (!code) { $("countryModalErr").textContent = "Please select a country."; return; }
    $("countryModalErr").textContent = "";
    selectCountry(code);
  });
  $("changeCountry").addEventListener("click", openCountryModal);

  $("registerForm").addEventListener("change", function (e) {
    var input = e.target.closest("input[type=file]"); if (!input) return;
    var fid = input.getAttribute("data-id");
    var file = input.files && input.files[0];
    if (!file) return;
    var t = typeFor(file);
    if (!t) { setSlotFile(fid, null, "Unsupported type. Use PDF, JPG, PNG, WebP or GIF."); input.value = ""; return; }
    if (file.size > MAX_BYTES) { setSlotFile(fid, null, "Larger than 20 MB."); input.value = ""; return; }
    setSlotFile(fid, file);
  });
  $("registerForm").addEventListener("click", function (e) {
    var b = e.target.closest("[data-clear]"); if (!b) return;
    var fid = b.getAttribute("data-clear");
    var input = $("input-" + fid); if (input) input.value = "";
    setSlotFile(fid, null);
  });
  $("registerForm").addEventListener("submit", submit);

  openCountryModal();
})();
