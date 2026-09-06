/* =====================================================================
   POST /api/escalate  --  hand a chat conversation to a person.

   Called by the widget when someone asks for a human, and by /api/chat
   when the model calls its connect_to_human tool.

   What "transfer" means here: the owner's phone gets an SMS with the
   customer's number and what they said, the transcript is filed, and the
   customer is told plainly what happens next. There is no chat queue to
   route into and pretending otherwise would just leave people waiting in
   a window nobody is watching.

   If the visitor has not given a number yet, the response says so and
   the widget asks for one, then posts it to /api/lead.
   ===================================================================== */

import {
  cors, methodGuard, json, readBody, clientIp, hashIp, rateLimit,
  normalisePhone, log, redactPhone, HAS, CFG
} from "./_lib/core.js";
import { saveConversation, recordEvent } from "./_lib/db.js";
import { notifyEscalation } from "./_lib/notify.js";
import { anyoneAvailable, patchConversation } from "./_lib/live.js";
import { sendToOps, handoffCard } from "./_lib/telegram.js";
import { signConversation } from "./_lib/session.js";

const REASONS = ["asked_for_human", "emergency", "pricing", "scheduling", "out_of_scope", "frustrated", "unknown"];

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (methodGuard(req, res, "POST")) return;

  const ip = clientIp(req);
  const ipHash = await hashIp(ip);

  const rl = rateLimit(`esc:${ip}`, { limit: 6, windowMs: 10 * 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, {
      ok: false, error: "rate_limited", fallback: true,
      message: `Call ${CFG.biz.phone} and someone will pick up.`
    });
  }

  const body = await readBody(req);

  /* ##### SECTION: ESCALATE / SHAPE ##### */
  const transcript = Array.isArray(body.transcript)
    ? body.transcript
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-30)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  const phone = normalisePhone(body.phone);
  const data = {
    name: typeof body.name === "string" ? body.name.trim().slice(0, 80) : "",
    phone,
    phone_display: typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "",
    reason: REASONS.includes(body.reason) ? body.reason : "unknown",
    summary: typeof body.summary === "string" ? body.summary.slice(0, 600) : "",
    page: typeof body.page === "string" ? body.page.slice(0, 200) : "",
    city: typeof body.city === "string" ? body.city.trim().slice(0, 60) : "",
    transcript
  };

  /* A conversation id lets repeat escalations update one row rather than
     spawning a new one each time someone taps the button again. */
  const conversationId =
    (typeof body.conversationId === "string" && body.conversationId.slice(0, 64)) ||
    crypto.randomUUID();

  /* ##### SECTION: ESCALATE / LIVE OR CALLBACK ##### */
  /* Live chat is only offered when someone has actually said they are
     watching. An unanswered chat window is worse than never offering
     one, so presence is checked rather than assumed. */
  const presence = await anyoneAvailable().catch(() => ({ available: false }));
  const goLive = Boolean(presence.available && HAS.telegram);

  /* ##### SECTION: ESCALATE / FILE + ALERT ##### */
  const [saved, told] = await Promise.all([
    saveConversation({
      id: conversationId,
      transcript,
      page: data.page,
      escalated: true,
      reason: data.reason,
      summary: data.summary
    }).catch((e) => ({ ok: false, error: e.message })),
    notifyEscalation(data).catch((e) => ({ ok: false, error: e.message }))
  ]);

  /* Open the live thread in the operator channel and mark the
     conversation as waiting, which starts the widget's countdown. */
  let liveOpened = false;
  if (goLive) {
    const card = await sendToOps(conversationId, handoffCard({
      conversationId,
      summary: data.summary,
      transcript,
      page: data.page,
      city: data.city,
      phone: data.phone_display || data.phone,
      reason: data.reason
    })).catch(() => ({ ok: false }));

    if (card.ok) {
      liveOpened = true;
      await patchConversation(conversationId, {
        live_status: "waiting",
        awaiting_since: new Date().toISOString(),
        city: data.city || null
      }).catch(() => {});
    }
  }

  log("escalation", {
    ipHash,
    conversationId,
    reason: data.reason,
    hasPhone: Boolean(phone),
    phone: phone ? redactPhone(phone) : null,
    turns: transcript.length,
    saved: saved.ok,
    notified: told.ok
  });

  recordEvent("escalation", {
    conversationId, reason: data.reason,
    hasPhone: Boolean(phone),
    saved: saved.ok, notified: told.ok
  }).catch(() => {});

  const alerted = Boolean(told.ok) || liveOpened;

  log("escalation.mode", { conversationId, liveOpened, available: presence.available, alerted });

  /* Live chat gets a signed token so the widget can read and write this
     conversation. The id alone is deliberately not enough. */
  return json(res, 200, {
    ok: true,
    conversationId,
    live: liveOpened,
    token: liveOpened ? signConversation(conversationId) : null,

    /* Whether a person has actually been pinged, so the widget can be
       honest instead of promising a callback nobody was told about. */
    alerted,
    /* Ask for a number when we do not have one -- an escalation without
       a callback number is the most common way these go nowhere. */
    needsPhone: !phone && !liveOpened,

    message: liveOpened
      ? "Connecting you to someone now — hang on a moment."
      : alerted
        ? (phone
            ? "Done — someone has been sent your number and what we talked about. Expect a call shortly."
            : "Someone has been alerted. Leave a number and they will call you back, or call now and skip the wait.")
        : `Call ${CFG.biz.phone} and someone will pick up.`,

    phone: CFG.biz.phone,
    tel: CFG.biz.tel,
    configured: { db: HAS.db, sms: HAS.sms, email: HAS.email, telegram: HAS.telegram }
  });
}
