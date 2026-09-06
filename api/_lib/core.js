/* =====================================================================
   Shared plumbing for the API: config, HTTP envelope, validation,
   rate limiting, spam checks.

   Design rule for this whole backend: a lead is never trusted to a single
   hop. Every handler is written so that a failure downstream still tells
   the browser to fall back to the customer's own SMS app, which cannot
   fail. Losing a job because a database was asleep is not acceptable.
   ===================================================================== */

/* ##### SECTION: CORE / CONFIG ##### */
export const CFG = {
  biz: {
    name: "Nassim's Plumbing",
    phone: "(310) 617-9503",
    tel: "+13106179503"
  },

  /* Where the browser is allowed to call us from. Comma-separated. */
  origins: (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean),

  supabase: {
    url: process.env.SUPABASE_URL || "",
    /* service_role: server-only. Never ship this to the browser. */
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  },

  twilio: {
    sid:   process.env.TWILIO_ACCOUNT_SID || "",
    token: process.env.TWILIO_AUTH_TOKEN || "",
    from:  process.env.TWILIO_FROM || ""
  },

  resend: {
    key:  process.env.RESEND_API_KEY || "",
    from: process.env.LEAD_EMAIL_FROM || "",
    to:   process.env.LEAD_EMAIL_TO || ""
  },

  /* Where escalations and new leads are sent. */
  ops: {
    sms:   process.env.OPS_SMS_TO || "",
    email: process.env.LEAD_EMAIL_TO || ""
  },

  adminToken: process.env.ADMIN_TOKEN || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || ""
};

export const HAS = {
  db:     Boolean(CFG.supabase.url && CFG.supabase.key),
  sms:    Boolean(CFG.twilio.sid && CFG.twilio.token && CFG.twilio.from && CFG.ops.sms),
  email:  Boolean(CFG.resend.key && CFG.resend.from && CFG.resend.to),
  claude: Boolean(CFG.anthropicKey),
  admin:  Boolean(CFG.adminToken)
};

/* ##### SECTION: CORE / HTTP ##### */
export function cors(req, res) {
  const origin = req.headers.origin;
  /* No allowlist configured => same-origin only, which needs no header. */
  if (origin && CFG.origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function methodGuard(req, res, allowed) {
  if (req.method !== allowed) {
    res.setHeader("Allow", allowed);
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }
  return false;
}

export function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

/* Body may already be parsed by the host, or arrive as a raw stream. */
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

/* Run a promise with a hard ceiling so one slow dependency cannot hang
   the request until the platform kills it. */
export function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/* ##### SECTION: CORE / CLIENT IDENTITY ##### */
export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "0.0.0.0";
}

/* Stored instead of the raw IP: enough to rate limit and spot abuse,
   not enough to be personal data sitting in a table. */
export async function hashIp(ip) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("np:" + ip));
    return Array.from(new Uint8Array(buf)).slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unknown";
  }
}

/* ##### SECTION: CORE / RATE LIMIT ##### */
/* Per-instance memory. Serverless spreads traffic across instances, so
   this is a blunt instrument against floods, not a precise quota. It is
   deliberately cheap: no extra service to go down. */
const BUCKETS = new Map();

export function rateLimit(key, { limit = 8, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const b = BUCKETS.get(key);

  if (!b || now > b.reset) {
    BUCKETS.set(key, { count: 1, reset: now + windowMs });
    if (BUCKETS.size > 5000) {
      for (const [k, v] of BUCKETS) if (now > v.reset) BUCKETS.delete(k);
    }
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.count++;
  return { ok: true, remaining: limit - b.count };
}

/* ##### SECTION: CORE / VALIDATION ##### */
const clean = (v, max) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/* US 10-digit to E.164. Returns "" when it is not a plausible number. */
export function normalisePhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (d.length > 11 && d.length <= 15) return "+" + d;
  return "";
}

export function validateLead(input) {
  const errors = {};

  const name    = clean(input.name, 80);
  const phoneIn = clean(input.phone, 40);
  const phone   = normalisePhone(phoneIn);

  if (name.length < 2) errors.name = "Name is required.";
  if (!phone)          errors.phone = "A valid phone number is required.";

  const data = {
    name,
    phone,
    phone_display: phoneIn,
    service:  clean(input.service, 80)  || "Not specified",
    city:     clean(input.city, 60)     || "",
    address:  clean(input.address, 160) || "",
    urgency:  clean(input.urgency, 60)  || "",
    notes:    clean(input.notes, 2000)  || "",
    page:     clean(input.page, 200)    || "",
    source:   ["form", "chat", "chat_escalation"].includes(input.source) ? input.source : "form"
  };

  return { ok: Object.keys(errors).length === 0, errors, data };
}

/* ##### SECTION: CORE / SPAM ##### */
/* Two cheap signals that cost a real customer nothing:
   - a hidden field only a bot fills in
   - a form completed impossibly fast */
export function looksLikeSpam(input) {
  if (clean(input.company, 100)) return "honeypot";

  const elapsed = Number(input.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 1500) return "too_fast";

  const notes = String(input.notes || "");
  if (/https?:\/\/|\[url=|<a\s+href/i.test(notes)) return "links_in_notes";

  return null;
}

/* ##### SECTION: CORE / LOGGING ##### */
/* One line of JSON per event so the host's log search is actually usable.
   Never log a full phone number or address. */
export function log(event, fields = {}) {
  try {
    console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
  } catch {
    console.log(event);
  }
}

export function redactPhone(p) {
  const s = String(p || "");
  return s.length > 4 ? "***" + s.slice(-4) : "***";
}
