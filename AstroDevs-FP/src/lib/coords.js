// AI-Assisted: the coordinate helpers generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Sky coordinate helpers. Everything is in degrees.
 *
 * parseCoords() is forgiving on purpose: people paste coordinates in many styles
 * (08h55m10.8s -7d14m42s, 08:55:10.8 -07:14:42, 133.795 -7.245) and all of them should work.
 * Watch out for "-0d14m": the minus sign sits on a zero, so we read it from the text, not the number.
 */
const D2R = Math.PI / 180

/** '08h55m10.831s -7d14m42.53s', '08:55:10.8 -07:14:42.5', '08 55 10.8 -07 14 42.5' or '133.795 -7.245'. */
export function parseCoords(text) {
  const s = text.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')
  const dec2 = s.match(/^([+-]?\d+(?:\.\d+)?)°?\s+([+-]?\d+(?:\.\d+)?)°?$/)
  if (dec2) return check(((+dec2[1] % 360) + 360) % 360, +dec2[2])
  const tok = s.replace(/[hdms:°'"′″]/gi, ' ').trim().split(/\s+/)
  if (tok.length !== 6 || tok.some((t) => isNaN(+t))) return null
  const [h, m, sec, d, dm, ds] = tok.map(Number)
  if (h < 0 || h >= 24 || m >= 60 || sec >= 60 || dm >= 60 || ds >= 60) return null
  const sign = tok[3].startsWith('-') ? -1 : 1 // keeps the sign of "-0d14m"
  return check((h + m / 60 + sec / 3600) * 15, sign * (Math.abs(d) + dm / 60 + ds / 3600))
}

function check(ra, dec) {
  if (!isFinite(ra) || !isFinite(dec) || dec < -90 || dec > 90) return null
  return { ra, dec }
}

const pad = (n, w, p = 0) => n.toFixed(p).padStart(w, '0')

export function formatRA(ra) {
  let s = (((ra % 360) + 360) % 360) / 15 * 3600
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  return `${pad(h, 2)}h${pad(m, 2)}m${pad(s, 4, 1)}s`
}

export function formatDec(dec) {
  const sign = dec < 0 ? '-' : '+'
  let s = Math.abs(dec) * 3600
  const d = Math.floor(s / 3600); s -= d * 3600
  const m = Math.floor(s / 60); s -= m * 60
  return `${sign}${pad(d, 2)}°${pad(m, 2)}′${pad(s, 2, 0)}″`
}

/** Gnomonic (TAN) offsets in degrees from a centre -> sky position. xi points east, eta north. */
export function tanToSky(ra0, dec0, xiDeg, etaDeg) {
  const xi = xiDeg * D2R, eta = etaDeg * D2R, d0 = dec0 * D2R
  const rho = Math.hypot(xi, eta)
  if (rho === 0) return { ra: ra0, dec: dec0 }
  const c = Math.atan(rho)
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (eta * Math.sin(c) * Math.cos(d0)) / rho)
  const ra = ra0 * D2R + Math.atan2(xi * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - eta * Math.sin(d0) * Math.sin(c))
  return { ra: ((ra / D2R) % 360 + 360) % 360, dec: dec / D2R }
}

/** Region display pixel (x right = west, y down = south) -> sky. */
export function pixToSky(meta, x, y) {
  const { crval, crpix, scale_deg: s } = meta.wcs
  return tanToSky(crval[0], crval[1], -(x - crpix[0]) * s, -(y - crpix[1]) * s)
}

/** Corners of a square field of view, for drawing on the sky map. */
export function squareCorners(ra, dec, fovDeg) {
  const h = fovDeg / 2
  return [[h, h], [-h, h], [-h, -h], [h, -h]].map(([x, y]) => {
    const p = tanToSky(ra, dec, x, y)
    return [p.ra, p.dec]
  })
}

export function angularSep(ra1, dec1, ra2, dec2) {
  const a = Math.sin(((dec2 - dec1) * D2R) / 2) ** 2 +
    Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.sin(((ra2 - ra1) * D2R) / 2) ** 2
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / D2R
}
