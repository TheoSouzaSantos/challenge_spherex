# How CosmoSight works

This is the long version of the "How it works" section in the README: what each part does, and why we built it that way. If you only need the data format, see [`API.md`](API.md).

## The idea in one paragraph

Spotting something that moves on the sky is easy for a person if you show them two pictures of the same place, perfectly aligned and with the same brightness, one after the other. The eye catches the one dot that jumps. Almost all the work in CosmoSight goes into making those pictures truly comparable. The rest is a comfortable way to browse them.

## The pieces

```
AstroDevs-FP/  (browser)                    backend/  (Python)                    NASA / ESA
┌───────────────────────────┐   meta.json   ┌──────────────────────────┐   TAP / SIA2   ┌───────────────┐
│ SkyView  (Aladin Lite)    │ ◀──── + PNG ── │ main.py   FastAPI        │ ─────────────▶ │ IRSA SPHEREx  │
│ Workspace (PixiJS stage)  │                │ pipeline.py              │   cutouts      │ images        │
│ Timeline, Layers, Curve   │                │ imaging.py  irsa.py      │ ◀───────────── │               │
│ App.jsx (state + URL)     │                │ astro.py    targets.py   │   TAP          │ ESA Gaia DR3  │
└───────────────────────────┘                └──────────────────────────┘ ─────────────▶ └───────────────┘
        ▲  HiPS tiles (all-sky cube) straight from IRSA
```

The web app can run with no backend at all: the five test targets are prebaked as static files by `scripts/prebake.py`, using exactly the same pipeline. The backend only adds live cut-outs of any other position.

## The pipeline, step by step (`backend/`)

**1. Find the visits** (`irsa.py`). We ask IRSA which SPHEREx images contain the position, the same way IRSA's SPHEREx tutorial does: `Irsa.query_sia(pos=(coord, 1 arcsec), collection=[...])` over the Wide and Deep collections of DR1 and QR3. One search returns all six detectors, so we ask once per region and filter locally. If SIA does not answer we try TAP, and if IRSA is having a bad moment (it often returns a brief 502) we wait and try again. SPHEREx comes back to every part of the sky about every six months, and each visit is several exposures spread over a few days, so `pipeline.group_visits()` groups exposures closer than 30 days into one visit.

**2. Read small cut-outs from AWS** (`s3.py`, `irsa.fetch_cutouts`). Every SPHEREx image is also in NASA's public bucket on AWS, `s3://nasa-irsa-spherex` (us-east-1, no account). The search results tell us each file's S3 key (`cloud_access` column). A full exposure is about 65 MB, but a FITS file can be read in pieces, so we open it on S3 with `astropy` + `fsspec` and read only the rows around the position from IMAGE, FLAGS and ZODI (`.section[...]`), about 1-2 MB. The spectral WCS needs the full-detector lookup table, so the wavelength and bandwidth at the target are worked out on the full image and stored in the cut-out as `SBWL`/`SBBW`. If S3 fails, IRSA's cut-out service is the fallback. Reads run in parallel and are cached on disk. For WISE 0855 the bucket route took 53 s against ~100 s through IRSA, and gave identical photometry.

**3. Clean each exposure** (`imaging.load_exposure`).
- Subtract the ZODI layer that ships with every image. The zodiacal light (sunlight scattered by dust in the solar system) changes with the season, so without this the background would jump between visits taken six months apart.
- Blank out pixels whose quality flags say they are bad. We follow the SPHEREx tutorials and keep only pixels with no flags, or with the harmless "source" and bit-1 flags. Everything else becomes empty (NaN) rather than a fake bright spot.
- Read the wavelength and bandwidth at the target from the image's spectral coordinate system (`key='W'`, with SIP switched off, as the IRSA tutorial explains). SPHEREx uses filters whose color changes across the detector, so the same detector can see a slightly different color from one visit to the next. We show both in the app.

**4. Put every frame on the same grid** (`imaging.make_grid`, `reproject_to`). Each region gets one north-up, east-left grid at SPHEREx's native 6.2″ per pixel, centred on the target where it is during the survey (not where it was in 2016). Every exposure is resampled onto that grid with `reproject_exact`, which conserves flux (the method used in IRSA's mosaic tutorial). This is what keeps the field still, so only real motion shows.

**5. Stack each visit** (`imaging.coadd`). The median of the exposures in a visit. It lowers the noise and removes one-off glitches such as cosmic rays.

What counts as a "visit" needed care. On a normal field, SPHEREx's look at a spot is spread over up to ~55 days (we measured this on the test targets), followed by months of nothing. Near the ecliptic poles (the Deep Survey) it looks almost every day: R Draconis has 394 days of nearly unbroken coverage. So a visit ends at a gap of more than 30 days *or* once it is 60 days long (30 days where a detector has dense, deep-survey coverage), and we keep at most 8 visits per detector, evenly spread in time.

Visits are planned **per detector** (`pipeline.plan_visits`). SPHEREx's six detectors look at different strips of sky at the same moment, so a star is seen by D1 in some weeks and by D3 in others: R Draconis was on D1 in months 1-6 and 14-17 of the mission and on D3 in months 0-1 and 8-13. Each detector gets its own visits, and visits of different detectors less than 30 days apart share a slot on the timeline. The web app then steps and plays only through the dates that have an image in the band on screen, and greys out the others on the timeline.

**6. One brightness scale per band** (`imaging.stretch_limits`). This step is easy to get wrong. We pick one black level (just below the sky) and one white level (the brightest stars, but never closer than 25 noise units to the sky) from all visits together, and apply an asinh stretch, which shows faint and bright things at the same time. If each visit had its own scale, the image would flicker and hide the motion we want to show.

**6b. Saturated stars.** Bright stars (Barnard's Star, RW Aurigae, R Draconis) saturate the detector, and their cores come back flagged. Pixels flagged in every exposure of a visit are written to a separate mask (`*_mask.png`, shown with *Flagged pixels*). For the picture only, we fill them in from their neighbours (`imaging.fill_for_display`), so a saturated core looks like a bright star instead of a black hole, and an isolated dead pixel takes the sky value instead of looking like a new object. Measurements and difference images never use the filled values.

**7. Differences** (`imaging.save_diff`). Each visit minus the first one, in a color scale people can read: blue where something got fainter, orange where it got brighter, black where nothing changed. A star that moved leaves a blue-orange pair.

**8. Predictions** (`astro.propagate`). For the target and for Gaia DR3 stars around it, we move the catalogue position to the date of each visit. Two effects matter:
- *proper motion*: the star's own drift across the sky (Barnard's Star moves about 10″ per year);
- *parallax*: the yearly wobble caused by the Earth going around the Sun (WISE 0855 wobbles by almost half an arcsecond).

The result is drawn as a crosshair. If the dot follows the crosshair, the motion is real.

**9. Photometry** (`imaging.aperture_flux`). The light inside a 2-pixel circle at the predicted position, minus the sky measured in a ring around it (a sigma-clipped mean, so other stars in the ring do not bias it), converted from surface brightness to millijansky with the formula from IRSA's mosaic tutorial: mJy = MJy/sr × 23.5045 × (pixel size in arcsec)² / 1000. It feeds the light curve and works best for the variable stars.

When the target sits on a saturated core (detected as a masked blob *connected* to the target position, so a nearby cosmic ray does not count), we measure a ring just outside the largest core instead, with the same ring in every visit. That underestimates the total flux but follows its changes, which is what a light curve needs. `meta.json` records this in `photometry_mode`.

**10. Write it out** (`pipeline.write_region`). PNG frames, difference frames and a `meta.json` that holds everything else. See [`API.md`](API.md).

## What to expect in the frames

SPHEREx pixels are large (6.2″). Between two visits six months apart, even the fastest targets move less than one pixel: Barnard's Star about 5″, WISE 0855 about 4″. Over the full span of the surveys the motion becomes clear. That is why the app opens the blink on the **first and last** visits, shows the predicted crosshair by default, and offers the difference view. RW Aurigae and R Draconis do not move. They change brightness, so the light curve is the right tool for them.

## Spectra from the all-sky cube (`s3.py`, `src/lib/spectrum.js`)

The bucket also holds the SPHEREx DR1 all-sky cube, `dr1/hips5_cube/hips_20261026/Norder5/DirD/NpixN_cube.fits`: 12,288 HEALPix order-5 tiles, each a FITS file with a 512 × 512 × 102 IMAGE cube in MJy/sr (one plane per band), an NHITS cube (how many exposures went into each value), FLAGS, and the band table. Each tile pixel is a HEALPix order-14 pixel, about 12.9″.

To read the spectrum of a point:
1. Find the tile and the pixel. We compute the HEALPix nested index at order 14 (a port of `healpix_base`'s `loc2xyf`), which gives the tile and the position inside it: column = local iy, row = 511 − local ix. We checked this against each tile's own `RA---HPX` WCS at 30 points across the sky, including the five targets: 30/30.
2. Read the tile header once (a few KB) to find where the IMAGE and NHITS cubes start.
3. Read 102 × 4 bytes for the values and 102 × 4 bytes for the exposure counts with HTTP `Range` requests, 16 at a time.

The bucket allows cross-origin `GET` with `Range`, so the browser does this itself (`src/lib/spectrum.js`): spectra work on the static site, for any point on the sky, with no backend. The Python version (`s3.spectrum`) does the same for `/api/spectrum` and stores the target's spectrum in each prebaked `meta.json`.

## The web app (`AstroDevs-FP/src/`)

- **`App.jsx`** holds all the state in one reducer and runs the main flows: search, cut-out, playback timer, keyboard shortcuts, GIF export. It also writes the state into the URL, so any view can be shared or embedded.
- **`components/SkyView.jsx`** is the sky map (Aladin Lite). One quirk: Aladin Lite 3.8 assumes cube frames are evenly spaced in frequency, but the SPHEREx cube is ordered by wavelength, so asking for "band 8" would load the wrong band. `aladinSlice()` reverses Aladin's formula so the band you pick is the band you get.
- **`lib/stage.js`** is the PixiJS workspace. Each layer is one detector at one date, painted through its own contrast curve and color, and layers are mixed with additive blending, like colored projectors on the same wall. Overlays (crosshair, Gaia stars, tracked path, photometry circle) are drawn on top. It only redraws when something changes.
- **`lib/tone.js`** handles per-layer contrast (black point, white point, midtones) with a 256-entry lookup table on the CPU. The frames are tiny, so it is instant.
- **`lib/measure.js`** finds stars (centroids), follows one through every visit (`trackSource`) and measures brightness in the browser. It first undoes the server's stretch, so the numbers compare visits fairly. They are relative, not calibrated fluxes.
- **`lib/coords.js`** reads coordinates in the formats people actually type, and converts between the region's pixels and the sky.
- **`lib/earth.js`** computes the zenith for "sky from a place on Earth". Addresses go through OpenStreetMap's geocoder.

## When the services are down

IRSA's search and cut-out services go down for hours at a time. `scripts/snapshot_irsa.py` saves the search results, `scripts/download_irsa.py` saves a 6′ cut-out of every image around each search centre, and `scripts/watch_irsa.py` keeps checking every 10 s and fills in whatever is missing. `backend/snapshot.py` indexes that saved copy:

- `irsa.find_exposures` uses the saved search when IRSA's search fails (trying the live one only once if a saved copy exists, so the fallback is quick);
- `irsa.fetch_cutouts` uses the saved cut-out when AWS S3 and IRSA's cut-out service both fail;
- `COSMOSIGHT_OFFLINE=1` (or `prebake.py --offline`) skips the network entirely.

Built offline, WISE 0855 gives the same visits and the same photometry as the online build. The web app ships the regions built this way and, when the API is missing or answers 502/503/504, opens the nearest saved region within 0.5° and tells the user.

## Updating to a new data release

Add the new collection name to the front of `RELEASES` in `backend/config.py`, then run `scripts/prebake.py` again. TAP searches already see new data as soon as IRSA ingests it.

## Known limits

- Saturated stars only get ring ("wings") photometry: good for changes over time, not for absolute brightness.
- IRSA's search can return HTTP 502 for a while. The pipeline retries, but a live request can still fail; prebaked targets always work.
- The reference epoch we use for WISE 0855's position (~2010.5) is an estimate, so its predicted track is approximate.
- Brightness measured by clicking in the browser comes from the displayed frames. It is good for comparing visits, not for science-grade fluxes.
- Live cut-outs depend on IRSA's response time, and the first request for a region can take a minute or more.
