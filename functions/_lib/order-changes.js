// Decides WHEN and WHAT to tell a partner's WhatsApp group after an admin edits
// an order. Two rules:
//   1. Only if the trip is close: the pickup (old or new time, London time) is
//      within NOTIFY_WINDOW_HOURS from now. Edits made earlier are saved quietly.
//   2. The message lists exactly what changed (was -> now). Flight arrival time
//      and the pickup shift it causes are NOT listed - that goes only to the
//      driver link.
// Phone/name are never written out in the group, only "updated".

export const NOTIFY_WINDOW_HOURS = 4;
const LATE_GRACE_MIN = 120; // still notify up to 2 h after pickup time (late edits)

const S = (v) => (v == null ? "" : String(v).trim());
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Current London wall-clock time, expressed as a UTC epoch in ms (so it can be
// compared directly with a "YYYY-MM-DD" + "HH:MM" pickup read the same way).
function londonNowMs(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now || new Date());
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
}

function pickupMs(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(S(date));
  const t = /^(\d{1,2}):(\d{2})/.exec(S(time));
  if (!d || !t) return null;
  return Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
}

// True if the old or the new pickup is within the window (or can't be judged).
export function withinWindow(oldDate, oldTime, newDate, newTime, now) {
  const nowMs = londonNowMs(now);
  const mins = [pickupMs(oldDate, oldTime), pickupMs(newDate, newTime)]
    .filter((v) => v !== null)
    .map((v) => (v - nowMs) / 60000);
  if (!mins.length) return true;
  return mins.some((m) => m <= NOTIFY_WINDOW_HOURS * 60 && m >= -LATE_GRACE_MIN);
}

function shortDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(S(d));
  return m ? Number(m[3]) + " " + MON[Number(m[2]) - 1] : S(d);
}

// before/after: { order_date, order_time, pickup, dropoff, price, currency, passenger_name, passenger_phone }
// Returns the list of "Label: was -> now" lines (empty = nothing worth a message).
export function buildChanges(before, after, opts) {
  const flightChanged = !!(opts && opts.flightChanged);
  const lines = [];
  const dateCh = S(before.order_date) !== S(after.order_date);
  const timeCh = S(before.order_time) !== S(after.order_time);
  // A pickup shift caused by a flight-time change belongs to the driver link only.
  if (!flightChanged && (dateCh || timeCh)) {
    if (dateCh && timeCh) {
      lines.push("Pickup: " + shortDate(before.order_date) + " " + S(before.order_time) + " → " + shortDate(after.order_date) + " " + S(after.order_time));
    } else if (dateCh) {
      lines.push("Pickup date: " + shortDate(before.order_date) + " → " + shortDate(after.order_date));
    } else {
      lines.push("Pickup time: " + S(before.order_time) + " → " + S(after.order_time));
    }
  }
  if (S(before.pickup) !== S(after.pickup)) lines.push("Pickup address: " + S(before.pickup) + " → " + S(after.pickup));
  if (S(before.dropoff) !== S(after.dropoff)) lines.push("Drop-off: " + S(before.dropoff) + " → " + S(after.dropoff));
  if (S(before.passenger_name) !== S(after.passenger_name)) lines.push("Passenger name: updated");
  if (S(before.passenger_phone) !== S(after.passenger_phone)) lines.push("Passenger phone: updated");
  if (S(before.price) !== S(after.price) || S(before.currency) !== S(after.currency)) {
    const f = (p, c) => (S(c) ? S(c) + " " : "") + S(p);
    lines.push("Price: " + f(before.price, before.currency) + " → " + f(after.price, after.currency));
  }
  return lines;
}
