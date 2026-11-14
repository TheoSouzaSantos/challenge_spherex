# Chosen challenge: 12. Planet X and SPHEREx

Official page: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/
Full text: `docs/challenge-12-en.md` (PT: `docs/desafio-12-pt.md`). Technical notes: `docs/SPHEREX_NOTES.md`. Rules: `docs/rules-and-judging-en.md`.

## Core ask (Objectives)
A **public web tool** where a user enters RA/Dec, and it shows a series of SPHEREx images of that patch of sky **as a short video**, so moving objects are easy to spot. Test on Barnard's Star, Epsilon Indi B, WISE 0855 (08h55m10.831s, -7d14m42.53s), RW Aurigae and R Draconis.

## 24-hour MVP (build order; feature 1 is demoable alone)
1. **Flipbook**: RA/Dec (or name) + FOV input -> time-ordered SPHEREx cutouts (one detector) -> per-visit coadds -> animated loop with fixed stretch. Pre-baked for the 5 test targets as fallback.
2. **Motion aids**: blink/difference (visit N - visit 1), detector selector (D1-D6), shareable URL `?ra=&dec=&fov=&det=`.
3. **Context + science**: Gaia DR3 overlay propagated to image epoch, Aladin Lite context panel, on-the-fly spectrum of the clicked pixel (0.75-5 um), contamination flag view.

## Architecture
- `backend/`: Python FastAPI (astroquery TAP + IRSA cutouts + astropy) -> returns PNG frames + JSON metadata. Release list is a config value (easy update to new data releases). Deploy: Hugging Face Spaces (Docker) or Render.
- `scripts/prebake.py`: same pipeline run offline for the 5 test targets -> `AstroDevs-FP/public/data/<target>/` (the mock that always works).
- `AstroDevs-FP/`: Vite + React + Tailwind viewer, deploy on Vercel.

## Starting data
IRSA SPHEREx DR1 + QR3 (TAP `spherex.plane`/`spherex.artifact`, cutout service). No login, no API key. Gaia DR3 (ESA/VizieR). Optional partner: CSA NEOSSat/CADC.

## Main risk and cut
IRSA cutout latency / few visits per field. Cut: serve pre-baked targets only, live search marked "beta".

## Target award
Best Use of Data (leans on Relevance + Validity); stretch: Galactic Impact (citizen science reach).
