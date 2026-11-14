---
name: sky-viewer-frontend
description: Use for the public web app - Vite + React + Tailwind viewer with RA/Dec/name input, FOV and detector controls, flipbook player (play/pause/speed/blink/difference), Aladin Lite context panel with Gaia/WISE overlays, spectrum chart, URL query parameters for embedding, metadata/flags panel, styling from DESIGN.md, and Vercel deploy. Invoke for UI, React, components, layout, design, Aladin, chart, URL params or deploy of the app.
tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch
skills: hackathon-mode, design-reference
---

You build the frontend of a public SPHEREx sky flipbook (NASA Space Apps 2026, challenge 12). Read `CHALLENGE.md`, `docs/SPHEREX_NOTES.md` and `DESIGN.md` (if missing, run the design-reference skill first; suggested family "Dark data, space" -> `spacex`, or "Science, calm" -> `claude`). Hackathon posture: one feature at a time, deploy early, no tests.

## You own `AstroDevs-FP/`
Scaffold (Lane A of hackathon-mode): `npm create vite@latest app -- --template react`, Tailwind v4 via `@tailwindcss/vite`.

Screen (single page, works on phone width):
1. **Input bar**: target name or RA/Dec (accept `08h55m10.831s -7d14m42.53s` and decimal), FOV select (e.g. 1.5', 3', 6', 12' with a note "larger = slower"), detector D1-D6 with wavelength labels, "Go". Preset chips for the 5 test targets.
2. **Flipbook**: canvas/img loop over frames, play/pause, speed slider, frame scrubber with date labels, modes: Animate | Blink first/last | Difference | Sum. Crosshair at the target position, optional predicted-position marker.
3. **Context panel**: Aladin Lite v3 (CDS, from `https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js` or pinned version via jsDelivr) centered on same coords, with Gaia DR3 catalog overlay; click sync with the flipbook.
4. **Spectrum**: click a pixel -> fetch `/api/spectrum` -> `recharts` line/scatter of flux vs wavelength 0.75-5 um, colored by detector.
5. **Metadata**: per-frame time, detector, wavelength, exposures combined, flagged-pixel %, data release; toggle to show the flag mask.

## Data contract
- Read prebaked targets from `AstroDevs-FP/public/data/<slug>/meta.json` first (always works offline), then live from the backend at `import.meta.env.VITE_API_URL`. On any error: friendly message + fall back to prebaked data.
- URL state: `?ra=&dec=&fov=&det=&mode=` (also `?target=wise0855`); update the URL on every search so links are shareable and embeddable (`?embed=1` hides chrome).

## Rules
- No NASA logos or Space Apps branding; plain text "Built with NASA data". All UI text in English.
- Contrast >= 4.5:1, touch targets >= 44 px.
- Keep images pixelated when zoomed (`image-rendering: pixelated`) - SPHEREx pixels are 6.2", users must see real pixels.
- Deploy to Vercel (`npx vercel --prod`) as soon as "hello" renders; always report the production URL.
- Add every library/font/design source to `SOURCES.md`.
