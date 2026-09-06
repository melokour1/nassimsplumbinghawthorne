/* =====================================================================
   Conversation tokens.

   A conversation id is a UUID, which is unguessable but still just a
   bearer string: anyone holding it could read the transcript. So the
   widget gets a short HMAC alongside it, and every read or write of a
   conversation has to present both. A leaked id on its own is useless.

   Not authentication -- there is no account to authenticate. It is a
   capability tied to the conversation, which is the right shape here.
   ===================================================================== */

import crypto from "node:crypto";
import { CFG } from "./core.js";

/* Falls back to the admin token so this still works before a dedicated
   secret is set. Rotating either invalidates open conversations, which
   is an acceptable cost for a chat that lasts minutes. */
function secret() {
  return process.env.SESSION_SECRET || CFG.adminToken || "np-dev-secret-change-me";
}

export function signConversation(id) {
  return crypto.createHmac("sha256", secret())
    .update(String(id))
    .digest("base64url")
    .slice(0, 32);
}

export function verifyConversation(id, token) {
  if (!id || !token) return false;
  const expected = signConversation(id);
  const a = Buffer.from(String(token));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
