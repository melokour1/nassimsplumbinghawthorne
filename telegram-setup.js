/* =====================================================================
   GET /api/telegram-setup?token=<ADMIN_TOKEN>

   Setup and diagnosis for the Telegram operator channel, so you never
   have to paste your bot token into a terminal to find out what is
   wrong.

     ?token=...            what Telegram thinks the webhook is
     ?token=...&fix=1      (re)register the webhook at this deployment

   Guarded by ADMIN_TOKEN, and it never echoes the bot token back.
   ===================================================================== */

import { cors, methodGuard, json, clientIp, rateLimit, log, HAS, CFG } from "./_lib/core.js";
import { getWebhookInfo, setWebhook, pingTelegram, tokenShape } from "./_lib/telegram.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (methodGuard(req, res, "GET")) return;

  const rl = rateLimit(`tgsetup:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return json(res, 429, { ok: false, error: "rate_limited" });
  }

  const url = new URL(req.url, "http://localhost");
  const given = url.searchParams.get("token") || "";

  if (!HAS.admin) return json(res, 503, { ok: false, error: "ADMIN_TOKEN is not set" });
  if (given !== CFG.adminToken) return json(res, 401, { ok: false, error: "unauthorised" });

  if (!CFG.telegram.token) {
    return json(res, 200, {
      ok: false,
      problem: "TELEGRAM_BOT_TOKEN is not set in this deployment.",
      next: "Add it in Vercel, redeploy, then load this again."
    });
  }

  const bot = await pingTelegram();
  if (!bot.reachable) {
    const shape = tokenShape();

    /* Point at the specific cause rather than a generic rejection --
       nearly every case is one of these four. */
    let likely;
    if (shape.hasSurroundingWhitespace || shape.hasInternalWhitespace) {
      likely = "The value has whitespace in it. Re-paste it with no spaces or line breaks.";
    } else if (!shape.looksLikeToken) {
      likely = `That does not look like a bot token. It should be ${shape.expected}, around 46 characters. Yours is ${shape.length}.`;
    } else if (shape.secretLength < 30) {
      likely = `The token looks truncated -- the half after the colon is ${shape.secretLength} characters, expected about 35.`;
    } else if (bot.description === "Unauthorized") {
      likely = "Telegram says Unauthorized, so the token is well-formed but dead. Almost always this is the OLD token still in Vercel after revoking in @BotFather. Copy the new one from BotFather.";
    } else {
      likely = "The token is well-formed but Telegram will not accept it.";
    }

    return json(res, 200, {
      ok: false,
      problem: "Telegram rejected the bot token.",
      telegramSaid: bot.description || null,
      likely,
      tokenShape: shape,   /* never the token itself */
      alsoCheck: [
        "Vercel applies environment variables at build time -- after changing one you must Redeploy, not just save.",
        "Make sure the variable is ticked for the Production environment.",
        "Confirm you are reading this on the deployment that has the variable set."
      ]
    });
  }

  /* Build the webhook URL from the request itself, so this works on any
     deployment or custom domain without being told where it lives. */
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const webhookUrl = `${proto}://${host}/api/telegram`;

  if (url.searchParams.get("fix") === "1") {
    const r = await setWebhook(webhookUrl);
    log("telegram.webhook_set", { ok: r.ok, url: webhookUrl });
    if (!r.ok) {
      return json(res, 200, { ok: false, problem: "Telegram refused the webhook.", detail: r.description, tried: webhookUrl });
    }
    return json(res, 200, {
      ok: true,
      bot: bot.bot,
      webhook: webhookUrl,
      chatIdConfigured: Boolean(CFG.telegram.chatId),
      next: CFG.telegram.chatId
        ? "Send /available to the bot and live chat goes on."
        : "Now message the bot anything. It will reply with the chat id to put in TELEGRAM_CHAT_ID."
    });
  }

  const info = await getWebhookInfo();
  const current = info.ok ? info.result : null;
  const matches = current?.url === webhookUrl;

  return json(res, 200, {
    ok: Boolean(matches),
    bot: bot.bot,
    expected: webhookUrl,
    registered: current?.url || null,
    matches,
    chatIdConfigured: Boolean(CFG.telegram.chatId),
    secretConfigured: Boolean(CFG.telegram.webhookSecret),
    /* The two fields worth reading when messages vanish silently. */
    pendingUpdates: current?.pending_update_count,
    lastError: current?.last_error_message || null,
    lastErrorAt: current?.last_error_date
      ? new Date(current.last_error_date * 1000).toISOString() : null,
    next: matches
      ? (CFG.telegram.chatId
          ? "Wired up. Send /available to the bot."
          : "Message the bot anything and it will reply with the chat id.")
      : "Webhook is not pointing here. Load this URL again with &fix=1 to register it."
  });
}
