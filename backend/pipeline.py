# AI-Assisted: the region pipeline generated with Claude Code (Anthropic) and reviewed by the team.
"""Glue between the archive and the app: one sky position in, one folder of frames out.

build_region() searches IRSA, groups exposures into survey visits (SPHEREx comes back to
the same spot about every six months), downloads the cutouts and coadds them.
write_region() renders the PNG frames, the difference images, the predicted positions,
the Gaia overlay and the photometry, and writes meta.json next to them.

The live API and the offline prebake call exactly the same code, so what you see for the
test targets is what you get for any other position. The meta.json format is described
in docs/API.md.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import imaging
from astro import gaia_cone, mjd_to_date, propagate
from config import (DETECTORS, FOV_MAX_DEG, FOV_MIN_DEG, MAX_EXP_PER_VISIT, MAX_VISITS, PIXSCALE_ARCSEC,
                    RELEASES, VISIT_GAP_DAYS, VISIT_MAX_SPAN_DAYS)
import s3
from irsa import fetch_cutouts, find_exposures


class NoData(RuntimeError):
    pass


def _spread(items, k):
    if len(items) <= k:
        return list(items)
    idx = np.unique(np.round(np.linspace(0, len(items) - 1, k)).astype(int))
    return [items[i] for i in idx]


def group_visits(rows, gap_days=VISIT_GAP_DAYS, max_span=VISIT_MAX_SPAN_DAYS):
    """Split time-ordered exposures into visits: a new visit starts after a gap, or when the current one
    would get longer than max_span days (continuous coverage near the ecliptic poles)."""
    rows = sorted(rows, key=lambda r: r["mjd"])
    groups = []
    for r in rows:
        if (groups and r["mjd"] - groups[-1][-1]["mjd"] <= gap_days
                and r["mjd"] - groups[-1][0]["mjd"] <= max_span):
            groups[-1].append(r)
        else:
            groups.append([r])
    return groups


def _sky_spectrum(ra, dec, log):
    """102-band spectrum at the region centre from the all-sky cube on AWS (None if S3 is unreachable)."""
    try:
        return s3.spectrum(ra, dec)
    except Exception as e:  # noqa: BLE001 - the spectrum is a bonus, never block a region on it
        log(f"  spectrum skipped: {e}")
        return None


def plan_visits(rows, dets):
    """Time-ordered visits as [{det: [exposures]}], planned PER DETECTOR and then lined up.

    SPHEREx's detectors look at different strips of sky at the same moment, so a given star is seen by
    D1 in some weeks and by D3 in others (R Draconis: D1 in months 1-6 and 14-17, D3 in months 0-1
    and 8-13). Grouping all detectors together left many visits with no image in the band on screen.
    Instead each detector gets its own visits (up to MAX_VISITS), and visits of different detectors
    whose middles are within VISIT_GAP_DAYS share one slot on the timeline.
    """
    windows = []
    for det in dets:
        mine = [r for r in rows if r["det"] == det]
        # Deep-survey coverage (near the ecliptic poles SPHEREx looks almost every day): data in 12 or more
        # different 10-day stretches. There, cut a visit at 30 days so a variable star gets more points.
        dense = len({int(r["mjd"] // 10) for r in mine}) >= 12
        for g in _spread(group_visits(mine, max_span=30 if dense else VISIT_MAX_SPAN_DAYS), MAX_VISITS):
            windows.append((float(np.mean([r["mjd"] for r in g])), det, g))
    windows.sort(key=lambda w: w[0])
    clusters = []
    for mid, det, g in windows:
        last = clusters[-1] if clusters else None
        if last and mid - last["mid"] <= VISIT_GAP_DAYS and det not in last["dets"]:
            last["dets"][det] = g
            last["mid"] = float(np.mean([m for m in last["mids"] + [mid]]))
            last["mids"].append(mid)
        else:
            clusters.append({"mid": mid, "mids": [mid], "dets": {det: g}})
    return [c["dets"] for c in clusters]


def build_region(ra, dec, fov, dets, out_dir, name=None, slug=None, target=None, log=print):
    fov = float(np.clip(fov, FOV_MIN_DEG, FOV_MAX_DEG))
    grid, shape = imaging.make_grid(ra, dec, fov, PIXSCALE_ARCSEC)

    rows = find_exposures(ra, dec, dets)   # one IRSA search for all detectors
    for det in dets:
        log(f"  D{det}: {sum(r['det'] == det for r in rows)} exposures")
    if not rows:
        raise NoData("No SPHEREx exposures cover this position yet.")

    visits, jobs = [], []
    for i, cluster in enumerate(plan_visits(rows, dets)):
        vid = f"v{i + 1}"
        visits.append({"id": vid, "mjd": round(float(np.mean([r["mjd"] for g in cluster.values() for r in g])), 4)})
        for det, g in cluster.items():
            for r in _spread(g, MAX_EXP_PER_VISIT):
                jobs.append((det, vid, (r, ra, dec, fov * 1.3)))
    log(f"  {len(visits)} visits, fetching {len(jobs)} cut-outs")
    sources = {}
    paths = fetch_cutouts([j[2] for j in jobs], log=log, stats=sources)
    searched_offline = any(r.get("local") for r in rows)

    stacks = {}
    for (det, vid, _), p in zip(jobs, paths):
        if p is None:
            continue
        try:
            exp = imaging.load_exposure(p, ra, dec)
        except Exception as e:  # noqa: BLE001 - one broken file must not kill the region
            log(f"  skip {p.name}: {e}")
            continue
        s = stacks.setdefault((det, vid), {"imgs": [], "wl": [], "bw": [], "flag": []})
        s["imgs"].append(imaging.subtract_sky(imaging.reproject_to(exp, grid, shape)))
        s["flag"].append(exp["flag_frac"])
        if exp["wl_um"]:
            s["wl"].append(exp["wl_um"])
        if exp["bw_um"]:
            s["bw"].append(exp["bw_um"])

    frames = {}
    for (det, vid), s in stacks.items():
        frames.setdefault(det, {})[vid] = {
            "img": imaging.coadd(s["imgs"]),
            "n_exp": len(s["imgs"]),
            "wl_um": round(float(np.median(s["wl"])), 3) if s["wl"] else None,
            "bw_um": round(float(np.median(s["bw"])), 4) if s["bw"] else None,
            "flag_frac": round(float(np.mean(s["flag"])), 4),
        }
    if not frames:
        raise NoData("Cutouts could not be downloaded or read.")

    meta = write_region(out_dir, name=name or f"RA {ra:.4f} Dec {dec:+.4f}", slug=slug, ra=ra, dec=dec, fov=fov,
                        grid=grid, shape=shape, visits=visits, frames=frames, target=target,
                        simulated=False, release=" + ".join(RELEASES), log=log)
    # Where the pixels came from, so the app can say "offline copy" honestly.
    meta["pixel_sources"] = sources
    meta["offline"] = searched_offline or (sources.get("local", 0) > 0 and not sources.get("s3") and not sources.get("irsa"))
    (Path(out_dir) / "meta.json").write_text(json.dumps(meta, indent=1))
    return meta


def write_region(out_dir, *, name, slug, ra, dec, fov, grid, shape, visits, frames, target, simulated, release,
                 notes=None, log=print):
    """Render frames + metadata. `frames` = {det: {visit_id: {img, n_exp, wl_um, flag_frac}}} (float images)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ny, nx = shape
    for v in visits:
        v["date"] = mjd_to_date(v["mjd"])
    mjds = [v["mjd"] for v in visits]

    def to_disp(ra_arr, dec_arr):
        x, y = grid.world_to_pixel_values(ra_arr, dec_arr)
        return np.asarray(x), np.asarray(y)

    # target track (or a fixed centre for a plain region)
    t = target or {"name": name, "ra": ra, "dec": dec, "pmra": 0.0, "pmdec": 0.0, "plx": 0.0, "epoch": 2016.0,
                   "source": "requested position"}
    tra, tdec = propagate(t["ra"], t["dec"], t["pmra"], t["pmdec"], t["plx"], t["epoch"], mjds)
    tx, ty = to_disp(tra, tdec)
    target_px = {v["id"]: [round(float(tx[i]), 2), round(float(ny - 1 - ty[i]), 2)] for i, v in enumerate(visits)}

    detectors, photometry, phot_modes = [], {}, {}
    for det in sorted(frames):
        fr = frames[det]
        vmin, vmax = imaging.stretch_limits([f["img"] for f in fr.values()])
        first = next((v["id"] for v in visits if v["id"] in fr), None)
        diffs = {vid: fr[vid]["img"] - fr[first]["img"] for vid in fr if vid != first}
        lim = imaging.diff_limit(list(diffs.values())) if diffs else 1.0
        # Saturated target? Then measure the PSF wings in a ring outside the largest masked core,
        # with the same ring in every visit so the light curve stays comparable.
        idx = {v["id"]: i for i, v in enumerate(visits)}
        core = max(imaging.masked_core_radius(fr[vid]["img"], tx[idx[vid]], ty[idx[vid]]) for vid in fr)
        ring = core >= imaging.PHOT_R_AP
        phot_kw = ({"r_min": core + 1, "r": core + 4, "r_in": core + 7, "r_out": core + 11} if ring else {})
        if ring:
            phot_modes[str(det)] = f"wings: ring {core + 1:.0f}-{core + 4:.0f} px around a saturated core"
        entry = {}
        for i, v in enumerate(visits):
            vid = v["id"]
            if vid not in fr:
                continue
            f = fr[vid]
            png = f"D{det}_{vid}.png"
            imaging.save_gray(imaging.fill_for_display(f["img"]), vmin, vmax, out / png)
            e = {"png": png, "n_exp": f["n_exp"], "wl_um": f["wl_um"], "bw_um": f.get("bw_um"),
                 "flag_frac": f["flag_frac"]}
            masked = ~np.isfinite(f["img"])
            if masked.any():
                e["mask"] = f"D{det}_{vid}_mask.png"
                e["masked_frac"] = round(float(masked.mean()), 4)
                imaging.save_mask(masked, out / e["mask"])
            if vid in diffs:
                e["diff"] = f"D{det}_{vid}_diff.png"
                imaging.save_diff(diffs[vid], lim, out / e["diff"])
            entry[vid] = e
            flux, err = imaging.aperture_flux(f["img"], tx[i], ty[i], PIXSCALE_ARCSEC, **phot_kw)
            if flux is not None:
                photometry.setdefault(str(det), {})[vid] = {"flux": round(flux, 4), "err": round(err, 4)}
        detectors.append({"det": det, "wl_range": list(DETECTORS[det]),
                          "stretch": {"fn": "asinh", "vmin": round(vmin, 5), "vmax": round(vmax, 5)},
                          "diff_ref": first, "diff_limit": round(lim, 5), "frames": entry})

    gaia = []
    for s in gaia_cone(ra, dec, fov * 0.75):
        sra, sdec = propagate(s["ra"], s["dec"], s["pmra"], s["pmdec"], s["plx"], 2016.0, mjds)
        gx, gy = to_disp(sra, sdec)
        px = {v["id"]: [round(float(gx[i]), 2), round(float(ny - 1 - gy[i]), 2)] for i, v in enumerate(visits)}
        if any(-2 <= p[0] <= nx + 1 and -2 <= p[1] <= ny + 1 for p in px.values()):
            gaia.append({"id": s["id"], "g": round(s["g"], 2), "pm": round(float(np.hypot(s["pmra"], s["pmdec"])), 1),
                         "plx": round(s["plx"], 2), "px": px})

    shift = np.hypot(tx[-1] - tx[0], ty[-1] - ty[0]) if len(visits) > 1 else 0.0
    meta = {
        "version": 1,
        "simulated": simulated,
        "generated_by_ai": simulated,   # synthetic sample made by an AI-assisted script (submission guide rule)
        "slug": slug,
        "name": name,
        "ra": ra, "dec": dec, "fov_deg": fov,
        "pixscale_arcsec": PIXSCALE_ARCSEC,
        "width": nx, "height": ny,
        "release": release,
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "wcs": {"crval": [ra, dec], "crpix": [(nx - 1) / 2.0, (ny - 1) / 2.0], "scale_deg": PIXSCALE_ARCSEC / 3600.0},
        "visits": visits,
        "detectors": detectors,
        "target": {"name": t.get("name") or name, "pmra": t["pmra"], "pmdec": t["pmdec"], "plx": t["plx"],
                   "epoch": t["epoch"], "source": t["source"], "px": target_px,
                   "predicted_shift_px": round(float(shift), 2),
                   "predicted_shift_arcsec": round(float(shift) * PIXSCALE_ARCSEC, 2)},
        "gaia": gaia,
        "photometry": photometry,
        "photometry_unit": "mJy",
        "photometry_mode": phot_modes,   # per detector; missing = normal 2 px aperture
        "spectrum": _sky_spectrum(ra, dec, log),
        "notes": notes or [],
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    log(f"  wrote {out} ({len(detectors)} detectors, {len(visits)} visits, {len(gaia)} Gaia stars)")
    return meta
