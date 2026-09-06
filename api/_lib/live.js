/* =====================================================================
   Live handoff storage: messages, presence, and the Telegram id map.

   Kept apart from db.js on purpose. db.js owns leads and the durable
   record; this owns the fast-moving conversation state that the widget
   polls. Same rule applies to both -- nothing throws, everything returns
   {ok, ...}, because a live chat glitch must never take a request down.
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
  const res = await withTimeout(fetch(`${CFG.supabase.url}/rest/v1/${path}`, init), TIMEOUT, "supabase");
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!res.ok) {
    const err = new Error(`supabase ${res.status}`);
    err.status = res.status; err.body = body;
    throw err;
  }
  return body;
}

/* ##### SECTION: LIVE / MESSAGES ##### */
export async function addMessage(conversationId, role, body, operatorName = null) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    const rows = await rest("messages", {
      method: "POST",
      headers: headers({ Prefer: "return=representation" }),
      body: JSON.stringify([{
        conversation_id: conversationId,
        role,
        body: String(body).slice(0, 4000),
        operator_name: operatorName
      }])
    });
    const row = Array.isArray(rows) ? rows[0] : rows;

    /* Touch the conversation so the console can sort by activity and the
       stale-chat sweep knows when someone last spoke. */
    const patch = role === "operator"
      ? { last_operator_at: new Date().toISOString(), live_status: "live", operator_name: operatorName }
      : { last_customer_at: new Date().toISOString() };
    patchConversation(conversationId, patch).catch(() => {});

    return { ok: true, id: row?.id, row };
  } catch (err) {
    log("live.add_message_failed", { msg: err.message });
    return { ok: false, reason: "db_error" };
  }
}

/* The widget's poll. `after` is the last id it has already shown. */
export async function messagesSince(conversationId, after = 0, limit = 50) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    const q = new URLSearchParams({
      select: "id,role,body,operator_name,created_at",
      conversation_id: `eq.${conversationId}`,
      id: `gt.${Number(after) || 0}`,
      order: "id.asc",
      limit: String(Math.min(limit, 100))
    });
    const rows = await rest(`messages?${q}`, { method: "GET", headers: headers() });
    return { ok: true, rows: rows || [] };
  } catch (err) {
    return { ok: false, reason: "db_error" };
  }
}

/* ##### SECTION: LIVE / CONVERSATION STATE ##### */
export async function patchConversation(id, fields) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    await rest(`conversations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() })
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "db_error" };
  }
}

export async function getConversation(id) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    const q = new URLSearchParams({
      select: "id,live_status,operator_name,awaiting_since,last_operator_at,summary,page,transcript,city",
      id: `eq.${id}`,
      limit: "1"
    });
    const rows = await rest(`conversations?${q}`, { method: "GET", headers: headers() });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? { ok: true, row } : { ok: false, reason: "not_found" };
  } catch (err) {
    return { ok: false, reason: "db_error" };
  }
}

/* Everything an operator needs to triage, newest activity first. */
export async function listLive() {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    const q = new URLSearchParams({
      select: "id,live_status,operator_name,awaiting_since,last_customer_at,last_operator_at,summary,page,city,created_at",
      live_status: "in.(waiting,live)",
      order: "awaiting_since.desc",
      limit: "50"
    });
    const rows = await rest(`conversations?${q}`, { method: "GET", headers: headers() });
    return { ok: true, rows: rows || [] };
  } catch (err) {
    return { ok: false, reason: "db_error" };
  }
}

/* ##### SECTION: LIVE / TELEGRAM ID MAP ##### */
/* Every message we push to Telegram is recorded here, so the operator can
   hit reply on any of them -- not just the first -- and land in the right
   conversation. */
export async function linkTelegram(messageId, conversationId) {
  if (!HAS.db || !messageId) return { ok: false };
  try {
    await rest("telegram_links", {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ message_id: messageId, conversation_id: conversationId }])
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function conversationForTelegram(messageId) {
  if (!HAS.db || !messageId) return null;
  try {
    const q = new URLSearchParams({
      select: "conversation_id",
      message_id: `eq.${messageId}`,
      limit: "1"
    });
    const rows = await rest(`telegram_links?${q}`, { method: "GET", headers: headers() });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.conversation_id || null;
  } catch {
    return null;
  }
}

/* ##### SECTION: LIVE / PRESENCE ##### */
/* A live chat nobody answers is worse than no live chat, so availability
   is explicit rather than assumed. */
export async function setPresence(id, available, name) {
  if (!HAS.db) return { ok: false, reason: "not_configured" };
  try {
    await rest("operators?on_conflict=id", {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{
        id: String(id), name: name || null, available: Boolean(available),
        updated_at: new Date().toISOString()
      }])
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "db_error" };
  }
}

/* Presence goes stale: someone who marked themselves available eight
   hours ago and walked away is not available. */
const PRESENCE_TTL_MIN = 90;

export async function anyoneAvailable() {
  if (!HAS.db) return { ok: false, available: false, reason: "not_configured" };
  try {
    const cutoff = new Date(Date.now() - PRESENCE_TTL_MIN * 60_000).toISOString();
    const q = new URLSearchParams({
      select: "id,name,updated_at",
      available: "is.true",
      updated_at: `gte.${cutoff}`,
      limit: "5"
    });
    const rows = await rest(`operators?${q}`, { method: "GET", headers: headers() });
    return { ok: true, available: (rows || []).length > 0, operators: rows || [] };
  } catch {
    /* Unknown presence is treated as unavailable. Better to offer a
       callback than to promise a person who is not there. */
    return { ok: false, available: false, reason: "db_error" };
  }
}
