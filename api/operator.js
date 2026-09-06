/* =====================================================================
   /api/operator  --  the web console half of the live handoff.

   Same message store as the Telegram bot, so the two are just different
   windows onto the same conversation. Whichever is open, the customer
   sees one thread.

   GET  ?action=list                 waiting + live conversations
   GET  ?action=thread&c=<id>        one conversation's messages
   POST { action:'reply', conversationId, body }
   POST { action:'presence', available, name }
   POST { action:'close', conversationId }

   Guarded by the same ADMIN_TOKEN as the lead list.
   ===================================================================== */

import { cors, json, readBody, clientIp, rateLimit, log, HAS, CFG } from "./_lib/core.js";
import {
  listLive, messagesSince, addMessage, patchConversation,
  setPresence, anyoneAvailable, getConversation
} from "./_lib/live.js";
import { sendToOps } from "./_lib/telegram.js";

function authorised(req) {
  if (!HAS.admin) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || req.headers["x-admin-token"] || "";
  const a = Buffer.from(String(token));
  const b = Buffer.from(CFG.adminToken);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const rl = rateLimit(`op:${clientIp(req)}`, { limit: 200, windowMs: 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  if (!HAS.admin) return json(res, 503, { ok: false, error: "admin_disabled" });
  if (!authorised(req)) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return json(res, 401, { ok: false, error: "unauthorised" });
  }
  if (!HAS.db) return json(res, 503, { ok: false, error: "no_database" });

  /* ##### SECTION: OPERATOR / READ ##### */
  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const action = url.searchParams.get("action") || "list";

    if (action === "list") {
      const [live, presence] = await Promise.all([listLive(), anyoneAvailable()]);
      if (!live.ok) return json(res, 502, { ok: false, error: live.reason });
      return json(res, 200, {
        ok: true,
        conversations: live.rows,
        available: presence.available,
        operators: presence.operators || []
      });
    }

    if (action === "thread") {
      const id = url.searchParams.get("c") || "";
      const after = Number(url.searchParams.get("after") || 0);
      const [msgs, convo] = await Promise.all([messagesSince(id, after, 100), getConversation(id)]);
      if (!msgs.ok) return json(res, 502, { ok: false, error: msgs.reason });
      return json(res, 200, {
        ok: true,
        messages: msgs.rows,
        conversation: convo.ok ? convo.row : null
      });
    }

    return json(res, 400, { ok: false, error: "unknown_action" });
  }

  /* ##### SECTION: OPERATOR / WRITE ##### */
  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action;

    if (action === "reply") {
      const id = String(body.conversationId || "");
      const text = String(body.body || "").trim();
      if (!id || !text) return json(res, 400, { ok: false, error: "invalid" });

      const name = String(body.name || "Nassim's Plumbing").slice(0, 60);
      const stored = await addMessage(id, "operator", text, name);
      if (!stored.ok) return json(res, 502, { ok: false, error: "store_failed" });

      /* Mirror into Telegram so an operator on their phone sees what was
         said from the console, and vice versa. */
      if (HAS.telegram) sendToOps(id, `💬 <b>${name}</b> (console): ${text.slice(0, 800)}`).catch(() => {});

      log("live.operator_reply", { conversationId: id, by: name, via: "console" });
      return json(res, 200, { ok: true, id: stored.id });
    }

    if (action === "presence") {
      const available = Boolean(body.available);
      await setPresence("console", available, String(body.name || "Console").slice(0, 60));
      return json(res, 200, { ok: true, available });
    }

    if (action === "close") {
      const id = String(body.conversationId || "");
      if (!id) return json(res, 400, { ok: false, error: "invalid" });
      await patchConversation(id, { live_status: "closed" });
      await addMessage(id, "system", `This chat has been closed. Call ${CFG.biz.phone} if you need anything else.`);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: "unknown_action" });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { ok: false, error: "method_not_allowed" });
}
