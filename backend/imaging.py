# AI-Assisted: the image-processing functions generated with Claude Code (Anthropic) and reviewed by the team.
"""The image science: turn raw SPHEREx exposures into frames a person can blink.

What happens to every exposure, in order:
  1. subtract the zodiacal light model (the glow of dust in our solar system),
  2. blank out pixels the mission flagged as bad (cosmic rays, saturation, ghosts),
  3. reproject onto one shared north-up grid, so stars stay put from frame to frame,
  4. median-combine the exposures of each visit to beat down the noise,
  5. stretch every visit with the SAME brightness limits.

Step 5 matters more than it looks. If each frame were stretched on its own, the whole image
would flicker between visits and hide the small shifts we are trying to show.

All functions here are pure: arrays in, arrays out, no network.
"""
import warnings

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning
from PIL import Image

from config import (ASINH_A, GOOD_FLAG_BITS, MJYSR_TO_MJY_PER_ARCSEC2, PHOT_MAXITERS, PHOT_R_AP, PHOT_R_IN,
                    PHOT_R_OUT, PHOT_SIGMA)

warnings.simplefilter("ignore", FITSFixedWarning)
# The spectral WCS 'W' triggers an astropy INFO about "inconsistent SIP" every time. The IRSA intro tutorial
# explains it is expected (we switch SIP off for that WCS on purpose), so keep the logs quiet.
from astropy import log as _astropy_log  # noqa: E402
_astropy_log.setLevel("WARNING")

GOOD_MASK = sum(1 << b for b in GOOD_FLAG_BITS)


def make_grid(ra, dec, fov_deg, pixscale_arcsec):
    """North-up, east-left TAN grid centred on (ra, dec). Shared by every frame of a region."""
    n = max(9, int(np.ceil(fov_deg * 3600.0 / pixscale_arcsec)))
    if n % 2 == 0:
        n += 1
    s = pixscale_arcsec / 3600.0
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2.0, (n + 1) / 2.0]
    w.wcs.cdelt = [-s, s]
    return w, (n, n)


def load_exposure(path, ra, dec):
    """IMAGE - ZODI with bad flags as NaN, plus its WCS, flagged fraction and wavelength at (ra, dec).

    IMAGE is in MJy/sr and the zodiacal light is NOT subtracted from it (IRSA intro tutorial), so we
    subtract the ZODI extension ourselves. Flag names live in the FLAGS header (MSKNnnnn keywords).
    SOURCE (bit 21) is the most common flag and only means "a known star sits here", so it is kept.
    """
    with fits.open(path, memmap=False) as h:
        img = h["IMAGE"].data.astype(np.float32)
        if "ZODI" in h:
            img = img - h["ZODI"].data.astype(np.float32)
        flags = h["FLAGS"].data.astype(np.int64) if "FLAGS" in h else np.zeros(img.shape, np.int64)
        bad = (flags & ~GOOD_MASK) != 0
        img[bad] = np.nan
        # fobj + .celestial: the pattern from the IRSA mosaic tutorial (a header may point to other HDUs)
        w = WCS(h["IMAGE"].header, fobj=h).celestial
        if "SBWL" in h["IMAGE"].header:   # cut-out read from S3: wavelength was evaluated on the full image
            wl, bw = h["IMAGE"].header["SBWL"], h["IMAGE"].header.get("SBBW")
        else:
            wl, bw = _wavelength(h, w, ra, dec)
    return {"img": img, "wcs": w, "flag_frac": float(bad.mean()), "wl_um": wl, "bw_um": bw}


def _wavelength(h, w, ra, dec):
    """Central wavelength and bandwidth (µm) at the target, from the spectral WCS 'W' (WCS-WAVE table).

    As in the IRSA intro tutorial, SIP is switched off for this WCS: the wavelength depends on where a
    pixel sits on the filter, not on optical distortion.
    """
    try:
        x, y = w.all_world2pix([[ra, dec]], 0)[0]
        sw = WCS(header=h["IMAGE"].header, fobj=h, key="W")
        sw.sip = None
        vals = sw.pixel_to_world_values(x, y)
        wl = float(np.asarray(vals[0]).ravel()[0])
        bw = float(np.asarray(vals[1]).ravel()[0]) if len(vals) > 1 else None
        if not 0.5 < wl < 5.5:
            return None, None
        return round(wl, 3), (round(bw, 4) if bw and 0 < bw < 1 else None)
    except Exception:  # noqa: BLE001 - wavelength is optional metadata
        return None, None


def reproject_to(exp, grid_wcs, shape):
    """Flux-conserving reprojection (reproject_exact, as in the IRSA mosaic tutorial); interp as a fallback."""
    from reproject import reproject_exact, reproject_interp
    try:
        out, _ = reproject_exact((exp["img"], exp["wcs"]), grid_wcs, shape_out=shape)
    except Exception:  # noqa: BLE001 - unusual WCS edge cases
        out, _ = reproject_interp((exp["img"], exp["wcs"]), grid_wcs, shape_out=shape)
    return out.astype(np.float32)


def coadd(stack):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmedian(np.stack(stack), axis=0).astype(np.float32)


def subtract_sky(img):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med = np.nanmedian(img)
    return img - (med if np.isfinite(med) else 0.0)


def _sky_sigma(v):
    med = float(np.median(v))
    sig = float(1.4826 * np.median(np.abs(v - med)))
    return med, (sig if sig > 0 else float(np.std(v)) or 1.0)


def stretch_limits(images):
    """ONE pair of limits for all frames of a detector, so brightness changes are real, not display flicker.

    Black = sky - 1.5 sigma; white = brightest pixels, but never closer than 25 sigma to the sky,
    so an empty field shows dark sky with faint sources instead of saturated noise.
    """
    v = np.concatenate([i[np.isfinite(i)].ravel() for i in images if np.isfinite(i).any()] or [np.zeros(1)])
    sky, sig = _sky_sigma(v)
    lo = sky - 1.5 * sig
    hi = max(float(np.percentile(v, 99.95)), sky + 25 * sig)
    return lo, hi


def asinh8(img, vmin, vmax, a=ASINH_A):
    x = np.clip((np.nan_to_num(img, nan=vmin) - vmin) / (vmax - vmin), 0, 1)
    y = np.arcsinh(x / a) / np.arcsinh(1 / a)
    return (y * 255).astype(np.uint8)


def save_gray(img, vmin, vmax, path):
    Image.fromarray(np.flipud(asinh8(img, vmin, vmax)), mode="L").save(path, optimize=True)


def diff_limit(diffs):
    v = np.concatenate([d[np.isfinite(d)].ravel() for d in diffs if np.isfinite(d).any()] or [np.ones(1)])
    _, sig = _sky_sigma(v)
    return max(float(np.percentile(np.abs(v), 99.9)), 8 * sig)


def save_diff(d, lim, path):
    """Signed difference on black: orange = brighter now (where it went), blue = fainter now (where it was)."""
    x = np.clip(np.nan_to_num(d) / lim, -1, 1)
    pos, neg = np.clip(x, 0, 1), np.clip(-x, 0, 1)
    rgb = np.zeros(d.shape + (3,), np.float32)
    rgb[..., 0] = pos * 255 + neg * 40
    rgb[..., 1] = pos * 150 + neg * 150
    rgb[..., 2] = pos * 30 + neg * 255
    Image.fromarray(np.flipud(rgb.clip(0, 255).astype(np.uint8)), mode="RGB").save(path, optimize=True)


def fill_for_display(img, max_iter=200):
    """Fill masked (NaN) pixels from their neighbours, for the picture only - never for measurements.

    Bright stars saturate SPHEREx, so their cores come back flagged and would show as black holes.
    Growing the surrounding values inward turns a saturated core into a bright star again, while an
    isolated dead pixel just takes the sky value instead of looking like a new object.
    """
    from scipy import ndimage
    out = img.astype(np.float32).copy()
    m = ~np.isfinite(out)
    k = np.ones((3, 3), np.float32)
    for _ in range(max_iter):
        if not m.any():
            break
        s = ndimage.convolve(np.where(m, 0, out), k, mode="nearest")
        c = ndimage.convolve((~m).astype(np.float32), k, mode="nearest")
        fill = m & (c > 0)
        if not fill.any():
            break
        out[fill] = s[fill] / c[fill]
        m &= ~fill
    out[m] = np.nanmedian(img) if np.isfinite(img).any() else 0.0
    return out


def save_mask(mask, path):
    Image.fromarray(np.flipud(mask.astype(np.uint8) * 255), mode="L").save(path, optimize=True)


def masked_core_radius(img, x, y, touch=1.5):
    """Radius (px) of the masked blob sitting ON (x, y), e.g. a saturated star core. 0 if there is none.

    Only masked pixels connected to the target position count: a cosmic ray or another star's core a
    few pixels away must not make a faint target look saturated.
    """
    from scipy import ndimage
    masked = ~np.isfinite(img)
    if not masked.any():
        return 0.0
    labels, _ = ndimage.label(masked, structure=np.ones((3, 3)))
    yy, xx = np.indices(img.shape)
    rr = np.hypot(xx - x, yy - y)
    ids = set(np.unique(labels[(rr <= touch) & masked])) - {0}
    if not ids:
        return 0.0
    return float(rr[np.isin(labels, list(ids))].max())


def aperture_flux(img, x, y, pixscale_arcsec, r=PHOT_R_AP, r_in=PHOT_R_IN, r_out=PHOT_R_OUT, r_min=0.0):
    """Aperture photometry in mJy at (x, y) (0-based pixel coords), following the IRSA mosaic tutorial.

    Sky = sigma-clipped mean of the annulus (sigma=3, maxiters=10) times the aperture area, subtracted
    from the aperture sum. MJy/sr -> mJy with 23.5045 * pixscale**2 / 1000. The error is a simple
    estimate from the annulus scatter (the tutorial computes none).

    With r_min > 0 the "aperture" is a ring (r_min..r), used for saturated stars: only the PSF wings
    are measured, which underestimates the total flux but tracks its changes from visit to visit.
    """
    from astropy.stats import sigma_clipped_stats
    yy, xx = np.indices(img.shape)
    rr = np.hypot(xx - x, yy - y)
    ap = (rr >= r_min) & (rr <= r) & np.isfinite(img)
    ann = (rr >= r_in) & (rr <= r_out) & np.isfinite(img)
    if ap.sum() < 3 or ann.sum() < 5:
        return None, None
    sky_mean, _, sky_std = sigma_clipped_stats(img[ann], sigma=PHOT_SIGMA, maxiters=PHOT_MAXITERS)
    to_mjy = MJYSR_TO_MJY_PER_ARCSEC2 * pixscale_arcsec ** 2
    flux = float((np.sum(img[ap]) - sky_mean * ap.sum()) * to_mjy)
    err = float(sky_std * np.sqrt(ap.sum()) * to_mjy)
    return flux, err
