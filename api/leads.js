/* =====================================================================
   /api/leads  --  management view of captured leads.

   GET   ?status=new&limit=100   list
   PATCH {id, status}            move a lead along

   Guarded by a bearer token in ADMIN_TOKEN. That is deliberately simple:
   one shared secret for a two-person business beats a login system nobody
   maintains. Rotate it by changing the env var.

   Customer phone numbers come back in full here -- that is the point of
   the page -- so keep the token out of anything public.
   ===================================================================== */

import {
  cors, json, readBody, clientIp, rateLimit, log, HAS, CFG
} from "./_lib/core.js";
import { listLeads, updateLeadStatus } from "./_lib/db.js";

const STATUSES = ["new", "contacted", "scheduled", "done", "lost"];

function authorised(req) {
  if (!HAS.admin) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || req.headers["x-admin-token"] || "";

  /* Length-independent compare, so a wrong token cannot be narrowed down
     by timing the response. */
  const a = Buffer.from(String(token));
  const b = Buffer.from(CFG.adminToken);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const ip = clientIp(req);
  const rl = rateLimit(`admin:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  if (!HAS.admin) {
    return json(res, 503, { ok: false, error: "admin_disabled", message: "ADMIN_TOKEN is not set." });
  }
  if (!authorised(req)) {
    log("admin.denied", { ip });
    res.setHeader("WWW-Authenticate", "Bearer");
    return json(res, 401, { ok: false, error: "unauthorised" });
  }

  if (!HAS.db) {
    return json(res, 503, { ok: false, error: "no_database", message: "Leads are being forwarded but not stored." });
  }

  /* ##### SECTION: ADMIN / LIST ##### */
  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") || 100);

    const r = await listLeads({
      limit: Number.isFinite(limit) ? limit : 100,
      status: STATUSES.includes(status) ? status : null
    });
    if (!r.ok) return json(res, 502, { ok: false, error: r.reason });

    return json(res, 200, {
      ok: true,
      count: r.rows.length,
      leads: r.rows,
      counts: r.rows.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {})
    });
  }

  /* ##### SECTION: ADMIN / UPDATE ##### */
  if (req.method === "PATCH") {
    const body = await readBody(req);
    const { id, status } = body || {};
    if (!id || !STATUSES.includes(status)) {
      return json(res, 400, { ok: false, error: "invalid", allowed: STATUSES });
    }
    const r = await updateLeadStatus(id, status);
    if (!r.ok) return json(res, 502, { ok: false, error: r.reason });
    log("admin.status_changed", { id, status });
    return json(res, 200, { ok: true });
  }

  res.setHeader("Allow", "GET, PATCH");
  return json(res, 405, { ok: false, error: "method_not_allowed" });
}
