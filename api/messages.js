/* =====================================================================
   /api/messages  --  the customer half of a live conversation.

   GET  ?c=<id>&t=<token>&after=<lastId>
        The widget's poll. Returns new turns plus the conversation state,
        so the widget can tell "waiting for someone" from "someone is
        here" from "nobody came, offer a callback".

   POST { conversationId, token, body }
        A customer message during a live session. Stored, then pushed to
        whichever operator channel is configured.

   Both require the HMAC issued when the session started -- the id alone
   is not enough to read someone's transcript.
   ===================================================================== */

import {
  cors, methodGuard, json, readBody, clientIp, rateLimit, log, HAS, CFG
} from "./_lib/core.js";
import { verifyConversation } from "./_lib/session.js";
import { addMessage, messagesSince, getConversation, patchConversation } from "./_lib/live.js";
import { sendToOps, customerLine } from "./_lib/telegram.js";

/* How long a visitor waits before we stop pretending someone is coming.
   Long enough for a real person to finish what they were doing, short
   enough that nobody sits staring at a spinner. */
const WAIT_LIMIT_MS = 60_000;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method === "GET")  return poll(req, res);
  if (req.method === "POST") return post(req, res);
  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { ok: false, error: "method_not_allowed" });
}

/* ##### SECTION: MESSAGES / POLL ##### */
async function poll(req, res) {
  const url = new URL(req.url, "http://localhost");
  const id = url.searchParams.get("c") || "";
  const token = url.searchParams.get("t") || "";
  const after = Number(url.searchParams.get("after") || 0);

  if (!verifyConversation(id, token)) {
    return json(res, 403, { ok: false, error: "bad_token" });
  }

  /* Polling is frequent by design, so the ceiling is generous -- it is
     here to stop a runaway loop, not to shape normal use. */
  const rl = rateLimit(`poll:${clientIp(req)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  const [msgs, convo] = await Promise.all([
    messagesSince(id, after),
    getConversation(id)
  ]);

  const row = convo.ok ? convo.row : null;
  let status = row?.live_status || "bot";

  /* Nobody picked up in time. Flip to a callback rather than leaving
     them watching an empty room. */
  let timedOut = false;
  if (status === "waiting" && row?.awaiting_since) {
    const waited = Date.now() - new Date(row.awaiting_since).getTime();
    if (waited > WAIT_LIMIT_MS) {
      timedOut = true;
      patchConversation(id, { live_status: "closed" }).catch(() => {});
      status = "closed";
    }
  }

  return json(res, 200, {
    ok: true,
    status,
    timedOut,
    operator: row?.operator_name || null,
    messages: (msgs.rows || []).map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      operator: m.operator_name,
      at: m.created_at
    }))
  });
}

/* ##### SECTION: MESSAGES / CUSTOMER SENDS ##### */
async function post(req, res) {
  const body = await readBody(req);
  const id = String(body.conversationId || "");
  const token = String(body.token || "");
  const text = String(body.body || "").trim();

  if (!verifyConversation(id, token)) {
    return json(res, 403, { ok: false, error: "bad_token" });
  }
  if (!text) {
    return json(res, 400, { ok: false, error: "empty" });
  }

  const rl = rateLimit(`msg:${clientIp(req)}`, { limit: 40, windowMs: 5 * 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  const stored = await addMessage(id, "customer", text);
  if (!stored.ok) {
    return json(res, 503, {
      ok: false, error: "store_failed", fallback: true,
      message: `Call ${CFG.biz.phone} and someone will pick up.`
    });
  }

  /* Push to the operator. If this fails the message is still stored, so
     the console will show it -- the operator just does not get a nudge. */
  if (HAS.telegram) {
    sendToOps(id, customerLine(text)).catch(() => {});
  }

  log("live.customer_message", { conversationId: id, len: text.length });
  return json(res, 200, { ok: true, id: stored.id });
}
