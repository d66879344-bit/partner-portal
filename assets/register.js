(function () {
  var COUNTRY_NAMES = {};
  (window.WORLD_COUNTRIES || []).forEach(function (row) { COUNTRY_NAMES[row[0]] = row[1]; });

  var $ = function (id) { return document.getElementById(id); };
  var state = { country: null, serviceCity: "" };
  var airportPicker = null;
  var countryCombo = null;
  var cityCombo = null;

  function setStatus(t, k) {
    var s = $("status");
    s.textContent = t || "";
    s.className = "status" + (k ? " " + k : "");
  }

  /* ---------- country + city + airports ---------- */
  function onCountryChange(code) {
    state.country = code || null;

    var cities = code && window.citiesForCountry ? window.citiesForCountry(code) : [];
    if (cityCombo) {
      cityCombo.clear();
      cityCombo.setItems(cities.map(function (c) { return [c, c]; }));
    }
    state.serviceCity = "";

    if (window.AirportPicker && $("airportsPicker")) {
      if (!airportPicker) {
        airportPicker = window.AirportPicker.create($("airportsPicker"), { country: code });
      } else {
        airportPicker.setCountry(code);
      }
    }
  }
  function onCityChange(city) {
    state.serviceCity = city || "";
    if (airportPicker) airportPicker.setCity(city || null);
  }

  /* ---------- validation + submit ---------- */
  async function submit(ev) {
    ev.preventDefault();

    var email = $("email").value.trim();
    var password = $("password").value;
    var company = $("company").value.trim();
    var phone = $("phone").value.trim();

    var errors = [];
    if (!company) errors.push("Enter the company name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
    if (password.length < 8) errors.push("Password must be at least 8 characters.");
    if (!phone) errors.push("Enter a contact phone number.");
    if (!state.country) errors.push("Select a country.");

    if (errors.length) {
      setStatus(errors[0] + (errors.length > 1 ? " (+" + (errors.length - 1) + " more)" : ""), "err");
      return;
    }

    $("submitBtn").disabled = true;
    setStatus("", "");
    $("progress").textContent = "Submitting…";
    try {
      var res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          password: password,
          country: state.country,
          countryName: COUNTRY_NAMES[state.country] || state.country,
          company: company,
          phone: phone,
          serviceCity: state.serviceCity || "",
          airports: airportPicker ? airportPicker.getSelected() : [],
        }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (data.error === "email_taken") throw new Error("That email is already registered.");
        throw new Error("Something went wrong. Please try again.");
      }
      $("registerForm").hidden = true;
      $("successMsg").textContent = "You can sign in right away. Add your vehicles, drivers and documents from your dashboard — we'll review them there before activating order assignment.";
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
  if (window.Combobox) {
    countryCombo = window.Combobox.create($("countryCombo"), {
      items: (window.WORLD_COUNTRIES || []).map(function (r) { return [r[0], r[1]]; }),
      placeholder: "Start typing a country…",
      onChange: onCountryChange,
    });
    cityCombo = window.Combobox.create($("cityCombo"), {
      items: [],
      placeholder: "Start typing a city…",
      allowFreeText: true,
      onChange: onCityChange,
    });
  }

  $("passwordToggle").addEventListener("click", function () {
    var input = $("password");
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    $("passwordToggle").textContent = show ? "Hide" : "Show";
  });

  $("registerForm").addEventListener("submit", submit);
})();
