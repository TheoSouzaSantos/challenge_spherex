# CosmoSight web app

The browser side of CosmoSight: the sky map, the region workspace, the timeline and the tools. See the [project README](../README.md) for what the project is and [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for how it works.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve dist/ on http://localhost:4173
npm run lint       # oxlint
```

Live search of any position needs the backend. Point the app at it with `VITE_API_URL`:

```bash
VITE_API_URL=http://localhost:8010 npm run dev
```

Without it, the five prebaked test targets in `public/data/` still work.

## Where things are

| File | What it does |
| --- | --- |
| `src/App.jsx` | All app state (one reducer), search, cut-out, playback, keyboard shortcuts, GIF export, URL sync |
| `src/components/SkyView.jsx` | Whole-sky map with Aladin Lite and the SPHEREx all-sky cube |
| `src/components/Sidebar.jsx` | Tools, workspace, timeline, tracking, light curve, details, explanations |
| `src/components/Workspace.jsx` | Mounts the PixiJS stage and turns the mouse into pan, zoom and clicks |
| `src/components/Timeline.jsx` | Time-lapse / blink / difference, play, speed, period, overlays, GIF |
| `src/components/LayersDrawer.jsx` | The hamburger panel: bands, dates, colors, opacity, contrast, sky background |
| `src/components/SearchPanel.jsx` | Search by name or RA/Dec, and "sky from a place on Earth" |
| `src/lib/stage.js` | The PixiJS workspace: layers with additive blending and overlays |
| `src/lib/data.js` | Loading prebaked or live regions, decoding frames, band names and colors |
| `src/lib/coords.js` | Coordinate parsing and formatting, pixel ↔ sky |
| `src/lib/tone.js` | Per-layer contrast curve and tint |
| `src/lib/measure.js` | Centroids, star tracking and aperture photometry |
| `src/lib/earth.js` | Zenith for a place and time, address lookup |
| `src/lib/gif.js` | Animated GIF export |

## Shareable links

Every view writes its state into the URL, so a link reopens the same thing:

| Parameter | Meaning | Example |
| --- | --- | --- |
| `target` | A test target | `wise-0855`, `barnards-star`, `epsilon-indi-b`, `rw-aurigae`, `r-draconis` |
| `ra`, `dec`, `fov` | Any position, in degrees (FOV 0.02–0.25) | `ra=133.76&dec=-7.24&fov=0.08` |
| `layers` | `band:time:opacity:color`, comma-separated. Time `f` = follow the timeline, or a visit id | `6:v1:1:3d8bff,6:f:1:ffb347` |
| `mode` | `animate`, `blink` or `diff` | `mode=blink` |
| `fps` | Playback speed | `fps=3` |
| `sky`, `slice` | Sky-map background, and SPHEREx band 0–101 | `sky=2mass`, `slice=90` |

## Keyboard

`space` play/pause · `←` `→` step · `B` blink · `D` difference · `A` time-lapse · `C` cut out · `T` track · `L` layers · `/` search · `[` `]` speed · `1`–`6` band of the top layer · `Esc` close
