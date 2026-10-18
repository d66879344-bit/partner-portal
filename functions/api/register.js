import { hashPassword } from "../_lib/auth.js";

const ALLOWED = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 20 * 1024 * 1024;
const COUNTRY_RE = /^[A-Z]{2}$/;
const FILE_FIELD_RE = /^file_(company|vehicle1|vehicle2|driver1|driver2|other)_(.+)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.BUCKET) return Response.json({ error: "storage_not_configured" }, { status: 500 });

  try {
    const form = await request.formData();
    const email = (form.get("email") || "").toString().trim().toLowerCase();
    const password = (form.get("password") || "").toString();
    const country = (form.get("country") || "").toString().toUpperCase();
    const countryName = (form.get("countryName") || "").toString().trim().slice(0, 100);
    const company = (form.get("company") || "").toString().trim();
    const contactName = (form.get("contactName") || "").toString().trim().slice(0, 150);
    const contact = (form.get("contact") || "").toString().trim().slice(0, 200);
    const otherDescription = (form.get("otherDescription") || "").toString().trim().slice(0, 500);
    const vehicle1Ref = (form.get("vehicle1_ref") || "").toString().trim().slice(0, 50);
    const vehicle2Ref = (form.get("vehicle2_ref") || "").toString().trim().slice(0, 50);
    const driver1Ref = (form.get("driver1_ref") || "").toString().trim().slice(0, 200);
    const driver2Ref = (form.get("driver2_ref") || "").toString().trim().slice(0, 200);

    if (!EMAIL_RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "weak_password" }, { status: 400 });
    if (!COUNTRY_RE.test(country) || !company) {
      return Response.json({ error: "invalid_submission" }, { status: 400 });
    }

    const existing = await env.DB.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first();
    if (existing) return Response.json({ error: "email_taken" }, { status: 409 });

    const { hash, salt } = await hashPassword(password);

    const partnerInsert = await env.DB.prepare(
      `INSERT INTO partners (email, password_hash, password_salt, company_name, contact_name, phone, country, country_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(email, hash, salt, company.slice(0, 200), contactName, contact, country, countryName || country).run();
    const partnerId = partnerInsert.meta.last_row_id;

    // Vehicles
    let vehicle1Id = null, vehicle2Id = null;
    if (vehicle1Ref || hasAnyFile(form, "vehicle1")) {
      const r = await env.DB.prepare("INSERT INTO vehicles (partner_id, plate) VALUES (?, ?)").bind(partnerId, vehicle1Ref).run();
      vehicle1Id = r.meta.last_row_id;
    }
    if (vehicle2Ref || hasAnyFile(form, "vehicle2")) {
      const r = await env.DB.prepare("INSERT INTO vehicles (partner_id, plate) VALUES (?, ?)").bind(partnerId, vehicle2Ref).run();
      vehicle2Id = r.meta.last_row_id;
    }

    // Drivers
    let driver1Id = null, driver2Id = null;
    if (driver1Ref || hasAnyFile(form, "driver1")) {
      const r = await env.DB.prepare("INSERT INTO drivers (partner_id, full_name) VALUES (?, ?)").bind(partnerId, driver1Ref).run();
      driver1Id = r.meta.last_row_id;
    }
    if (driver2Ref || hasAnyFile(form, "driver2")) {
      const r = await env.DB.prepare("INSERT INTO drivers (partner_id, full_name) VALUES (?, ?)").bind(partnerId, driver2Ref).run();
      driver2Id = r.meta.last_row_id;
    }

    const base = "partners/" + partnerId + "/" + slugify(company) + "/";
    const ownerFor = {
      company: { type: "company", id: null },
      vehicle1: { type: "vehicle", id: vehicle1Id },
      vehicle2: { type: "vehicle", id: vehicle2Id },
      driver1: { type: "driver", id: driver1Id },
      driver2: { type: "driver", id: driver2Id },
      other: { type: "other", id: null },
    };

    const inserts = [];
    for (const [fieldKey, value] of form.entries()) {
      if (!(value instanceof File)) continue;
      const m = FILE_FIELD_RE.exec(fieldKey);
      if (!m) continue;
      const blockKey = m[1];
      const slotId = m[2];
      const owner = ownerFor[blockKey];
      if (!owner || (blockKey.indexOf("vehicle") === 0 && owner.id == null) || (blockKey.indexOf("driver") === 0 && owner.id == null)) {
        // vehicle2/driver2 block not created (ref empty) — skip its files
        continue;
      }
      if (!value.size) continue;
      if (value.size > MAX_BYTES) {
        return Response.json({ error: "file_too_large", field: fieldKey }, { status: 400 });
      }
      const ext = ALLOWED[value.type];
      if (!ext) {
        return Response.json({ error: "invalid_type", field: fieldKey }, { status: 400 });
      }
      const label = (form.get("label_" + blockKey + "_" + slotId) || slotId).toString().slice(0, 150);
      const objectKey = base + blockKey + "-" + slotId + "-" + Date.now() + "." + ext;
      await env.BUCKET.put(objectKey, value, { httpMetadata: { contentType: value.type } });
      const finalLabel = blockKey === "other" && otherDescription ? otherDescription : label;
      inserts.push(
        env.DB.prepare(
          `INSERT INTO documents (partner_id, owner_type, owner_id, field, label, filename, file_key, content_type, size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(partnerId, owner.type, owner.id, slotId, finalLabel, value.name || slotId, objectKey, value.type, value.size)
      );
    }
    if (inserts.length) await env.DB.batch(inserts);

    return Response.json({ ok: true, id: partnerId });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}

function hasAnyFile(form, prefix) {
  for (const [key, value] of form.entries()) {
    if (value instanceof File && value.size && key.indexOf("file_" + prefix + "_") === 0) return true;
  }
  return false;
}
