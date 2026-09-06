/* =====================================================================
   GET /api/health  --  is the lead pipeline actually working right now?

   Worth hitting after any deploy or env-var change. It reports which
   pieces are configured and which are reachable, so a silently missing
   key shows up here rather than as leads quietly going nowhere.

   Deliberately reveals no secrets and no customer data.
   ===================================================================== */

import { cors, methodGuard, json, HAS, CFG } from "./_lib/core.js";
import { pingDb } from "./_lib/db.js";
import { pingNotify } from "./_lib/notify.js";
import { pingTelegram } from "./_lib/telegram.js";
import { anyoneAvailable } from "./_lib/live.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (methodGuard(req, res, "GET")) return;

  const [db, notify, tg, presence] = await Promise.all([
    pingDb().catch((e) => ({ ok: false, error: e.message })),
    pingNotify().catch((e) => ({ error: e.message })),
    pingTelegram().catch((e) => ({ configured: HAS.telegram, error: e.message })),
    anyoneAvailable().catch(() => ({ available: false }))
  ]);

  const checks = {
    database:  { configured: HAS.db,     reachable: db.ok === true, reason: db.reason || null },
    sms:       notify.sms   || { configured: HAS.sms },
    email:     notify.email || { configured: HAS.email },
    assistant: { configured: HAS.claude },
    admin:     { configured: HAS.admin },
    liveChat:  {
      configured: HAS.telegram && HAS.db,
      telegram: tg,
      operatorAvailable: presence.available === true,
      operators: (presence.operators || []).map((o) => o.name).filter(Boolean)
    },
    cors:      { allowlist: CFG.origins.length ? CFG.origins : "same-origin only" }
  };

  /* A lead is captured if it can be stored OR someone can be told.
     Everything else is degraded, not broken. */
  const canCaptureLeads =
    (HAS.db && db.ok === true) ||
    (checks.sms.configured && checks.sms.reachable !== false) ||
    (checks.email.configured && checks.email.reachable !== false);

  const warnings = [];
  if (!HAS.db)     warnings.push("No database: leads are not being stored, only forwarded.");
  if (!HAS.sms)    warnings.push("No SMS: escalations will not reach a phone.");
  if (!HAS.email)  warnings.push("No email: no durable record of leads.");
  if (!HAS.claude) warnings.push("No Anthropic key: the assistant runs in offline mode.");
  if (!HAS.admin)  warnings.push("No ADMIN_TOKEN: the admin lead view is disabled.");
  if (!canCaptureLeads) warnings.push("CRITICAL: nothing can capture a lead. The site will fall back to SMS.");

  return json(res, canCaptureLeads ? 200 : 503, {
    ok: canCaptureLeads,
    status: canCaptureLeads ? (warnings.length ? "degraded" : "healthy") : "down",
    checks,
    warnings,
    at: new Date().toISOString()
  });
}
