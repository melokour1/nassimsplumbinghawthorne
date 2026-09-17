/* =====================================================================
   POST /api/lead  --  capture a service request.

   The contract with the browser matters more than the code here:

     200 {ok:true}                 stored and/or someone was told. Done.
     400 {ok:false, errors:{...}}  the customer's input needs fixing.
                                   Show field errors; do NOT SMS-fallback.
     429 {ok:false, fallback:true} too many attempts.
     503 {ok:false, fallback:true} we could neither store it nor tell
                                   anyone. Browser falls back to a
                                   prefilled SMS, which cannot fail.

   A lead only counts as lost if Supabase, Twilio and Resend are all down
   at once AND the customer then declines to press send in their own
   messaging app. That is the bar.
   ===================================================================== */

import {
  cors, methodGuard, json, readBody, clientIp, hashIp, rateLimit,
  validateLead, looksLikeSpam, log, redactPhone, HAS
} from "./_lib/core.js";
import { insertLead, recordEvent } from "./_lib/db.js";
import { notifyLead } from "./_lib/notify.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (methodGuard(req, res, "POST")) return;

  const ip = clientIp(req);
  const ipHash = await hashIp(ip);

  /* ##### SECTION: LEAD / FLOOD GUARD #####
     A coarse ceiling on raw requests, so a flood cannot burn CPU. Set
     high enough that no real person meets it. */
  const flood = rateLimit(`lead-req:${ip}`, { limit: 40, windowMs: 10 * 60_000 });
  if (!flood.ok) {
    log("lead.flooded", { ipHash });
    res.setHeader("Retry-After", String(flood.retryAfter));
    return json(res, 429, {
      ok: false, error: "rate_limited", fallback: true,
      message: "That is a lot of requests in a short time. Call us instead and we will sort it out."
    });
  }

  const body = await readBody(req);

  /* ##### SECTION: LEAD / SPAM ##### */
  /* Answer bots with a 200 so they stop retrying, but store nothing. */
  const spam = looksLikeSpam(body);
  if (spam) {
    log("lead.spam", { ipHash, signal: spam });
    return json(res, 200, { ok: true, id: null });
  }

  /* ##### SECTION: LEAD / VALIDATE ##### */
  const { ok, errors, data } = validateLead(body);
  if (!ok) {
    /* Deliberately before the submission limit: a customer mistyping
       their phone twice must not use up their own budget and get shut
       out of the form. */
    return json(res, 400, { ok: false, error: "invalid", errors });
  }

  /* ##### SECTION: LEAD / SUBMISSION LIMIT #####
     Only genuine, well-formed leads count here. Tight enough to stop a
     stream of plausible-looking spam, loose enough for a household that
     books twice or a shared office address. */
  const rl = rateLimit(`lead:${ip}`, { limit: 6, windowMs: 10 * 60_000 });
  if (!rl.ok) {
    log("lead.rate_limited", { ipHash });
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, {
      ok: false, error: "rate_limited", fallback: true,
      message: "That is a lot of requests in a short time. Call us instead and we will sort it out."
    });
  }

  const meta = {
    ipHash,
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 200) : null,
    idempotencyKey: req.headers["x-idempotency-key"] || body.idempotencyKey || null,
    conversationId: typeof body.conversationId === "string" ? body.conversationId.slice(0, 64) : null
  };

  /* ##### SECTION: LEAD / PERSIST + NOTIFY ##### */
  /* Both are attempted regardless of how the other goes. Storing without
     telling anyone is a lead nobody calls; telling someone without
     storing is a lead nobody can look up later. We want both, but one
     is enough to call it captured. */
  const [stored, told] = await Promise.all([
    insertLead(data, meta).catch((e) => ({ ok: false, reason: "threw", error: e.message })),
    notifyLead(data, {}).catch((e) => ({ ok: false, reason: "threw", error: e.message }))
  ]);

  log("lead.received", {
    ipHash,
    service: data.service,
    urgency: data.urgency,
    source: data.source,
    phone: redactPhone(data.phone),
    stored: stored.ok,
    notified: told.ok,
    sms: told.sms?.ok,
    email: told.email?.ok
  });

  recordEvent("lead_submitted", {
    stored: stored.ok, notified: told.ok,
    storeReason: stored.reason || null,
    smsReason: told.sms?.reason || null,
    emailReason: told.email?.reason || null,
    leadId: stored.id || null
  }).catch(() => {});

  /* Nothing configured at all is a deployment problem, not a customer
     problem -- send them down the SMS path rather than pretending. */
  if (!HAS.db && !HAS.sms && !HAS.email) {
    log("lead.no_backend_configured", {});
    return json(res, 503, {
      ok: false, error: "not_configured", fallback: true,
      message: "Send it through your messaging app instead."
    });
  }

  if (!stored.ok && !told.ok) {
    return json(res, 503, {
      ok: false, error: "capture_failed", fallback: true,
      message: "We could not log that just now. Send it through your messaging app and we will pick it up."
    });
  }

  return json(res, 200, {
    ok: true,
    id: stored.id || null,
    stored: stored.ok,
    notified: told.ok
  });
}
