# tools/

`build-services.js` regenerates every page under `services/` plus the shared
nav/footer partials from one data table.

The site does **not** need this to run — `services/*.html` are plain committed
files that work on their own. This is here so twenty pages can be edited in one
place instead of twenty.

    node tools/build-services.cjs

Edit the `SERVICES` array to change copy, `CARDS` for the one-line grid
summaries, `FEATURED` for which six show on the homepage, and `I` for the icons.

After changing `FEATURED` or the footer, the homepage grid and footer in
`index.html` must be re-pasted by hand from the partials the script drops
next to itself (`services-grid-root.html`, `footer-root.html`, `nav-root.html`).
