// Shared auth helpers for the partner portal (Cloudflare Pages Functions / Workers runtime).
// No external dependencies — uses Web Crypto only.

const SESSION_COOKIE = "partner_session";
const SESSION_DAYS = 30;

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

async function verifyPassword(password, saltHex, expectedHashHex) {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHashHex);
}

async function hmac(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

async function signSession(partnerId, secret, days) {
  const exp = Date.now() + (days || SESSION_DAYS) * 86400000;
  const payload = partnerId + "." + exp;
  const sig = await hmac(payload, secret);
  return payload + "." + sig;
}

async function verifySessionToken(token, secret) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = await hmac(id + "." + exp, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  if (Date.now() > Number(exp)) return null;
  const partnerId = Number(id);
  if (!partnerId || Number.isNaN(partnerId)) return null;
  return partnerId;
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function sessionCookieHeader(token, days) {
  const maxAge = (days || SESSION_DAYS) * 86400;
  return SESSION_COOKIE + "=" + encodeURIComponent(token) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

function clearSessionCookieHeader() {
  return SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

// Resolves the logged-in partner id from the request's session cookie, or null.
// Also rejects a still-valid session if the account has since been blocked by an admin.
async function getPartnerId(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const partnerId = await verifySessionToken(token, env.SESSION_SECRET);
  if (!partnerId) return null;
  if (env.DB) {
    const row = await env.DB.prepare("SELECT status FROM partners WHERE id = ?").bind(partnerId).first();
    if (!row || row.status === "blocked") return null;
  }
  return partnerId;
}

function checkAdminSecret(request, env) {
  const url = new URL(request.url);
  const secret = request.headers.get("x-admin-secret") || url.searchParams.get("secret");
  return !!secret && !!env.ADMIN_SECRET && secret === env.ADMIN_SECRET;
}

export {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  signSession,
  verifySessionToken,
  parseCookies,
  sessionCookieHeader,
  clearSessionCookieHeader,
  getPartnerId,
  checkAdminSecret,
};
