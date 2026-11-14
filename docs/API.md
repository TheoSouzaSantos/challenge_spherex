# Data contract: backend ⇄ web app

The same `meta.json` comes from the prebake (`AstroDevs-FP/public/data/<slug>/meta.json`, frames next to it) and from the live API (`GET /api/region`, frames under `/files/<key>/`, with `"base"` added). Written by `backend/pipeline.py:write_region`, read by `AstroDevs-FP/src/lib/data.js`.

## meta.json

```jsonc
{
  "version": 1,
  "simulated": false,                 // true only for scripts/make_mock.py output -> UI shows a banner
  "generated_by_ai": false,           // true for the synthetic sample (submission-guide rule for AI-made data)
  "slug": "wise-0855", "name": "WISE 0855-0714",
  "ra": 133.7594, "dec": -7.2422,     // region centre (deg), at the survey epoch for moving targets
  "fov_deg": 0.08, "pixscale_arcsec": 6.2, "width": 47, "height": 47,
  "release": "spherex_dr1 + spherex_qr3",
  "generated_utc": "2026-11-14T15:00:00Z",
  "wcs": { "crval": [ra, dec], "crpix": [23, 23], "scale_deg": 0.001722 },  // display TAN: x right = west, y down = south
  "visits": [ { "id": "v1", "mjd": 60810.0, "date": "2025-05-15" } ],       // time-ordered survey visits (~6 months apart)
  "detectors": [
    {
      "det": 6, "wl_range": [4.42, 5.0],
      "stretch": { "fn": "asinh", "vmin": -0.03, "vmax": 0.9 },             // ONE stretch for all visits of this detector
      "diff_ref": "v1", "diff_limit": 0.12,
      "frames": {
        "v1": { "png": "D6_v1.png", "n_exp": 5, "wl_um": 4.71, "bw_um": 0.037, "flag_frac": 0.02,
                "mask": "D6_v1_mask.png", "masked_frac": 0.01 },   // mask only when some pixels are flagged in every exposure
        "v2": { "png": "D6_v2.png", "diff": "D6_v2_diff.png", "n_exp": 4, "wl_um": 4.66, "bw_um": 0.037, "flag_frac": 0.01 }
      }
    }
  ],
  "target": {                         // the requested object (or the region centre, no motion)
    "name": "WISE 0855-0714", "pmra": -8123.7, "pmdec": 673.9, "plx": 439.0, "epoch": 2010.5,
    "source": "…", "px": { "v1": [22.0, 23.1] },                              // predicted display pixel per visit
    "predicted_shift_px": 1.8, "predicted_shift_arcsec": 11.2
  },
  "gaia": [ { "id": "…", "g": 15.2, "pm": 12.3, "plx": 1.1, "px": { "v1": [x, y] } } ],
  "photometry": { "6": { "v1": { "flux": 0.58, "err": 0.06 } } },             // aperture flux at target.px
  "photometry_unit": "mJy",                                                      // MJy/sr x 23.5045 x pixscale^2 / 1000
  "photometry_mode": { "2": "wings: ring 5-8 px around a saturated core" },     // per detector; absent = normal 2 px aperture
  "spectrum": {                      // 102-band spectrum at the region centre, from the all-sky cube on AWS S3
    "ra": 133.76, "dec": -7.24, "unit": "MJy/sr", "tile": 10226, "col": 212, "row": 238, "pixel_arcsec": 12.88,
    "source": "s3://nasa-irsa-spherex/dr1/hips5_cube/hips_20261026",
    "points": [ { "plane": 1, "det": 1, "wl_um": 0.753, "bw_um": 0.018, "value": 0.0845, "nhits": 9 } ]   // value null = no data
  },
  "pixel_sources": { "s3": 0, "irsa": 0, "local": 51 },   // where the cut-outs came from ("local" = data/irsa_snapshot)
  "offline": true,                    // built from the saved copy because IRSA / AWS did not answer
  "notes": []
}
```

Frames:
- `D<det>_<visit>.png`: 8-bit grayscale, north up, east left, per-visit median coadd of (IMAGE − ZODI) with bad flags masked, reprojected onto the shared grid, sky-subtracted, asinh-stretched with the detector's fixed limits. Pixels flagged in every exposure are filled in from their neighbours for display only.
- `D<det>_<visit>_mask.png`: 8-bit, 255 where the coadd had no valid data (saturated cores, dead pixels).
- `D<det>_<visit>_diff.png`: RGB signed difference against `diff_ref` (orange = brighter now, blue = fainter now, black = no change).
- Pixel coordinates: pixel centres at integers, origin top-left.

## Endpoints (`backend/main.py`)

| Endpoint | Returns |
| --- | --- |
| `GET /api/health` | `{ok, releases, detectors, saved_copy: {cutouts, regions}}` |
| `GET /api/targets` | the five test targets |
| `GET /api/resolve?q=` | `{name, ra, dec, pmra, pmdec, plx, epoch, source, ra_now, dec_now}`. Accepts RA/Dec, a test-target name or any SIMBAD name (Sesame). 404 if unknown |
| `GET /api/gaia?ra&dec&radius` | Gaia DR3 sources (epoch 2016.0) |
| `GET /api/spectrum?ra&dec` | 102-band spectrum of any sky position from the all-sky cube on AWS (same shape as `meta.spectrum`). The web app usually reads it directly from S3 in the browser instead |
| `GET /api/region?ra&dec&fov&dets=1,3,5&name=` | meta.json + `base`. Cached on disk by position/FOV/detectors. 503 when IRSA search is down, 404 when SPHEREx has no coverage yet. `fov` 0.02-0.25 deg |
