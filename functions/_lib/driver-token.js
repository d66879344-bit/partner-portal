// Shared helper for the driver-link feature (Cloudflare Pages Functions / Workers runtime).
// No external dependencies — uses Web Crypto only.

// A long, unguessable, unique-looking token — not derived from the order id,
// so it can't be enumerated or guessed from a visible order number.
function generateDriverToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { generateDriverToken };
