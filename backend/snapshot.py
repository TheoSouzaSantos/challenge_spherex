# AI-Assisted: the offline snapshot index generated with Claude Code (Anthropic) and reviewed by the team.
"""The saved copy of IRSA's answers (data/irsa_snapshot), used when the live services do not answer.

scripts/snapshot_irsa.py saved the search results (links.csv) and scripts/download_irsa.py saved a
6' cut-out of every image around each search centre (cutouts/). This module lets the pipeline use them:

- search_near(ra, dec, dets): the saved search results for a position, when IRSA's search is down;
- local_cutout(s3_key):        the saved cut-out of one image, when AWS S3 and IRSA's cut-outs are down.

A saved cut-out is centred on its search centre, so it only helps for regions near one of those centres
(the five test targets and M31 today). Add more with snapshot_irsa.py --pos and download_irsa.py.
"""
import csv
import json
import math
from functools import lru_cache

from config import ROOT

SNAP = ROOT.parent / "data" / "irsa_snapshot"
CUTOUT_HALF_DEG = 0.05      # download_irsa.py saves 0.1 deg (6') cut-outs
NEAR_DEG = 0.02             # a region counts as "at" a saved centre if it is this close (1.2')


@lru_cache(maxsize=1)
def _index():
    """(rows from links.csv that have a saved cut-out, {s3_key: path})."""
    links, state = SNAP / "links.csv", SNAP / "downloads.json"
    if not links.exists() or not state.exists():
        return [], {}
    st = json.loads(state.read_text())
    rows, files = [], {}
    with open(links, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            s = st.get(f"cut|{r['query']}|{r['s3_key']}", {})
            if s.get("status") != "ok" or not s.get("file"):
                continue
            path = SNAP / s["file"]
            if not path.exists():
                continue
            files[r["s3_key"]] = path
            rows.append(r)
    return rows, files


def available():
    rows, _ = _index()
    centres = sorted({(r["query"], round(float(r["center_ra"]), 5), round(float(r["center_dec"]), 5)) for r in rows})
    return {"cutouts": len(rows), "regions": [{"name": q, "ra": a, "dec": d} for q, a, d in centres]}


def _sep(ra1, dec1, ra2, dec2):
    r = math.radians
    a = math.sin(r(dec2 - dec1) / 2) ** 2 + math.cos(r(dec1)) * math.cos(r(dec2)) * math.sin(r(ra2 - ra1) / 2) ** 2
    return math.degrees(2 * math.asin(min(1.0, math.sqrt(a))))


def search_near(ra, dec, dets, max_sep=NEAR_DEG):
    """Saved search results (same shape as irsa.find_exposures rows) for a position near a saved centre."""
    rows, files = _index()
    out, seen = [], set()
    for r in rows:
        det = int(r["detector"].lstrip("D"))
        if det not in dets or r["s3_key"] in seen:
            continue
        if _sep(ra, dec, float(r["center_ra"]), float(r["center_dec"])) > max_sep:
            continue
        seen.add(r["s3_key"])
        out.append({"url": r["irsa_url"], "mjd": float(r["t_min_mjd"]), "det": det, "key": r["s3_key"],
                    "local": str(files[r["s3_key"]]), "collection": r["collection"]})
    return out


def local_cutout(key):
    """Path of the saved cut-out for this S3 key, or None."""
    return _index()[1].get(key)
