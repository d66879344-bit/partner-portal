// Shared trial-period math for the partner dashboard and the admin panel.
// The trial starts automatically (see functions/_lib/trial.js) the first time
// a partner has an order reach status 'completed', and runs for TRIAL_DAYS.
// Everything here is pure client-side date math off that one timestamp —
// there's nothing else to load or poll.
//
// Counted by calendar day (UTC), not by a rolling 24 hours from the exact
// start timestamp: the day number ticks over at UTC midnight, so it advances
// the same way for everyone regardless of what time of day the trial
// happened to start.
window.TrialInfo = (function () {
  var TRIAL_DAYS = 30;
  var DAY_MS = 24 * 60 * 60 * 1000;

  function utcDateOnly(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // startedAt: the partner's trial_started_at string from the API (UTC,
  // "YYYY-MM-DD HH:MM:SS" style), or null/empty if the trial hasn't started.
  function compute(startedAt) {
    if (!startedAt) {
      return { state: "not_started", daysLeft: null, dayNumber: null, start: null, end: null };
    }
    var start = new Date(String(startedAt).replace(" ", "T") + "Z");
    var startDay = utcDateOnly(start);
    var end = new Date(startDay + TRIAL_DAYS * DAY_MS);
    var nowDay = utcDateOnly(new Date());
    var elapsedDays = Math.round((nowDay - startDay) / DAY_MS);
    var daysLeft = Math.max(TRIAL_DAYS - elapsedDays, 0);
    var dayNumber = Math.min(TRIAL_DAYS, Math.max(1, elapsedDays + 1));
    var state = daysLeft <= 0 ? "ended" : (daysLeft <= 3 ? "ending" : "active");
    return { state: state, daysLeft: daysLeft, dayNumber: dayNumber, start: start, end: end };
  }

  return { TRIAL_DAYS: TRIAL_DAYS, compute: compute };
})();
