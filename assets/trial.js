// Shared trial-period math for the partner dashboard and the admin panel.
// The trial starts automatically (see functions/_lib/trial.js) the first time
// a partner has an order reach status 'completed', and runs for TRIAL_DAYS.
// Everything here is pure client-side date math off that one timestamp —
// there's nothing else to load or poll.
window.TrialInfo = (function () {
  var TRIAL_DAYS = 30;
  var DAY_MS = 24 * 60 * 60 * 1000;

  // startedAt: the partner's trial_started_at string from the API (UTC,
  // "YYYY-MM-DD HH:MM:SS" style), or null/empty if the trial hasn't started.
  function compute(startedAt) {
    if (!startedAt) {
      return { state: "not_started", daysLeft: null, dayNumber: null, start: null, end: null };
    }
    var start = new Date(String(startedAt).replace(" ", "T") + "Z");
    var end = new Date(start.getTime() + TRIAL_DAYS * DAY_MS);
    var now = new Date();
    var daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
    var dayNumber = Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - Math.max(daysLeft, 0)));
    var state = daysLeft <= 0 ? "ended" : (daysLeft <= 3 ? "ending" : "active");
    return { state: state, daysLeft: Math.max(daysLeft, 0), dayNumber: dayNumber, start: start, end: end };
  }

  return { TRIAL_DAYS: TRIAL_DAYS, compute: compute };
})();
