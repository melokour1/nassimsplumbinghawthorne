# Nassim's Plumbing

Static marketing site for Nassim's Plumbing LLC — a licensed plumbing contractor
serving the South Bay of Los Angeles. CA Lic. No 1155035.

No framework, no build step. `index.html` and everything under `services/` are
plain files that work opened directly or served from any static host.

## Layout

```
index.html              home — 3D hero, featured services, process, service area
services/index.html     all 20 services
services/<slug>.html    one page per service
assets/site.css         layout and type
assets/ui.css           top bar, booking modal, chat widget, sticky bar
assets/site.js          nav, scroll reveals, counters, service-area map
assets/booking.js       "Book / Schedule service" modal
assets/chat.js          website assistant (offline mode by default)
assets/logo.png         brand assets, keyed out of the supplied JPG
api/chat.js             OPTIONAL — Claude backend for the assistant
tools/build-services.cjs regenerates services/ from one data table
```

## The 3D hero

`index.html` carries a Three.js (r128, from CDN) isometric scene inline. Every
mesh, material and texture is generated in code — there are no model or texture
files. The camera translates along a locked isometric vector as you scroll, which
is what keeps the parallel-edge read; it never rotates.

Two r128 quirks are worked around in-file and commented:

- `renderer.compile()` primes Sprite/Points materials with the wrong program and
  they then never draw. It is deliberately not called.
- `CurvePath.getPoint()` ignores the optional target vector, so the return value
  has to be used.

## Editing services

All 20 service pages come from one table:

```bash
node tools/build-services.cjs
```

Edit `SERVICES` for copy, `CARDS` for the grid one-liners, `FEATURED` for which
six appear on the home page, and `I` for the icons. After changing `FEATURED`,
the nav, or the footer, paste the regenerated partials from `tools/` into
`index.html` — it is the one page the generator does not own.

## The website assistant

`assets/chat.js` runs in one of two modes.

**Offline (default).** A small deterministic triage assistant runs in the page.
It routes symptoms to the right service, never quotes a price, and always offers
a person. Works on any static host with no backend and no API key.

**Claude.** Deploy `api/chat.js` to any Node serverless host, set
`ANTHROPIC_API_KEY` in that host's environment, then point the widget at it:

```html
<script>window.NP = { chatEndpoint: "/api/chat" };</script>
```

(The `window.NP` block is already in every page — uncomment the line.)

```bash
npm install
```

The key stays server-side; the browser only ever talks to `/api/chat`. The
assistant has two tools: `connect_to_human`, which hands off the moment someone
asks for a person or hits anything it is not allowed to answer, and
`start_booking`, which opens the booking form prefilled. Its system prompt
forbids quoting prices, promising arrival times, and inventing facts about the
business.

## Booking

`assets/booking.js` composes the request into a prefilled SMS, so it works with
no backend. To post it to a server instead, set `bookEndpoint` alongside
`chatEndpoint`; it falls back to SMS if the request fails.

## Contact

(310) 617-9503 · 4249 W 138th St #B, Hawthorne, CA 90250
