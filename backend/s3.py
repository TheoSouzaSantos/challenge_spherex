# AI-Assisted: the AWS S3 data access generated with Claude Code (Anthropic) and reviewed by the team.
"""Read SPHEREx straight from NASA's public bucket on AWS: s3://nasa-irsa-spherex (us-east-1, no account needed).

Two things come from here:

1. Cut-outs of the Level 2 spectral images (dr1/level2, qr3/level2). A full image is ~65 MB, but FITS
   lets us read just the rows we need, so a few-arcminute cut-out costs about 1-2 MB of transfer. This is
   the "cloud access" route from IRSA's tutorials; IRSA's own cut-out service is the fallback.

2. Spectra of any point on the sky from the all-sky cube (dr1/hips5_cube). Each order-5 HEALPix tile is a
   512 x 512 x 102 cube (one plane per SPHEREx band). One pixel's spectrum is 102 tiny reads of 4 bytes.

The bucket does not tell us which images cover a position, so IRSA's search (SIA/TAP) is still used to
find the files; every search result carries the S3 key in its `cloud_access` column.
"""
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS

# The spectral WCS 'W' logs an "inconsistent SIP" INFO every time; IRSA's tutorial says that is expected.
from astropy import log as _astropy_log  # noqa: E402
_astropy_log.setLevel("WARNING")

from config import HIPS_CUBE_PREFIX, PIXSCALE_ARCSEC, S3_BUCKET, S3_HTTPS, SEARCH_TIMEOUT

# ---------------------------------------------------------------- Level 2 cut-outs


def key_for(row):
    """S3 key of a search result: from the `cloud_access` JSON, or derived from the IRSA URL."""
    ca = row.get("cloud_access")
    if ca:
        try:
            aws = json.loads(ca).get("aws", {})
            if aws.get("bucket_name") == S3_BUCKET and aws.get("key"):
                return aws["key"]
        except (ValueError, AttributeError):
            pass
    m = re.search(r"/data/spherex/((?:dr|qr)\d+/level2/.+\.fits)", row.get("url", ""))
    return m.group(1) if m else None


def cutout(key, ra, dec, size_deg, path):
    """Write a small SPHEREx-like MEF (IMAGE, FLAGS, ZODI) around (ra, dec) read from S3. Returns path or None.

    The spatial WCS is kept (CRPIX shifted; SIP terms stay valid because they are relative to CRPIX).
    The spectral WCS needs the full-detector lookup table, so we evaluate wavelength and bandwidth at
    the target here and store them as SBWL / SBBW keywords for imaging.load_exposure().
    """
    half = int(math.ceil(size_deg * 3600 / PIXSCALE_ARCSEC / 2)) + 2
    opts = {"anon": True, "default_block_size": 256 * 1024}
    with fits.open(f"s3://{S3_BUCKET}/{key}", use_fsspec=True, fsspec_kwargs=opts) as h:
        hdr = h["IMAGE"].header
        w = WCS(hdr, fobj=h).celestial
        x, y = w.all_world2pix([[ra, dec]], 0)[0]
        ny, nx = hdr["NAXIS2"], hdr["NAXIS1"]
        if not (0 <= x < nx and 0 <= y < ny):
            return None
        x0, x1 = max(0, int(x) - half), min(nx, int(x) + half + 1)
        y0, y1 = max(0, int(y) - half), min(ny, int(y) + half + 1)
        img = h["IMAGE"].section[y0:y1, x0:x1]
        flags = h["FLAGS"].section[y0:y1, x0:x1]
        zodi = h["ZODI"].section[y0:y1, x0:x1]
        wl = bw = None
        try:
            sw = WCS(header=hdr, fobj=h, key="W")
            sw.sip = None
            vals = sw.pixel_to_world_values(x, y)
            wl, bw = float(np.ravel(vals[0])[0]), float(np.ravel(vals[1])[0])
        except Exception:  # noqa: BLE001 - wavelength is optional metadata
            pass
        flags_hdr = h["FLAGS"].header

    out = w.to_header(relax=True)
    out["CRPIX1"] -= x0
    out["CRPIX2"] -= y0
    for k in ("BUNIT", "MJD-AVG", "MJD-OBS", "DATE-OBS", "DETECTOR"):
        if k in hdr:
            out[k] = hdr[k]
    if wl and 0.5 < wl < 5.5:
        out["SBWL"] = (round(wl, 4), "[um] wavelength at the cut-out target (spectral WCS W)")
    if bw and 0 < bw < 1:
        out["SBBW"] = (round(bw, 5), "[um] bandwidth at the cut-out target")
    out["S3KEY"] = key[-68:]
    fh = fits.Header([c for c in flags_hdr.cards if c.keyword.startswith(("MSKN", "MSKD"))])
    fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(np.asarray(img, np.float32), out, name="IMAGE"),
        fits.ImageHDU(np.asarray(flags, np.int32), out + fh, name="FLAGS"),
        fits.ImageHDU(np.asarray(zodi, np.float32), out, name="ZODI"),
    ]).writeto(path, overwrite=True)
    return path


# ---------------------------------------------------------------- all-sky cube spectra

ORDER = 5             # tile order of the cube
SUB = 9               # 512 = 2**9 pixels per tile side -> pixels are HEALPix order 14
NSIDE = 2 ** (ORDER + SUB)


def _xyf(theta, phi):
    """HEALPix (theta, phi) -> (face, ix, iy) in the nested scheme (port of healpix_base loc2xyf)."""
    z = math.cos(theta)
    za = abs(z)
    tt = (phi % (2 * math.pi)) * 2 / math.pi
    if za <= 2 / 3:
        t1, t2 = NSIDE * (0.5 + tt), NSIDE * z * 0.75
        jp, jm = int(math.floor(t1 - t2)), int(math.floor(t1 + t2))
        ifp, ifm = jp // NSIDE, jm // NSIDE
        face = (ifp | 4) if ifp == ifm else (ifp if ifp < ifm else ifm + 8)
        return face, jm & (NSIDE - 1), NSIDE - (jp & (NSIDE - 1)) - 1
    ntt = min(3, int(math.floor(tt)))
    tp = tt - ntt
    tmp = NSIDE * math.sqrt(3 * (1 - za))
    jp = min(NSIDE - 1, int(math.floor(tp * tmp)))
    jm = min(NSIDE - 1, int(math.floor((1 - tp) * tmp)))
    if z >= 0:
        return ntt, NSIDE - jm - 1, NSIDE - jp - 1
    return ntt + 8, jp, jm


def _spread(v):
    out = 0
    for b in range(16):
        out |= ((v >> b) & 1) << (2 * b)
    return out


def locate(ra, dec):
    """Which cube tile holds (ra, dec), and which column/row inside it.

    Checked on 2026-11-14 against each tile's own RA---HPX WCS at 30 points across the sky (30/30):
    column = local iy, row = 511 - local ix.
    """
    face, ix, iy = _xyf(math.radians(90 - dec), math.radians(ra))
    tile = face * 4 ** ORDER + (_spread(ix >> SUB) | (_spread(iy >> SUB) << 1))
    side = 2 ** SUB
    return tile, iy & (side - 1), side - 1 - (ix & (side - 1))


def tile_url(tile):
    return f"{S3_HTTPS}{HIPS_CUBE_PREFIX}/Norder{ORDER}/Dir{tile // 10000 * 10000}/Npix{tile}_cube.fits"


def _get(url, a, b):
    r = requests.get(url, headers={"Range": f"bytes={a}-{b - 1}"}, timeout=SEARCH_TIMEOUT)
    r.raise_for_status()
    return r.content


def _header_at(url, offset):
    """Parse one FITS header starting at `offset`; returns (cards dict, data offset)."""
    cards, pos = {}, offset
    while True:
        blk = _get(url, pos, pos + 2880).decode("ascii", "replace")
        pos += 2880
        for i in range(0, 2880, 80):
            c = blk[i:i + 80]
            if c.startswith("END"):
                return cards, pos
            if c[8:10] == "= ":
                cards[c[:8].strip()] = c[10:].split("/")[0].strip().strip("'").strip()


@lru_cache(maxsize=256)
def _layout(tile):
    """Byte offsets of the IMAGE and NHITS cubes in a tile, plus the wavelength table (cached per tile)."""
    url = tile_url(tile)
    _, off = _header_at(url, 0)                 # primary (no data)
    img, img_off = _header_at(url, off)
    n1, n2, n3 = int(img["NAXIS1"]), int(img["NAXIS2"]), int(img["NAXIS3"])
    size = -(-n1 * n2 * n3 * 4 // 2880) * 2880
    _, nh_off = _header_at(url, img_off + size)   # NHITS
    return url, n1, n2, n3, img_off, nh_off


def spectrum(ra, dec):
    """102-band spectrum (MJy/sr) of one cube pixel, with the number of exposures behind each value."""
    from data_tables import CUBE_BANDWIDTH, CUBE_WAVELENGTH
    tile, col, row = locate(ra, dec)
    url, n1, n2, n3, img_off, nh_off = _layout(tile)

    def read(args):
        base, k, dtype = args
        o = base + ((k * n2 + row) * n1 + col) * 4
        return np.frombuffer(_get(url, o, o + 4), dtype)[0].item()

    jobs = [(img_off, k, ">f4") for k in range(n3)] + [(nh_off, k, ">i4") for k in range(n3)]
    with ThreadPoolExecutor(16) as ex:
        vals = list(ex.map(read, jobs))
    flux, hits = vals[:n3], vals[n3:]
    pts = [{"plane": k + 1, "det": k // 17 + 1, "wl_um": CUBE_WAVELENGTH[k], "bw_um": CUBE_BANDWIDTH[k],
            "value": None if not np.isfinite(flux[k]) else round(float(flux[k]), 5), "nhits": int(hits[k])}
           for k in range(n3)]
    return {"ra": ra, "dec": dec, "unit": "MJy/sr", "tile": tile, "col": col, "row": row,
            "pixel_arcsec": round(math.degrees(math.sqrt(math.pi / 3) / NSIDE) * 3600, 2),  # ~12.9" (hips_pixel_scale)
            "source": f"s3://{S3_BUCKET}/{HIPS_CUBE_PREFIX}", "points": pts}
