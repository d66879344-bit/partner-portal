import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.BUCKET) return Response.json({ error: "storage_not_configured" }, { status: 500 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return Response.json({ error: "invalid_id" }, { status: 400 });

  const doc = await env.DB.prepare("SELECT file_key, filename FROM documents WHERE id = ?").bind(id).first();
  if (!doc) return Response.json({ error: "not_found" }, { status: 404 });

  const obj = await env.BUCKET.get(doc.file_key);
  if (!obj) return Response.json({ error: "not_found" }, { status: 404 });

  const disposition = url.searchParams.get("dl") ? "attachment" : "inline";
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Disposition", disposition + '; filename="' + (doc.filename || "document").replace(/"/g, "") + '"');
  return new Response(obj.body, { headers });
}
