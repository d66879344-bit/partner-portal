(function () {
  var $ = function (id) { return document.getElementById(id); };

  function setStatus(t, k) {
    var s = $("status");
    s.textContent = t || "";
    s.className = "status" + (k ? " " + k : "");
  }

  $("loginForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var email = $("email").value.trim();
    var password = $("password").value;
    if (!email || !password) { setStatus("Enter your email and password.", "err"); return; }

    $("loginBtn").disabled = true;
    setStatus("", "");
    try {
      var res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        if (data.error === "blocked") {
          setStatus("Your account has been blocked. Contact us for details.", "err");
        } else {
          setStatus("Incorrect email or password.", "err");
        }
        return;
      }
      window.location.href = "/partner-dashboard.html";
    } catch (e) {
      setStatus("Something went wrong. Please try again.", "err");
    } finally {
      $("loginBtn").disabled = false;
    }
  });
})();
