/* =====================================================================
   Getting a person's attention.

   This is what "transfer to management" actually means for a business
   this size. There is no chat queue to route into -- there is an owner
   with a phone. So an escalation sends that phone everything needed to
   call the customer back: their number, what they said, and where they
   are. The handoff completes on the phone, not in a browser tab.

   Both channels are optional and independent. Configure one, both, or
   neither; callers check the returned flags rather than assuming.
   ===================================================================== */

import { CFG, HAS, withTimeout, log, redactPhone } from "./core.js";
import { sendLeadAlert, sendAwayEscalation } from "./telegram.js";

const TIMEOUT = 8000;

/* ##### SECTION: NOTIFY / SMS (Twilio) ##### */
async function sendSms(to, body) {
  if (!HAS.sms) return { ok: false, reason: "not_configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${CFG.twilio.sid}/Messages.json`;
  const auth = Buffer.from(`${CFG.twilio.sid}:${CFG.twilio.token}`).toString("base64");

  try {
    const res = await withTimeout(fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      /* Twilio hard-caps a segment; keep it well inside so nothing is
         silently truncated mid-phone-number. */
      body: new URLSearchParams({ To: to, From: CFG.twilio.from, Body: body.slice(0, 1500) })
    }), TIMEOUT, "twilio");

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log("sms.failed", { status: res.status, detail: detail.slice(0, 200) });
      return { ok: false, reason: "provider_error", status: res.status };
    }
    log("sms.sent", { to: redactPhone(to) });
    return { ok: true };
  } catch (err) {
    log("sms.error", { msg: err.message });
    return { ok: false, reason: "network", error: err.message };
  }
}

/* ##### SECTION: NOTIFY / EMAIL (Resend) ##### */
async function sendEmail(subject, html, replyTo) {
  if (!HAS.email) return { ok: false, reason: "not_configured" };

  try {
    const res = await withTimeout(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CFG.resend.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: CFG.resend.from,
        to: CFG.resend.to.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    }), TIMEOUT, "resend");

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log("email.failed", { status: res.status, detail: detail.slice(0, 200) });
      return { ok: false, reason: "provider_error", status: res.status };
    }
    log("email.sent", {});
    return { ok: true };
  } catch (err) {
    log("email.error", { msg: err.message });
    return { ok: false, reason: "network", error: err.message };
  }
}

/* ##### SECTION: NOTIFY / MESSAGE BODIES ##### */
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function leadSms(d, urgent) {
  const lines = [
    urgent ? "URGENT LEAD" : "New lead",
    `${d.name} - ${d.phone_display || d.phone}`,
    d.service,
    [d.city, d.urgency].filter(Boolean).join(" / ")
  ];
  if (d.notes) lines.push(`"${d.notes.slice(0, 260)}"`);
  return lines.filter(Boolean).join("\n");
}

function leadEmail(d, meta) {
  const row = (k, v) =>
    v ? `<tr><td style="padding:6px 14px 6px 0;color:#667;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0"><b>${esc(v)}</b></td></tr>` : "";
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px">New lead from the website</h2>
      <p style="margin:0 0 18px;color:#667">${esc(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))} Pacific</p>
      <table style="border-collapse:collapse;font-size:15px">
        ${row("Name", d.name)}
        ${row("Phone", d.phone_display || d.phone)}
        ${row("Service", d.service)}
        ${row("City", d.city)}
        ${row("Address", d.address)}
        ${row("How soon", d.urgency)}
        ${row("Source", d.source)}
        ${row("Page", d.page)}
      </table>
      ${d.notes ? `<p style="margin:18px 0 0"><b>What they said</b><br>${esc(d.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <p style="margin:22px 0 0">
        <a href="tel:${esc(d.phone)}" style="background:#16264d;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none">Call ${esc(d.phone_display || d.phone)}</a>
      </p>
      ${meta?.leadId ? `<p style="margin:18px 0 0;color:#889;font-size:12px">Lead ID ${esc(meta.leadId)}</p>` : ""}
    </div>`;
}

function escalationSms(d) {
  const lines = [
    "CUSTOMER WANTS A PERSON",
    d.phone ? `${d.name || "Website visitor"} - ${d.phone_display || d.phone}` : (d.name || "Website visitor") + " - no number given",
    d.reason ? `Reason: ${d.reason}` : "",
    d.summary ? `"${d.summary.slice(0, 300)}"` : ""
  ];
  return lines.filter(Boolean).join("\n");
}

function escalationEmail(d) {
  const turns = (d.transcript || [])
    .map((m) => `<p style="margin:0 0 8px"><b style="color:${m.role === "user" ? "#16264d" : "#667"}">${m.role === "user" ? "Customer" : "Assistant"}:</b> ${esc(m.content)}</p>`)
    .join("");
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px">A visitor asked for a person</h2>
      <p style="margin:0 0 18px;color:#667">${esc(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))} Pacific${d.reason ? ` &middot; ${esc(d.reason)}` : ""}</p>
      ${d.phone ? `<p style="margin:0 0 18px"><a href="tel:${esc(d.phone)}" style="background:#16264d;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none">Call ${esc(d.phone_display || d.phone)}</a></p>`
                : `<p style="margin:0 0 18px;color:#a33">No phone number captured &mdash; they left before giving one.</p>`}
      ${d.summary ? `<p style="margin:0 0 18px"><b>Summary</b><br>${esc(d.summary)}</p>` : ""}
      <h3 style="margin:22px 0 10px;font-size:15px">Conversation</h3>
      <div style="font-size:14px;line-height:1.6">${turns}</div>
      ${d.page ? `<p style="margin:20px 0 0;color:#889;font-size:12px">From ${esc(d.page)}</p>` : ""}
    </div>`;
}

/* ##### SECTION: NOTIFY / PUBLIC ##### */
/* All three channels fire together and none can block the others. The
   caller only needs to know whether *anything* got through.

   Telegram is in here rather than only in the live-chat path, because
   otherwise a booking that arrives while nobody is watching reaches
   nobody at all until someone opens the admin page. It is free, so
   there is no reason not to use it as the always-on channel. */
async function fanOut(sms, email, telegram) {
  const [smsRes, emailRes, tgRes] = await Promise.allSettled([
    sms ? sendSms(CFG.ops.sms, sms.body) : Promise.resolve({ ok: false, reason: "skipped" }),
    email ? sendEmail(email.subject, email.html, email.replyTo) : Promise.resolve({ ok: false, reason: "skipped" }),
    telegram ? telegram() : Promise.resolve({ ok: false, reason: "skipped" })
  ]);

  const s = smsRes.status === "fulfilled" ? smsRes.value : { ok: false, reason: "threw" };
  const e = emailRes.status === "fulfilled" ? emailRes.value : { ok: false, reason: "threw" };
  const t = tgRes.status === "fulfilled" ? tgRes.value : { ok: false, reason: "threw" };

  return { ok: s.ok || e.ok || t.ok, sms: s, email: e, telegram: t };
}

export function notifyLead(data, meta = {}) {
  const urgent = /emergency/i.test(data.urgency || "") || data.source === "chat_escalation";
  return fanOut(
    { body: leadSms(data, urgent) },
    {
      subject: `${urgent ? "URGENT " : ""}New lead: ${data.name} - ${data.service}`,
      html: leadEmail(data, meta),
      replyTo: null
    },
    () => sendLeadAlert(data, meta.conversationId || null)
  );
}

/* `live` means a chat thread was already opened in the operator channel,
   so a second Telegram message would just be noise. */
export function notifyEscalation(data, { live = false } = {}) {
  return fanOut(
    { body: escalationSms(data) },
    {
      subject: `Website visitor wants a person${data.name ? `: ${data.name}` : ""}`,
      html: escalationEmail(data)
    },
    live ? null : () => sendAwayEscalation(data, data.conversationId || null)
  );
}

/* ##### SECTION: NOTIFY / HEALTH ##### */
export async function pingNotify() {
  const out = { sms: { configured: HAS.sms }, email: { configured: HAS.email } };

  if (HAS.sms) {
    try {
      const auth = Buffer.from(`${CFG.twilio.sid}:${CFG.twilio.token}`).toString("base64");
      const res = await withTimeout(
        fetch(`https://api.twilio.com/2010-04-01/Accounts/${CFG.twilio.sid}.json`,
          { headers: { Authorization: `Basic ${auth}` } }),
        5000, "twilio-ping");
      out.sms.reachable = res.ok;
      if (!res.ok) out.sms.status = res.status;
    } catch (err) { out.sms.reachable = false; out.sms.error = err.message; }
  }

  if (HAS.email) {
    try {
      const res = await withTimeout(
        fetch("https://api.resend.com/domains",
          { headers: { Authorization: `Bearer ${CFG.resend.key}` } }),
        5000, "resend-ping");
      out.email.reachable = res.ok;
      if (!res.ok) out.email.status = res.status;
    } catch (err) { out.email.reachable = false; out.email.error = err.message; }
  }

  return out;
}
