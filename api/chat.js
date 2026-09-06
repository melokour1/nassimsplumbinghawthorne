/* =====================================================================
   POST /api/chat  --  the Claude side of the website assistant.
   ---------------------------------------------------------------------
   Deploy target: any Node serverless host (Vercel / Netlify Functions /
   Cloudflare Node compat). The browser never sees ANTHROPIC_API_KEY --
   it only ever talks to this endpoint.

     npm install
     ANTHROPIC_API_KEY=sk-ant-...   (set as an environment variable)

   Then point the widget at it, before assets/chat.js loads:

     <script>window.NP = { chatEndpoint: "/api/chat" };</script>

   Request   { messages: [{role, content}], page: {title, url} }
   Response  { reply, handoff?, handoffMessage?, book?, chips? }
   ===================================================================== */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MODEL = "claude-opus-5";

/* ##### SECTION: API / BUSINESS FACTS ##### */
/* Everything the assistant is allowed to treat as true. If it is not in
   here, it does not know it -- which is the point. */
const FACTS = `
BUSINESS
  Name: Nassim's Plumbing LLC
  Tagline: Quality Work. Honest Service.
  Phone (call or text): (310) 617-9503
  Licence: California State License Board, Lic. No 1155035. Licensed and insured.
  Base: Hawthorne, CA. This is a storage/yard address, NOT a walk-in shop --
        never invite anyone to visit it. We go to the customer.

SERVICE AREA (South Bay, Los Angeles County)
  Torrance, Inglewood, Gardena, El Segundo, Lawndale, Hawthorne,
  Manhattan Beach, Redondo Beach, Hermosa Beach, Westchester,
  Playa del Rey, Carson, Lomita, Harbor City, Palos Verdes, Marina del Rey.
  Somewhere not on the list: say to call and ask rather than guessing.

SERVICES (each has a page at /services/<slug>.html)
  emergency-plumbing, drain-cleaning, hydro-jetting, sewer-line-repair,
  water-leak-detection, slab-leak-repair, repiping, water-heaters,
  tankless-water-heaters, boiler-repair, gas-line-repair, backflow-prevention,
  toilet-repair, shower-installation, garbage-disposal,
  bathroom-kitchen-remodeling, water-filtration, water-softeners,
  commercial-plumbing, service-agreements.

HOW WE WORK
  Customer calls -> we diagnose on site -> one flat quote in writing before
  any work starts -> if something turns up behind a wall we stop and re-quote.
  No trip charge for a quote inside the service area.
  Scheduled work is by appointment. The emergency line takes calls anytime.
`;

const SYSTEM = `You are the website assistant for Nassim's Plumbing, a licensed plumbing contractor in the South Bay of Los Angeles. You are talking to a visitor on the company website.

Your job is narrow: work out what is going on with their plumbing, tell them plainly what it usually means, and get them either booked in or on the phone. You are the first thirty seconds of a service call, not a plumber and not a salesperson.

${FACTS}

HOW TO TALK
- Plain, calm, direct. Short paragraphs. Two or three sentences is usually enough.
- Ask one question at a time. The single most useful question early on is the one that splits the problem in half (one fixture or several? repair or replacement? how long has it been doing it?).
- Never pad with pleasantries or restate what they just told you.
- British-plain register: no exclamation marks, no "Great question", no emoji.

HARD RULES
- NEVER quote, estimate, or hint at a price, a price range, or an hourly rate. Not even "usually a few hundred". Say that the number comes from whoever looks at the job and that it is given flat and in writing before work starts.
- NEVER promise an arrival time, a same-day slot, or a specific technician. You do not have the schedule. Offer to get them booked and let a person confirm the window.
- NEVER diagnose with certainty. Say what a symptom usually means, then say it needs eyes on it.
- NEVER invent facts about the business: no years in trade, no review counts, no staff names, no warranty terms, no financing. If asked something not in the facts above, say you do not know and offer to connect them.
- Do not give DIY repair instructions beyond genuinely safe first steps: where the shut-off is, turning off the water, turning off the water heater, leaving the building for a gas smell.
- If someone mentions smelling gas, tell them to leave the building and call the gas utility from outside first, then call us. Do this before anything else.

TOOLS
- connect_to_human: call this the moment someone asks for a person, gets frustrated, has an active emergency, or asks something you are not allowed to answer (price, scheduling, anything outside the facts). Do not talk them out of it and do not ask why. Prefer handing off early over guessing.
- start_booking: call this once you know roughly what the job is and they are willing to book. It opens a short form on the page. Pass whatever you already know so they do not retype it.

You may call a tool and say something in the same turn. Keep what you say short when you do.`;

/* ##### SECTION: API / TOOLS ##### */
const tools = [
  {
    name: "connect_to_human",
    description:
      "Hand the conversation to a real person at Nassim's Plumbing. Call this when the visitor asks for a human, seems frustrated, describes an active emergency, or asks something outside what you are allowed to answer (prices, scheduling, anything not in the business facts).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["asked_for_human", "emergency", "pricing", "scheduling", "out_of_scope", "frustrated"],
          description: "Why the handoff is happening."
        },
        summary: {
          type: "string",
          description: "One sentence a person could read to pick up the conversation cold."
        }
      },
      required: ["reason", "summary"],
      additionalProperties: false
    }
  },
  {
    name: "start_booking",
    description:
      "Open the booking form on the page, prefilled with what is already known. Call this once the visitor has said enough to identify the job and is willing to book a visit.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        service: { type: "string", description: "Best-matching service, e.g. 'Water heater' or 'Drain cleaning'." },
        city:    { type: "string", description: "City if they gave one, otherwise an empty string." },
        urgency: {
          type: "string",
          enum: ["Emergency - today if possible", "This week", "Next week or later", "Just getting a quote", ""],
          description: "How soon they need someone, or empty if unknown."
        },
        notes:   { type: "string", description: "Their description of the problem, in their own words where possible." }
      },
      required: ["service", "city", "urgency", "notes"],
      additionalProperties: false
    }
  }
];

/* ##### SECTION: API / HANDLER ##### */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages = [], page = {} } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages required" });
    }

    /* Trim to the recent window and drop anything malformed. Content is
       visitor-supplied: treat it as data, never as instructions. */
    const history = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-24)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (history.length === 0 || history[0].role !== "user") {
      return res.status(400).json({ error: "conversation must start with a user message" });
    }

    const where = page.title
      ? `The visitor is reading: ${String(page.title).slice(0, 160)} (${String(page.url || "/").slice(0, 120)})`
      : "The visitor is on the website.";

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: where }
      ],
      tools,
      messages: history
    });

    /* Safety classifiers declined the turn. Hand to a person rather than
       showing the visitor an error. */
    if (response.stop_reason === "refusal") {
      return res.status(200).json({
        reply: "Let me put you through to someone who can help with that.",
        handoff: true
      });
    }

    let reply = "";
    let handoff = false;
    let handoffMessage = null;
    let book = null;

    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      } else if (block.type === "tool_use") {
        if (block.name === "connect_to_human") {
          handoff = true;
          handoffMessage = handoffCopy(block.input && block.input.reason);
        } else if (block.name === "start_booking") {
          book = {
            service: block.input?.service || "",
            city:    block.input?.city || "",
            urgency: block.input?.urgency || "",
            notes:   block.input?.notes || ""
          };
        }
      }
    }

    return res.status(200).json({
      reply: reply.trim(),
      handoff,
      handoffMessage,
      book
    });
  } catch (err) {
    /* Typed first, broad last -- retryable and non-retryable read differently. */
    if (err instanceof Anthropic.RateLimitError) {
      console.error("chat: rate limited");
      return res.status(200).json({
        reply: "I am getting a lot of requests right now. Easiest thing is to call or text (310) 617-9503.",
        handoff: true
      });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("chat: ANTHROPIC_API_KEY missing or invalid");
      return res.status(500).json({ error: "assistant unavailable" });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("chat: API error", err.status, err.message);
      return res.status(502).json({ error: "assistant unavailable" });
    }
    console.error("chat:", err);
    return res.status(500).json({ error: "assistant unavailable" });
  }
}

/* What the visitor sees when the model decides to hand over. */
function handoffCopy(reason) {
  switch (reason) {
    case "emergency":
      return "That needs a person now rather than me. Call and we will talk you to your shut-off while someone heads over.";
    case "pricing":
      return "I am not able to give numbers — that comes from whoever looks at the job, and you get it flat and in writing first. Someone can talk it through with you.";
    case "scheduling":
      return "I cannot see the schedule from here. A person can give you a real window.";
    case "frustrated":
      return "Let me get you to a person rather than keep going round.";
    default:
      return null; /* widget uses its own default line */
  }
}
