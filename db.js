/* =====================================================================
   Persistence. Supabase Postgres over PostgREST via plain fetch -- no
   client library, so there is no version drift and nothing extra to cold
   start. Every function resolves to {ok, ...} and never throws, because
   a storage failure must not take the request down with it.
   ===================================================================== */

import { CFG, HAS, withTimeout, log } from "./core.js";

const TIMEOUT = 6000;

function headers(extra = {}) {
  return {
    apikey: CFG.supabase.key,
    Authorization: `Bearer ${CFG.supabase.key}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function rest(path, init) {
  const url = `${CFG.supabase.url}/rest/v1/${path}`;
  const res = await withTimeout(fetch(url, init), TIMEOUT, "supabase");
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!res.ok) {
    const err = new Error(`supabase ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/* ##### SECTION: DB / LEADS ##### */
export async function insertLead(data, meta) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };

  try {
    const rows = await rest("leads", {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify([{
        name: data.name,
        phone: data.phone,
        service: data.service,
        city: data.city,
        address: data.address,
        urgency: data.urgency,
        notes: data.notes,
        source: data.source,
        page: data.page,
        status: "new",
        ip_hash: meta.ipHash,
        referrer: meta.referrer || null,
        idempotency_key: meta.idempotencyKey || null,
        conversation_id: meta.conversationId || null
      }])
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok: true, id: row?.id, row };
  } catch (err) {
    /* 23505 = unique violation on idempotency_key: the same submission
       arrived twice. That is a success from the customer's point of view. */
    if (err.status === 409 || err.body?.code === "23505") {
      log("lead.duplicate", { key: meta.idempotencyKey });
      return { ok: true, duplicate: true };
    }
    log("lead.insert_failed", { status: err.status, msg: err.message });
    return { ok: false, reason: "db_error", error: err.message };
  }
}

export async function listLeads({ limit = 100, status = null } = {}) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    const q = new URLSearchParams({
      select: "*",
      order: "created_at.desc",
      limit: String(Math.min(limit, 500))
    });
    if (status) q.set("status", `eq.${status}`);
    const rows = await rest(`leads?${q}`, { method: "GET", headers: headers() });
    return { ok: true, rows: rows || [] };
  } catch (err) {
    return { ok: false, reason: "db_error", error: err.message };
  }
}

export async function updateLeadStatus(id, status) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    await rest(`leads?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "db_error", error: err.message };
  }
}

/* ##### SECTION: DB / CONVERSATIONS ##### */
/* One row per chat session, upserted as it grows, so an escalation can
   hand a person the whole transcript instead of a summary line. */
export async function saveConversation({ id, transcript, page, escalated, reason, summary }) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    const rows = await rest("conversations?on_conflict=id", {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify([{
        id,
        transcript,
        page: page || null,
        escalated_at: escalated ? new Date().toISOString() : null,
        escalation_reason: reason || null,
        summary: summary || null,
        updated_at: new Date().toISOString()
      }])
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok: true, id: row?.id || id };
  } catch (err) {
    log("conversation.save_failed", { msg: err.message });
    return { ok: false, reason: "db_error", error: err.message };
  }
}

/* ##### SECTION: DB / EVENTS ##### */
/* Append-only trail. Mostly useful for answering "did the owner actually
   get told about this lead, and when". Failures here are swallowed. */
export async function recordEvent(kind, payload) {
  if (!HAS.db) return { ok: false };
  try {
    await rest("events", {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify([{ kind, payload }])
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/* ##### SECTION: DB / HEALTH ##### */
export async function pingDb() {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    await rest("leads?select=id&limit=1", { method: "GET", headers: headers() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "unreachable", error: err.message };
  }
}
