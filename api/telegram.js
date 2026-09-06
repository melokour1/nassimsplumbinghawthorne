/* =====================================================================
   POST /api/telegram  --  webhook for the operator side.

   Handles two kinds of update:

   1. A reply to any message we forwarded. The message_id is looked up in
      telegram_links, which tells us the conversation, and the text lands
      in the customer's chat window within one poll.

   2. Commands:
        /available   presence on  -- the widget may offer live chat
        /away        presence off -- it stops offering it
        /status      what is open right now
        /close       end the conversation you are replying to

   Telegram retries an update until it gets a 200, so this always answers
   200 even on failure and logs the problem instead of building a retry
   storm.
   ===================================================================== */

import { json, readBody, log, HAS, CFG } from "./_lib/core.js";
import {
  conversationForTelegram, addMessage, patchConversation,
  setPresence, listLive, getConversation
} from "./_lib/live.js";
import { replyTo } from "./_lib/telegram.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false });
  }

  /* Telegram signs every call with the secret set at registration. Without
     this anyone who guesses the URL could inject operator messages. */
  if (CFG.telegram.webhookSecret) {
    const got = req.headers["x-telegram-bot-api-secret-token"];
    if (got !== CFG.telegram.webhookSecret) {
      log("telegram.bad_secret", {});
      return json(res, 401, { ok: false });
    }
  }

  /* No token at all: nothing to do and nothing we could reply with. */
  if (!CFG.telegram.token) return json(res, 200, { ok: true, skipped: "no_token" });

  try {
    const update = await readBody(req);
    const msg = update?.message;
    if (!msg || typeof msg.text !== "string") return json(res, 200, { ok: true });

    const chatId = msg.chat?.id;

    /* ##### SECTION: TELEGRAM / BOOTSTRAP #####
       Token set but no TELEGRAM_CHAT_ID yet. This is the only way to
       find out what the chat id actually is, so answer it rather than
       going silent -- otherwise setup has no starting point. */
    if (!CFG.telegram.chatId) {
      log("telegram.bootstrap", { chatId: String(chatId) });
      await replyTo(chatId,
        `👋 <b>Bot is connected.</b>\n\n` +
        `One thing left. Add this as <code>TELEGRAM_CHAT_ID</code> in Vercel, then redeploy:\n\n` +
        `<code>${chatId}</code>\n\n` +
        `<i>Tap the number to copy it.</i>\n\n` +
        `After the redeploy, send /available and the website will start offering live chat.`);
      return json(res, 200, { ok: true, bootstrap: true });
    }
    const from = msg.from || {};
    const operatorName = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Nassim's Plumbing";
    const text = msg.text.trim();

    /* Only the configured ops chat may drive anything. */
    if (String(chatId) !== String(CFG.telegram.chatId)) {
      log("telegram.wrong_chat", { chatId: String(chatId) });
      await replyTo(chatId, "This bot only works in the Nassim's Plumbing operator chat.");
      return json(res, 200, { ok: true });
    }

    /* ##### SECTION: TELEGRAM / COMMANDS ##### */
    if (text.startsWith("/")) {
      await command(text, chatId, operatorName, msg);
      return json(res, 200, { ok: true });
    }

    /* ##### SECTION: TELEGRAM / OPERATOR REPLY ##### */
    const replyToId = msg.reply_to_message?.message_id;
    if (!replyToId) {
      await replyTo(chatId,
        "Reply <b>to a customer message</b> and it goes straight to them.\n\n" +
        "Commands: /available, /away, /status, /close");
      return json(res, 200, { ok: true });
    }

    const conversationId = await conversationForTelegram(replyToId);
    if (!conversationId) {
      await replyTo(chatId, "I could not match that reply to a conversation. It may have ended.");
      return json(res, 200, { ok: true });
    }

    const stored = await addMessage(conversationId, "operator", text, operatorName);
    if (!stored.ok) {
      await replyTo(chatId, "⚠️ That did not save — the customer has not seen it. Try again.");
      return json(res, 200, { ok: true });
    }

    log("live.operator_reply", { conversationId, by: operatorName, len: text.length });
    /* Telegram shows no delivery state of its own, so confirm explicitly.
       An operator who cannot tell whether a message landed will send it
       twice. */
    await replyTo(chatId, "✅ Sent");
    return json(res, 200, { ok: true });
  } catch (err) {
    log("telegram.webhook_error", { msg: err.message });
    return json(res, 200, { ok: true });   /* never make Telegram retry */
  }
}

/* ##### SECTION: TELEGRAM / COMMAND HANDLERS ##### */
async function command(text, chatId, operatorName, msg) {
  const cmd = text.split(/[\s@]/)[0].toLowerCase();

  if (cmd === "/available" || cmd === "/on") {
    await setPresence(chatId, true, operatorName);
    return replyTo(chatId,
      `🟢 <b>You are on.</b>\nThe website will now offer live chat.\n\n` +
      `Send /away when you stop watching — presence also lapses on its own after 90 minutes.`);
  }

  if (cmd === "/away" || cmd === "/off") {
    await setPresence(chatId, false, operatorName);
    return replyTo(chatId,
      `⚪ <b>You are off.</b>\nVisitors get the callback form instead of live chat. Leads still arrive as normal.`);
  }

  if (cmd === "/status") {
    const live = await listLive();
    if (!live.ok) return replyTo(chatId, "Could not read the conversation list.");
    if (!live.rows.length) return replyTo(chatId, "Nothing open right now.");
    const lines = live.rows.map((c) => {
      const tag = c.live_status === "waiting" ? "🔴 waiting" : "🟢 live";
      return `${tag} <code>${String(c.id).slice(0, 8)}</code> ${c.city || ""} ${c.summary ? "— " + c.summary.slice(0, 60) : ""}`;
    });
    return replyTo(chatId, `<b>Open conversations</b>\n${lines.join("\n")}`);
  }

  if (cmd === "/close") {
    const replyToId = msg.reply_to_message?.message_id;
    const id = replyToId ? await conversationForTelegram(replyToId) : null;
    if (!id) return replyTo(chatId, "Reply to the conversation you want to close, then send /close.");
    await patchConversation(id, { live_status: "closed" });
    await addMessage(id, "system", "The plumber has closed this chat. Call (310) 617-9503 if you need anything else.");
    return replyTo(chatId, "Closed.");
  }

  if (cmd === "/start" || cmd === "/help") {
    return replyTo(chatId,
      `<b>Nassim's Plumbing — operator bot</b>\n\n` +
      `When someone on the website asks for a person, they appear here. ` +
      `<b>Reply to their message</b> and it shows up in their chat window.\n\n` +
      `/available — start offering live chat\n` +
      `/away — stop offering it\n` +
      `/status — what is open\n` +
      `/close — end the conversation you are replying to\n\n` +
      `This chat id is <code>${chatId}</code>`);
  }

  return replyTo(chatId, "Unknown command. Try /help");
}
