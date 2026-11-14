# AI-Assisted: the simulated-sample generator generated with Claude Code (Anthropic) and reviewed by the team.
"""A SIMULATED sample so the interface can be built and tested while IRSA is down.

This is not SPHEREx data. It takes the real Gaia DR3 stars around each target, moves them to
plausible SPHEREx visit dates, and draws them with a simple blur and some noise. It goes
through the same write_region() as the real pipeline, so the app cannot tell the difference
in format - which is why every file it writes says "simulated": true and
"generated_by_ai": true, and the app shows a visible "Simulated" watermark.

Replace it with real data by running scripts/prebake.py.
"""
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import imaging  # noqa: E402
from astro import current_position, gaia_cone, propagate  # noqa: E402
from config import FOV_DEFAULT_DEG, PIXSCALE_ARCSEC  # noqa: E402
from pipeline import write_region  # noqa: E402
from prebake import DATA, write_index  # noqa: E402
from targets import TARGETS  # noqa: E402

# ~6-month survey cadence since May 2025 (MJD)
VISIT_MJD = [60810.0, 60993.0, 61172.0, 61352.0]
STAR_COLOR = [1.0, 1.1, 0.9, 0.55, 0.4, 0.33]              # generic star, D1..D6
TARGET_COLOR = {
    "wise-0855": [0.0, 0.004, 0.01, 0.25, 1.0, 1.25],       # coldest brown dwarf: only at long wavelengths
    "epsilon-indi-b": [0.02, 0.25, 0.6, 0.45, 0.9, 0.85],
    "barnards-star": [1.0, 1.4, 1.2, 0.6, 0.45, 0.35],
}
TARGET_G_EQUIV = {"wise-0855": 11.0, "epsilon-indi-b": 10.5}  # IR-bright equivalents for objects faint in Gaia G
VARIABILITY = {"rw-aurigae": [1.0, 0.55, 1.35, 0.8], "r-draconis": [1.0, 0.22, 0.85, 0.3]}


def psf(shape, x, y, flux, sigma=0.85):
    yy, xx = np.indices(shape)
    return flux / (2 * np.pi * sigma ** 2) * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma ** 2))


def main():
    rng = np.random.default_rng(42)
    for t in TARGETS:
        print(f"== {t['name']} (simulated)")
        fov = FOV_DEFAULT_DEG
        cra, cdec = current_position(t)
        grid, shape = imaging.make_grid(cra, cdec, fov, PIXSCALE_ARCSEC)
        stars = gaia_cone(cra, cdec, fov * 0.8, gmax=19.0)
        print(f"  {len(stars)} Gaia stars")
        visits = [{"id": f"v{i + 1}", "mjd": m} for i, m in enumerate(VISIT_MJD)]
        tra, tdec = propagate(t["ra"], t["dec"], t["pmra"], t["pmdec"], t["plx"], t["epoch"], VISIT_MJD)
        frames = {}
        for det in t["dets"]:
            frames[det] = {}
            for i, v in enumerate(visits):
                img = rng.normal(0, 0.02, shape).astype(np.float32)
                for s in stars:
                    if abs(s["ra"] - t["ra"]) * np.cos(np.radians(t["dec"])) < 3 / 3600 and abs(s["dec"] - t["dec"]) < 3 / 3600:
                        continue  # the target itself is injected below
                    sra, sdec = propagate(s["ra"], s["dec"], s["pmra"], s["pmdec"], s["plx"], 2016.0, [v["mjd"]])
                    x, y = grid.world_to_pixel_values(sra[0], sdec[0])
                    img += psf(shape, x, y, 10 ** (-0.4 * (s["g"] - 12)) * STAR_COLOR[det - 1])
                g = TARGET_G_EQUIV.get(t["slug"], 9.0 if t["slug"] != "rw-aurigae" else 11.0)
                color = TARGET_COLOR.get(t["slug"], STAR_COLOR)[det - 1]
                var = VARIABILITY.get(t["slug"], [1.0] * 4)[i]
                x, y = grid.world_to_pixel_values(tra[i], tdec[i])
                img += psf(shape, x, y, 10 ** (-0.4 * (g - 12)) * color * var)
                # a few flagged pixels, like real data
                bad = rng.random(shape) < 0.01
                img[bad] = np.nan
                frames[det][v["id"]] = {"img": img, "n_exp": 4, "wl_um": None, "flag_frac": float(bad.mean())}
        write_region(DATA / t["slug"], name=t["name"], slug=t["slug"], ra=cra, dec=cdec, fov=fov,
                     grid=grid, shape=shape, visits=visits, frames=frames, target=t, simulated=True,
                     release="SIMULATED (Gaia DR3 star field) - not SPHEREx data",
                     notes=["Simulated sample for development: IRSA SPHEREx search was unavailable (HTTP 502) "
                            "on 2026-11-14. Replace with: python scripts/prebake.py"])
    write_index()


if __name__ == "__main__":
    main()
