/* =====================================================================
   GET /api/test-alert?token=<ADMIN_TOKEN>

   Fires a clearly-marked test notification through every configured
   channel and reports which ones landed. Nothing is written to the
   database.

   Worth running after adding a channel, and again occasionally: the
   failure mode that costs real money is alerting that quietly stopped
   working, which looks identical to a quiet week.

     ?token=...            test the lead alert
     ?token=...&kind=escalation   test the "wants a person" alert
   ===================================================================== */

import { cors, methodGuard, json, clientIp, rateLimit, log, HAS, CFG } from "./_lib/core.js";
import { notifyLead, notifyEscalation } from "./_lib/notify.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (methodGuard(req, res, "GET")) return;

  const rl = rateLimit(`testalert:${clientIp(req)}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  const url = new URL(req.url, "http://localhost");
  if (!HAS.admin) return json(res, 503, { ok: false, error: "ADMIN_TOKEN is not set" });
  if ((url.searchParams.get("token") || "") !== CFG.adminToken) {
    res.setHeader("WWW-Authenticate", "Bearer");
    return json(res, 401, { ok: false, error: "unauthorised" });
  }

  const configured = { telegram: HAS.telegram, email: HAS.email, sms: HAS.sms };
  if (!configured.telegram && !configured.email && !configured.sms) {
    return json(res, 200, {
      ok: false,
      problem: "No alert channel is configured, so a new lead would reach nobody.",
      configured
    });
  }

  const stamp = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const kind = url.searchParams.get("kind") === "escalation" ? "escalation" : "lead";

  let result;
  if (kind === "escalation") {
    result = await notifyEscalation({
      name: "TEST — not a real customer",
      phone: CFG.biz.tel,
      phone_display: CFG.biz.phone,
      reason: "asked_for_human",
      summary: `Test alert sent ${stamp} Pacific. Nobody is waiting. Safe to ignore.`,
      page: "/api/test-alert",
      city: "Test",
      transcript: [
        { role: "user", content: "This is a test of the escalation alert." },
        { role: "assistant", content: "No action needed." }
      ]
    }, { live: false });
  } else {
    result = await notifyLead({
      name: "TEST — not a real customer",
      phone: CFG.biz.tel,
      phone_display: CFG.biz.phone,
      service: "Test alert",
      city: "Test",
      address: "",
      urgency: "",
      notes: `Test alert sent ${stamp} Pacific. If you can read this, alerting works. Safe to ignore.`,
      source: "form",
      page: "/api/test-alert"
    }, {});
  }

  log("test_alert", { kind, ok: result.ok, telegram: result.telegram?.ok, email: result.email?.ok, sms: result.sms?.ok });

  /* Per-channel detail, so a half-working setup is obvious rather than
     hiding behind an overall "ok". */
  const channels = {
    telegram: channel(configured.telegram, result.telegram),
    email:    channel(configured.email, result.email),
    sms:      channel(configured.sms, result.sms)
  };

  const failed = Object.entries(channels)
    .filter(([, v]) => v.configured && !v.delivered)
    .map(([k]) => k);

  return json(res, 200, {
    ok: result.ok,
    kind,
    sent: result.ok,
    channels,
    failed,
    note: result.ok
      ? (failed.length
          ? `Delivered, but ${failed.join(" and ")} failed. Check the reason above.`
          : "Delivered on every configured channel.")
      : "Nothing was delivered. A real lead right now would reach nobody.",
    at: new Date().toISOString()
  });
}

function channel(isConfigured, r) {
  if (!isConfigured) return { configured: false, delivered: false, reason: "not_configured" };
  return {
    configured: true,
    delivered: Boolean(r?.ok),
    reason: r?.ok ? null : (r?.reason || "unknown"),
    status: r?.status,
    detail: r?.description || null
  };
}
