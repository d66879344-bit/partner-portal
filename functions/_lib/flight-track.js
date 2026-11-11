// Flight tracking via AeroDataBox (RapidAPI). Entirely optional: does nothing
// unless AERODATABOX_KEY is set in the Cloudflare Pages environment variables.
//
// What it does: for orders that have a flight number, it looks up the flight's
// expected ARRIVAL time and keeps the order's "Flight arrival" up to date. If
// the order has a Buffer time (minutes) and its pickup time was not set by hand,
// the pickup time (and date, across midnight) is recalculated as arrival + buffer.
// These automatic updates never send WhatsApp messages.
//
// Data is never kept as raw API responses — only the order's own fields are
// updated (AeroDataBox terms allow storing raw data for only 7 days).
//
// New order columns are added automatically on first use (no manual migration):
//   flight_buffer_minutes, pickup_manual, flight_status, flight_checked_at,
//   flight_arrival_utc, flight_stage, flight_auto_note

const COLUMNS = [
  ["flight_buffer_minutes", "INTEGER"],
  ["pickup_manual", "INTEGER NOT NULL DEFAULT 0"],
  ["flight_status", "TEXT"],
  ["flight_checked_at", "TEXT"],
  ["flight_arrival_utc", "TEXT"],
  ["flight_stage", "INTEGER NOT NULL DEFAULT 0"],
  ["flight_auto_note", "TEXT"],
];
let columnsReady = null;

export function ensureFlightColumns(db) {
  if (!columnsReady) {
    columnsReady = (async function () {
      const info = await db.prepare("PRAGMA table_info(orders)").all();
      const have = {};
      (info.results || []).forEach((r) => { have[r.name] = true; });
      for (const [name, type] of COLUMNS) {
        if (!have[name]) {
          try { await db.prepare("ALTER TABLE orders ADD COLUMN " + name + " " + type).run(); } catch (e) {}
        }
      }
    })().catch(() => { columnsReady = null; });
  }
  return columnsReady;
}

// "HH:MM" + minutes on a "YYYY-MM-DD" date -> { date, time } (rolls over midnight).
export function addMinutes(dateStr, timeStr, minutes) {
  const m = /^(\d{2}):(\d{2})$/.exec(timeStr || "");
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  if (!m || !d) return null;
  const t = Date.UTC(+d[1], +d[2] - 1, +d[3], +m[1], +m[2]) + Number(minutes || 0) * 60000;
  const x = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: x.getUTCFullYear() + "-" + p(x.getUTCMonth() + 1) + "-" + p(x.getUTCDate()),
    time: p(x.getUTCHours()) + ":" + p(x.getUTCMinutes()),
  };
}

// Is the pickup time typed by hand (not = arrival + buffer)?
export function computePickupManual(flightTime, bufferMin, orderTime) {
  if (!orderTime) return 0;
  if (!flightTime || bufferMin == null || bufferMin === "" || !Number.isFinite(Number(bufferMin))) return 1;
  const exp = addMinutes("2000-01-01", flightTime, Number(bufferMin));
  return exp && exp.time === orderTime ? 0 : 1;
}

function parseLocal(s) {
  // "2026-11-13 07:25+00:00" -> { date: "2026-11-13", time: "07:25" }
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(s || "");
  return m ? { date: m[1], time: m[2] } : null;
}
function parseUtcMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

// Pick the arrival time we trust: official revised time, else our predicted time
// if it differs from the schedule by 10+ minutes, else the schedule.
function pickArrival(arrival) {
  const sched = arrival.scheduledTime || {};
  const rev = arrival.revisedTime;
  const pred = arrival.predictedTime;
  if (rev && rev.local) return rev;
  if (pred && pred.local && sched.utc) {
    const diff = Math.abs((parseUtcMs(pred.utc) || 0) - (parseUtcMs(sched.utc) || 0)) / 60000;
    if (diff >= 10) return pred;
  }
  return sched.local ? sched : pred || null;
}

// "RYANAIR FR983" / "RYANAIRFR983" / "FR 983" / "FR-983" -> "FR983".
// Already-valid codes (IATA "FR983", ICAO "RYR983") are kept as they are.
export function normalizeFlightNumber(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(s)) return s;
  const m = s.match(/[A-Z0-9]{2}\d{1,4}[A-Z]?$/);
  return m ? m[0] : s;
}

export async function fetchFlight(env, flightNumber, dateStr) {
  const num = normalizeFlightNumber(flightNumber);
  const url = "https://aerodatabox.p.rapidapi.com/flights/number/" + encodeURIComponent(num) + "/" + encodeURIComponent(dateStr);
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": env.AERODATABOX_KEY, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" },
  });
  if (res.status === 204 || res.status === 404) return { notFound: true };
  if (!res.ok) return { error: "HTTP " + res.status };
  let list = null;
  try { list = await res.json(); } catch (e) { return { error: "bad_json" }; }
  if (!Array.isArray(list) || !list.length) return { notFound: true };
  // Prefer the leg that lands on the order's date.
  const withArr = list.filter((f) => f && f.arrival);
  if (!withArr.length) return { notFound: true };
  const sameDay = withArr.filter((f) => {
    const t = pickArrival(f.arrival);
    const l = t && parseLocal(t.local);
    return l && l.date === dateStr;
  });
  const f = (sameDay.length ? sameDay : withArr)[0];
  const t = pickArrival(f.arrival);
  const local = t && parseLocal(t.local);
  if (!local) return { notFound: true };
  return {
    arrivalDate: local.date,
    arrivalTime: local.time,
    arrivalUtcMs: parseUtcMs(t.utc),
    status: f.status || "",
  };
}

const THRESHOLDS_MIN = [360, 240, 180, 120, 60, 30]; // minutes before arrival

function stageFor(arrivalUtcMs, nowMs) {
  let n = 0;
  THRESHOLDS_MIN.forEach((m) => { if (nowMs >= arrivalUtcMs - m * 60000) n++; });
  return n;
}

const DONE_STATUSES = ["Arrived", "Canceled", "CanceledUncertain", "Diverted"];

// Looks the flight up and updates the order. Returns a small summary object.
export async function trackOrder(env, order) {
  const date = order.order_date;
  const f = await fetchFlight(env, order.flight_number, date);
  const now = new Date();
  const nowIso = now.toISOString();
  if (f.error) return { ok: false, error: f.error };
  if (f.notFound) {
    await env.DB.prepare("UPDATE orders SET flight_checked_at = ?, flight_status = ?, flight_auto_note = ? WHERE id = ?")
      .bind(nowIso, "Not found", "Flight not found for this date", order.id).run();
    return { ok: true, found: false };
  }
  const sets = ["flight_checked_at = ?", "flight_status = ?"];
  const vals = [nowIso, f.status || null];
  let note = null;
  let changed = false;
  let pickup = null;

  if (f.arrivalUtcMs != null) {
    sets.push("flight_arrival_utc = ?", "flight_stage = ?");
    vals.push(new Date(f.arrivalUtcMs).toISOString(), stageFor(f.arrivalUtcMs, now.getTime()));
  }

  if (f.status === "Canceled" || f.status === "CanceledUncertain") {
    note = "Flight is reported as cancelled";
  } else if ((order.flight_time || "") !== f.arrivalTime) {
    sets.push("flight_time = ?");
    vals.push(f.arrivalTime);
    changed = true;
    const stamp = nowIso.slice(11, 16) + " UTC";
    note = (order.flight_time ? "Arrival " + order.flight_time + " → " + f.arrivalTime : "Arrival set to " + f.arrivalTime) + " (auto, " + stamp + ")";
    const buf = order.flight_buffer_minutes;
    if (buf != null && Number(order.pickup_manual || 0) === 0) {
      const p = addMinutes(f.arrivalDate, f.arrivalTime, Number(buf));
      // Safety: ignore a result more than a day away from the order's date.
      const dayDiff = p ? Math.abs((parseUtcMs(p.date + " 00:00") - parseUtcMs(date + " 00:00")) / 86400000) : 99;
      if (p && dayDiff <= 1) {
        sets.push("order_time = ?", "order_date = ?");
        vals.push(p.time, p.date);
        pickup = p.time;
        note += ", pickup " + p.time;
      }
    }
  }
  if (note) { sets.push("flight_auto_note = ?"); vals.push(note); }
  vals.push(order.id);
  await env.DB.prepare("UPDATE orders SET " + sets.join(", ") + " WHERE id = ?").bind(...vals).run();
  return { ok: true, found: true, changed, arrival: f.arrivalTime, status: f.status, pickup };
}

// Orders that need a check right now (used by the scheduled job).
export async function dueOrders(db, limit) {
  const { results } = await db.prepare(
    `SELECT id, order_number, flight_number, flight_time, flight_buffer_minutes, pickup_manual, order_date, order_time,
            flight_checked_at, flight_arrival_utc, flight_stage, flight_status
     FROM orders
     WHERE flight_number IS NOT NULL AND TRIM(flight_number) != ''
       AND status IN ('offered', 'accepted')
       AND order_date BETWEEN date('now', '-1 day') AND date('now', '+1 day')`
  ).all();
  const now = Date.now();
  const due = [];
  (results || []).forEach((o) => {
    if (DONE_STATUSES.indexOf(o.flight_status) !== -1) return;
    if (o.flight_status === "Not found" && o.flight_checked_at && now - Date.parse(o.flight_checked_at) < 3 * 3600000) return;
    if (!o.flight_checked_at) { due.push(o); return; }
    const arr = o.flight_arrival_utc ? Date.parse(o.flight_arrival_utc) : NaN;
    if (!Number.isFinite(arr)) return;
    if (now > arr + 2 * 3600000) return; // long past
    if (stageFor(arr, now) > Number(o.flight_stage || 0)) due.push(o);
  });
  return due.slice(0, limit || 12);
}
