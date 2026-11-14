# AI-Assisted: coordinate parsing, name lookup and motion propagation generated with Claude Code (Anthropic) and reviewed by the team.
"""Small astronomy helpers: reading coordinates, looking up names and predicting positions.

The most important function is propagate(). Stars catalogued in 2016 are not in the same
place in 2026: nearby ones drift (proper motion) and wobble once a year as the Earth goes
around the Sun (parallax). propagate() moves a catalogue position to the exact date of each
SPHEREx visit, which is what lets the app draw "this is where the star should be" and lets
people check that a moving dot is real.
"""
import csv
import io
import re

import numpy as np
import requests
import astropy.units as u
from astropy.coordinates import SkyCoord, get_body_barycentric
from astropy.time import Time

from config import SESAME_URLS, GAIA_TAP, GAIA_GMAX, GAIA_LIMIT, HTTP_TIMEOUT
from targets import find_target

AU_PER_PC = 206264.806


def parse_coords(text):
    """'08h55m10.831s -7d14m42.53s', '08:55:10.8 -07:14:42.5' or '133.795 -7.245' -> (ra_deg, dec_deg)."""
    s = text.strip().replace(",", " ")
    parts = s.split()
    if len(parts) == 2:
        try:
            ra, dec = float(parts[0]), float(parts[1])
            return _check(ra % 360.0, dec)
        except ValueError:
            pass
    try:
        c = SkyCoord(s, unit=(u.hourangle, u.deg))
        return _check(c.ra.deg, c.dec.deg)
    except Exception:
        return None


def _check(ra, dec):
    if not -90.0 <= dec <= 90.0:
        return None
    return float(ra), float(dec)


def resolve(text):
    """Coordinates, a test-target name, or any SIMBAD name (via Sesame). Returns dict or None."""
    xy = parse_coords(text)
    if xy:
        return {"name": None, "ra": xy[0], "dec": xy[1], "pmra": 0.0, "pmdec": 0.0, "plx": 0.0,
                "epoch": 2016.0, "source": "coordinates"}
    t = find_target(text)
    if t:
        return {k: t[k] for k in ("name", "ra", "dec", "pmra", "pmdec", "plx", "epoch", "source", "slug")}
    for base in SESAME_URLS:
        try:
            r = requests.get(base + requests.utils.quote(text), timeout=20)
            out = _parse_sesame(r.text)
            if out:
                out["name"] = text
                return out
        except requests.RequestException:
            continue
    return None


def _parse_sesame(txt):
    ra = dec = None
    pmra = pmdec = plx = 0.0
    for line in txt.splitlines():
        if line.startswith("%J ") and ra is None:
            f = line.split()
            ra, dec = float(f[1]), float(f[2])
        elif line.startswith("%P "):
            f = line.split()
            pmra, pmdec = float(f[1]), float(f[2])
        elif line.startswith("%X "):
            plx = float(line.split()[1])
    if ra is None:
        return None
    # SIMBAD positions are given at epoch J2000.
    return {"ra": ra, "dec": dec, "pmra": pmra, "pmdec": pmdec, "plx": plx, "epoch": 2000.0, "source": "SIMBAD via Sesame"}


def propagate(ra, dec, pmra, pmdec, plx, epoch, mjds):
    """Apparent ICRS position seen from Earth at each MJD: linear proper motion + annual parallax.

    pmra is mu_alpha*cos(dec) in mas/yr, plx in mas. Returns (ra_deg[], dec_deg[]).
    """
    mjds = np.atleast_1d(np.asarray(mjds, dtype=float))
    t = Time(mjds, format="mjd")
    dt = (t - Time(epoch, format="jyear")).to(u.yr).value
    dec_t = dec + pmdec * dt / 3.6e6
    ra_t = ra + pmra * dt / 3.6e6 / np.cos(np.radians(dec))
    if plx and plx > 0:
        d_au = AU_PER_PC / (plx / 1000.0)
        a, b = np.radians(ra_t), np.radians(dec_t)
        star = d_au * np.vstack([np.cos(b) * np.cos(a), np.cos(b) * np.sin(a), np.sin(b)])
        earth = get_body_barycentric("earth", t).xyz.to(u.au).value
        v = star - earth
        ra_t = np.degrees(np.arctan2(v[1], v[0])) % 360.0
        dec_t = np.degrees(np.arcsin(v[2] / np.linalg.norm(v, axis=0)))
    return ra_t, dec_t


def gaia_cone(ra, dec, radius_deg, gmax=GAIA_GMAX, limit=GAIA_LIMIT):
    """Gaia DR3 sources (epoch 2016.0) around a position, brightest first. Empty list on failure."""
    q = (f"SELECT TOP {int(limit)} source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag "
         f"FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec),CIRCLE({ra},{dec},{radius_deg})) "
         f"AND phot_g_mean_mag < {gmax} ORDER BY phot_g_mean_mag")
    try:
        r = requests.get(GAIA_TAP, params={"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": q},
                         timeout=HTTP_TIMEOUT)
        r.raise_for_status()
    except requests.RequestException:
        return []
    rows = []
    for row in csv.DictReader(io.StringIO(r.text)):
        f = lambda k: float(row[k]) if row.get(k) not in (None, "") else 0.0
        rows.append({"id": row["source_id"], "ra": f("ra"), "dec": f("dec"), "pmra": f("pmra"),
                     "pmdec": f("pmdec"), "plx": f("parallax"), "g": f("phot_g_mean_mag")})
    return rows


def mjd_to_date(mjd):
    return Time(mjd, format="mjd").to_datetime().strftime("%Y-%m-%d")


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "region"


SURVEY_MID_MJD = 61100.0  # ~Feb 2026, middle of the first SPHEREx surveys


def current_position(t, mjd=SURVEY_MID_MJD):
    """Where a moving target is during the SPHEREx surveys (cutouts must be centred there, not at epoch 2016)."""
    ra, dec = propagate(t["ra"], t["dec"], t["pmra"], t["pmdec"], t["plx"], t["epoch"], [mjd])
    return float(ra[0]), float(dec[0])
