// Generates a random, non-repeating 6-digit account id in the format
// "id048213". Checks the partners table for a clash and retries a bounded
// number of times before giving up (extremely unlikely with ~1M possible
// values unless the table is nearly full).
export async function generateUniqueAccountId(env) {
  for (let i = 0; i < 25; i++) {
    const n = Math.floor(Math.random() * 1000000);
    const candidate = "id" + String(n).padStart(6, "0");
    const clash = await env.DB.prepare("SELECT id FROM partners WHERE account_id = ?").bind(candidate).first();
    if (!clash) return candidate;
  }
  return null;
}
