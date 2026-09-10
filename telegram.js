/* =====================================================================
   Telegram operator channel.

   Chosen over SMS for the live handoff because it is free, threads
   properly, and runs on the owner's desktop as well as their phone --
   which is the whole point when the customer is on a PC with no mobile
   to hand.

   Threading works by recording the message_id of everything we push, so
   the operator can hit reply on any of them and the webhook knows which
   conversation it belongs to.
   ===================================================================== */

import { CFG, HAS, withTimeout, log } from "./core.js";
import { linkTelegram } from "./live.js";

const API = (method) => `https://api.telegram.org/bot${CFG.telegram.token}/${method}`;

/* ##### SECTION: TELEGRAM / SEND ##### */
async function call(method, payload) {
  /* Only the token is needed to send. Requiring the chat id here too
     made setup circular: the bot could not tell you your chat id until
     the chat id was already configured. */
  if (!CFG.telegram.token) return { ok: false, reason: "not_configured" };
  try {
    const res = await withTimeout(fetch(API(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), 8000, "telegram");

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      log("telegram.failed", { method, status: res.status, desc: String(body.description || "").slice(0, 160) });
      return { ok: false, reason: "provider_error", description: body.description };
    }
    return { ok: true, result: body.result };
  } catch (err) {
    log("telegram.error", { method, msg: err.message });
    return { ok: false, reason: "network" };
  }
}

/* Telegram's HTML parse mode is fussy; only these three need escaping. */
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Sends to the ops chat and records the id so a reply can be routed
   back to this conversation. */
export async function sendToOps(conversationId, html, extra = {}) {
  const r = await call("sendMessage", {
    chat_id: CFG.telegram.chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra
  });
  if (r.ok && r.result?.message_id && conversationId) {
    linkTelegram(r.result.message_id, conversationId).catch(() => {});
  }
  return r;
}

export function replyTo(chatId, text) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

/* ##### SECTION: TELEGRAM / MESSAGE BODIES ##### */
/* The opening card an operator sees. Everything needed to answer without
   opening anything else. */
export function handoffCard({ conversationId, summary, transcript, page, city, phone, reason }) {
  const turns = (transcript || []).slice(-8).map((m) =>
    `${m.role === "user" ? "👤" : "🤖"} ${esc(m.content).slice(0, 300)}`
  ).join("\n");

  return [
    `🔧 <b>Someone wants a person</b>`,
    city ? `📍 ${esc(city)}` : "",
    phone ? `📞 ${esc(phone)}` : `📞 <i>no number given — they are on a computer</i>`,
    reason ? `❓ ${esc(reason)}` : "",
    summary ? `\n<b>Summary</b>\n${esc(summary)}` : "",
    turns ? `\n<b>Conversation</b>\n${turns}` : "",
    page ? `\n<i>${esc(page)}</i>` : "",
    `\n<b>Reply to this message to talk to them live.</b>`,
    `<code>${esc(String(conversationId).slice(0, 8))}</code>`
  ].filter(Boolean).join("\n");
}

export function customerLine(body) {
  return `👤 ${esc(body).slice(0, 1200)}`;
}

/* ##### SECTION: TELEGRAM / LEAD ALERTS #####
   Telegram doubles as the notification channel, not just the live-chat
   one. Without this a booking that arrives while nobody is watching
   lands in the database and pings nobody until someone opens /admin. */

/* Telegram linkifies a bare phone number, so it stays tappable on a
   phone without needing an inline keyboard. */
export function leadCard(d) {
  const urgent = /emergency/i.test(d.urgency || "") || d.source === "chat_escalation";
  return [
    urgent ? "🚨 <b>URGENT LEAD</b>" : "🔧 <b>New lead</b>",
    ``,
    `<b>${esc(d.name)}</b>`,
    `📞 ${esc(d.phone_display || d.phone)}`,
    d.service ? `🛠 ${esc(d.service)}` : "",
    d.city ? `📍 ${esc(d.city)}` : "",
    d.address ? `🏠 ${esc(d.address)}` : "",
    d.urgency ? `⏱ ${esc(d.urgency)}` : "",
    d.notes ? `\n<b>What they said</b>\n${esc(d.notes).slice(0, 700)}` : "",
    d.source && d.source !== "form" ? `\n<i>via the chat assistant</i>` : "",
    d.page ? `<i>${esc(d.page)}</i>` : ""
  ].filter(Boolean).join("\n");
}

/* Someone asked for a person but nobody was marked available, so there
   is no live thread to open -- this is the "you missed one" message. */
export function awayEscalationCard(d) {
  const turns = (d.transcript || []).slice(-6)
    .map((m) => `${m.role === "user" ? "👤" : "🤖"} ${esc(m.content).slice(0, 240)}`)
    .join("\n");
  return [
    `🔔 <b>Someone wanted a person while you were away</b>`,
    d.name ? `\n<b>${esc(d.name)}</b>` : "",
    d.phone ? `📞 ${esc(d.phone_display || d.phone)}` : `📞 <i>no number yet — they may still leave one</i>`,
    d.city ? `📍 ${esc(d.city)}` : "",
    d.summary ? `\n${esc(d.summary)}` : "",
    turns ? `\n<b>Conversation</b>\n${turns}` : "",
    d.page ? `\n<i>${esc(d.page)}</i>` : "",
    `\n<i>Send /available to take chats live.</i>`
  ].filter(Boolean).join("\n");
}

export function sendLeadAlert(d, conversationId = null) {
  return sendToOps(conversationId, leadCard(d));
}

export function sendAwayEscalation(d, conversationId = null) {
  return sendToOps(conversationId, awayEscalationCard(d));
}

/* ##### SECTION: TELEGRAM / WEBHOOK SETUP ##### */
/* Run once after deploying, or whenever the URL changes. */
export function setWebhook(url) {
  return call("setWebhook", {
    url,
    secret_token: CFG.telegram.webhookSecret || undefined,
    allowed_updates: ["message"],
    drop_pending_updates: true
  });
}

export function getWebhookInfo() {
  return call("getWebhookInfo", {});
}

/* ##### SECTION: TELEGRAM / HEALTH ##### */
export async function pingTelegram() {
  if (!CFG.telegram.token) return { configured: false };
  const r = await call("getMe", {});
  return {
    configured: true,
    reachable: r.ok,
    bot: r.ok ? r.result?.username : undefined,
    reason: r.ok ? undefined : r.reason,
    /* Telegram's own wording -- "Unauthorized" means a dead or wrong
       token, which is a different fix from a network failure. */
    description: r.ok ? undefined : r.description
  };
}

/* ##### SECTION: TELEGRAM / TOKEN SHAPE #####
   Describes the configured token without revealing it. Most setup
   failures are a truncated paste, a stray newline, or the old token
   left in place after revoking -- all visible from the shape alone. */
export function tokenShape() {
  const raw = process.env.TELEGRAM_BOT_TOKEN || "";
  const t = raw.trim();
  const m = /^(\d+):([A-Za-z0-9_-]+)$/.exec(t);
  return {
    length: t.length,
    hasSurroundingWhitespace: raw !== t,
    hasInternalWhitespace: /\s/.test(t),
    looksLikeToken: Boolean(m),
    botId: m ? m[1] : null,          /* public half; safe to show */
    secretLength: m ? m[2].length : 0,
    startsWith: t.slice(0, 4),
    /* A healthy token is <8-10 digits>:<35 chars>, about 46 total. */
    expected: "<bot id digits>:<35 characters>"
  };
}
