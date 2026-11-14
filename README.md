# CosmoSight: watch the infrared sky change, with SPHEREx

**NASA Space Apps Challenge 2026 · Challenge 12: Planet X and SPHEREx**

Live app: _coming soon (will be hosted on a `*.vercel.app` or `*.github.io` address)_
Demo: _coming soon_

## In short

**What we built.** CosmoSight is a free web tool that turns NASA's SPHEREx images into short time-lapses. You type a position on the sky (or a name), and it plays every SPHEREx visit of that spot in a loop, like a little movie.

**How it answers the challenge.** SPHEREx photographs the whole sky every six months in 102 infrared colors. Things that are close to us, like nearby stars, brown dwarfs, asteroids and comets, shift a little between those photos. CosmoSight lines the photos up perfectly and keeps their brightness consistent, so the only thing that changes on screen is what really changed in the sky. On top of that, it blinks two dates, shows differences, and stacks infrared colors.

**Why it matters.** Pluto was found by blinking two photographs. Most known brown dwarfs were found by volunteers doing the same thing with older NASA data. SPHEREx will image more than a billion objects, far more than scientists can check alone. CosmoSight lets anyone with a browser look, measure and share what they find.

## What you can do with it

| You want to… | How |
| --- | --- |
| Learn the screen | A one-minute guided tour opens on your first visit (skip it any time; replay it with the ? button). Shared links open straight to their view. |
| Look at the whole sky | The big map shows the real SPHEREx all-sky image. Drag to move, scroll to zoom. Pick any of the 102 bands (the two empty filter-edge bands are skipped), or switch to 2MASS (infrared) or DSS2 (visible light). |
| Go to a place on the sky | Click the search bar (or press `/`) and type a name like *WISE 0855* or coordinates like `08h55m10.8s -7d14m42s` or `133.795 -7.245`. |
| See the sky above a city | In search, open *Sky from a place on Earth* and type an address or latitude/longitude and a time. The map turns to show what is overhead. |
| Cut out a patch to study | Choose **Cut out** (`C`), pick a size (1.5′ to 12′) and click the map. |
| Watch it change | Press play (`space`). Change speed, step with `←` `→`, or pick a period with *From / to*. |
| Compare two dates | **Blink** (`B`) flips between two visits. **Difference** (`D`) paints what got fainter in blue and what got brighter in orange, so a moving star becomes a blue-orange pair. |
| Mix colors and dates | Open the menu (☰ or `L`). Each layer is one infrared band at one date. Stack them, change their color, opacity and contrast. Try the presets: *One band*, *False color* and *Then vs now* (first visit in blue, the current one in orange). |
| Follow a star | **Track** (`T`), then click a star. CosmoSight follows it through every visit and compares how far it moved with what Gaia predicts. |
| Measure brightness | **Brightness**, then click a star to get its light curve. Variable stars like R Draconis rise and fall. |
| Get a spectrum of any point on the sky | **Spectrum** (`S`), then click anywhere on the sky map or in a region. The app reads all 102 SPHEREx bands for that spot straight from NASA's open data bucket on AWS, right in your browser. |
| Share it | Every view has its own link, for example `?target=wise-0855&mode=blink`. Use **⤓ GIF** to download the loop as an animation. |

The five test objects from the challenge are built in: Barnard's Star, Epsilon Indi B, WISE 0855-0714, RW Aurigae and R Draconis.

## How it works

```
 NASA / IPAC                          backend (Python)                       web app (browser)
 ───────────                          ────────────────                       ─────────────────
 IRSA search (SIA/TAP) ──which files─▶ find visits of the spot
 AWS S3 bucket, level2 ──pixels─────▶ read only the rows needed (cut-out)
   (IRSA cut-out service = fallback)  remove zodiacal glow, mask bad pixels
                                      line frames up, stack each visit
                                      same contrast for all, Gaia predictions ─▶ PNG + meta.json ─▶ PixiJS workspace
 AWS S3 bucket, all-sky cube ─────────────────────────────── 102-band spectrum, read directly ──▶ Spectrum chart
 IRSA all-sky HiPS ─────────────────────────────────────────────────────────────────────────────▶ Aladin Lite sky map
```

1. **Find.** For a position, we ask IRSA which SPHEREx exposures cover it, and group them into survey visits (about six months apart).
2. **Download only what we need, from AWS.** Every SPHEREx image also lives in NASA's public bucket on AWS (`s3://nasa-irsa-spherex`). FITS lets us read just the rows around the position, about 1-2 MB instead of the 65 MB file. If the bucket fails we ask IRSA's cut-out service instead. Everything is cached.
3. **Clean.** We subtract the zodiacal light (glow from dust in our solar system) and hide pixels the mission flagged as unreliable.
4. **Line up and stack.** Every exposure is reprojected onto one north-up grid, and the exposures of each visit are median-combined to reduce noise.
5. **Same contrast everywhere.** All visits of a band share one brightness scale. Without this, frames flicker and hide real motion.
6. **Predict.** Positions from Gaia DR3 are moved to each visit's date using proper motion and parallax, so the app can show where each star *should* be.
7. **Show.** The browser stacks the frames as colored layers with PixiJS, and draws the whole sky with Aladin Lite.
8. **Spectra anywhere.** For any point you click, the browser finds the right tile of the SPHEREx all-sky cube on AWS and reads that pixel's 102 values with tiny HTTP range requests. No server of ours is involved, so it works for the whole sky, not only the five test targets.

There is a longer walk-through, including the science reasons for each step, in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Data: what is real right now

- **Everything you see for the five test targets is real SPHEREx data** (DR1 and QR3, Wide and Deep surveys), found with NASA/IPAC IRSA's search and read from NASA's SPHEREx open data bucket on AWS on 14 November 2026, then processed by our pipeline. Each target has 3 or 4 survey visits between May 2025 and August 2026. R Draconis, which sits near the ecliptic pole where SPHEREx looks almost every day, has 8 time points.
- **The sky map is real too:** the SPHEREx DR1 all-sky cube served by IRSA.
- **Spectra work for any point on the sky,** read live from the all-sky cube on AWS. Two of the 102 bands are blank by design (the dichroic channels), and very bright stars are blank where they saturate.
- **Bright stars saturate the detector.** Their cores come back flagged. In the picture we fill those pixels in from their neighbours (switch on *Flagged pixels* to see them), and for brightness we measure the ring of light around the core, so the light curve shows real ups and downs but a low absolute level. The app says so next to the chart.
- **IRSA was unreliable on the day we built this** (HTTP 502 errors for hours). While it was down we developed against a simulated sample made from Gaia star positions. That sample is no longer shipped, but `scripts/make_mock.py` can still produce it. When it is used, it is marked `"simulated": true` and `"generated_by_ai": true` in its metadata, and the app shows a *Simulated* badge and watermark.
- **Live cut-outs of any other position** need the backend, which is in beta.
- **When the live services are down, CosmoSight uses its saved copy.** We saved IRSA's search results and a 6′ cut-out of 4,137 images (`data/irsa_snapshot`). The backend falls back to them when IRSA's search or the image servers fail, and the site ships six ready-made regions built from them: the five test targets and the Andromeda Galaxy (M31). If the live service does not answer, the site opens the nearest saved region and says so ("Real SPHEREx data · offline copy").

## NASA data and resources used

- **SPHEREx Level 2 spectral images (DR1 and QR3)**, NASA/IPAC Infrared Science Archive (IRSA), searched with IRSA TAP and SIA2 and downloaded through the IRSA cutout service. https://irsa.ipac.caltech.edu/Missions/spherex.html
- **SPHEREx open data on AWS**, NASA/IPAC: bucket `nasa-irsa-spherex` (us-east-1, anonymous). Level 2 images (`dr1/level2`, `qr3/level2`) and the all-sky 102-band cube (`dr1/hips5_cube`). https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/index.html
- **SPHEREx DR1 all-sky data cube (HiPS)**, IRSA. https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube
- **IRSA SPHEREx tutorial notebooks.** https://caltech-ipac.github.io/irsa-tutorials/spherex/
- **2MASS color sky map**, a NASA-funded survey (UMass and IPAC/Caltech), via IRSA.

## Other resources and tools

- **Gaia DR3** (European Space Agency), for star positions and motions.
- Aladin Lite (CDS Strasbourg), PixiJS, React, Vite, gifenc, astropy, reproject, NumPy, FastAPI and others. Full list with versions, licenses and links: [`SOURCES.md`](SOURCES.md).

## Built with

- **Front end:** JavaScript, React 19, Vite, PixiJS 8 (WebGL) for the region workspace, Aladin Lite 3 for the sky map.
- **Back end:** Python, FastAPI, astropy, reproject, NumPy, Pillow.
- **Hardware:** none beyond a laptop. The app runs in any modern desktop browser with WebGL2.

## Design choices

- **Accessibility.** Keyboard shortcuts for every main action, ARIA labels on controls, high-contrast dark theme, plain-language explanations ("What am I looking at?") next to the data.
- **Cost.** Free to use and to host. The front end is a static site, the five test targets need no server, and the backend only runs when someone asks for a new region.
- **Energy and bandwidth.** We read only the bytes we need from AWS (a cut-out is ~1-2 MB of a 65 MB image; a spectrum is 102 reads of 4 bytes), cache everything, and draw the screen only when something changes.
- **Easy to update.** A new SPHEREx data release is one line in `backend/config.py`.
- **Desktop first.** The tool is built for a mouse, a keyboard and a large screen.

## Run it yourself

You need Node.js 20+ and Python 3.11+.

**Web app**

```bash
cd AstroDevs-FP
npm install
npm run dev          # open http://localhost:5173
```

To use live search, start the backend (below) and run `VITE_API_URL=http://localhost:8010 npm run dev` instead. In PowerShell: `$env:VITE_API_URL="http://localhost:8010"; npm run dev`.

**Backend (optional, for live search)**

```bash
python -m venv .venv
.venv/Scripts/pip install -r backend/requirements.txt     # macOS/Linux: .venv/bin/pip
cd backend
../.venv/Scripts/python -m uvicorn main:app --port 8010
```

**Data**

```bash
.venv/Scripts/python scripts/prebake.py            # real SPHEREx data for the 5 targets (needs IRSA online)
.venv/Scripts/python scripts/prebake.py wise-0855  # just one target
.venv/Scripts/python scripts/make_mock.py          # simulated sample, for development only
```

**Saving IRSA's answers while it is up**

IRSA's search often answers HTTP 502 for a while. These scripts save what works and fill in the rest later:

```bash
.venv/Scripts/python scripts/snapshot_irsa.py   # save the SIA search pages (HTML) for the 5 targets + M31, all collections
.venv/Scripts/python scripts/download_irsa.py   # download a 6' cut-out of every image found (from AWS S3, IRSA as fallback)
.venv/Scripts/python scripts/watch_irsa.py      # check every 10 s; save missing pages and files whenever a service works
.venv/Scripts/python scripts/prebake.py --offline   # rebuild the site's regions from the saved copy, no network needed
```

Everything lands in `data/irsa_snapshot/`: `html/` (raw pages), `index.html` (one page joining them all), `links.csv` (every image with its IRSA, AWS S3 and cut-out URL), `queries.txt`, `manifest.json`, `downloads.json`, `watch_log.csv` (service status over time) and `cutouts/` (not committed: ~370 MB). Full ~65 MB images only with `--full`.

**Publish**

`npm run build` inside `AstroDevs-FP` produces a static site in `dist/`. Host it on Vercel, Netlify or GitHub Pages, not on a newly registered domain: evaluators often sit behind corporate firewalls that block new or uncategorized domains. The backend has a `Dockerfile` for Hugging Face Spaces or Render.

## Project layout

```
AstroDevs-FP/            web app
  src/App.jsx            app state and main flows
  src/components/        navbar, search, sky map, sidebar, timeline, layers, light curve
  src/lib/stage.js       PixiJS workspace (layers, blending, overlays)
  src/lib/               coordinates, data loading, contrast, measurements, GIF
  public/data/           prebaked test targets (frames + meta.json + datapackage.json)
backend/                 Python API and image pipeline
  config.py              all settings (data releases, sizes, limits)
  irsa.py                search IRSA and download cutouts
  imaging.py             clean, reproject, stack, stretch, difference, photometry
  pipeline.py            builds one region folder
  astro.py, targets.py   coordinates, Gaia, motion prediction, test targets
scripts/                 prebake (real data) and make_mock (simulated sample)
docs/                    ARCHITECTURE.md, API.md, SPHEREX_NOTES.md, challenge text and rules
```

## AI Usage & Attribution

We used AI, and we want to be specific about where.

- **Claude Code (Anthropic)** helped write most of the source code (web app, backend, image pipeline and scripts), the documentation, and the simulated development sample. Every file it helped with starts with an `AI-Assisted:` comment.
- **The team** chose the idea, the interface layout and the features, picked the test targets and the processing approach, ran and checked the results, and is responsible for every claim in this project.
- **Synthetic data.** The data shipped in `AstroDevs-FP/public/data/` is real SPHEREx data (`"generated_by_ai": false` in `datapackage.json`). The development-only simulated sample comes from an AI-assisted script (`scripts/make_mock.py`); whenever it is used it is labelled `"generated_by_ai": true` in `meta.json` and `datapackage.json`, and the app shows a visible *Simulated* watermark.
- **No AI-generated images, audio or video** are part of the app. No NASA logos, insignia or mission identifiers are used anywhere in it.

## License

Aladin Lite is released under GPL-3.0, so this project must use a GPL-3.0-compatible license. The team still has to add the license file.
