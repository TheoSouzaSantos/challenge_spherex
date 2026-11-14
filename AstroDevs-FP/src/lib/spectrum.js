// AI-Assisted: the in-browser spectrum reader generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Spectrum of ANY point on the sky, read by the browser straight from NASA's public SPHEREx bucket on AWS.
 *
 * The SPHEREx DR1 all-sky cube is stored as HEALPix order-5 tiles, each a 512 x 512 x 102 FITS cube
 * (one plane per band). A single pixel's spectrum is 102 reads of 4 bytes, done with HTTP Range requests,
 * so this works on the static site with no server of ours. The same logic lives in backend/s3.py.
 */

// Three equivalent addresses of the same public bucket. Browsers open at most ~6 connections per host,
// so spreading the 102 small reads over three hosts makes a spectrum arrive about three times sooner.
const HOSTS = [
  'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/',
  'https://s3.us-east-1.amazonaws.com/nasa-irsa-spherex/',
  'https://nasa-irsa-spherex.s3.amazonaws.com/',
]
export const HIPS_CUBE = 'dr1/hips5_cube/hips_20261026' // update when a new all-sky cube is published
const ORDER = 5
const SUB = 9 // 512 px per tile side -> pixels are HEALPix order 14
const NSIDE = 2 ** (ORDER + SUB)

// Band centres and widths (µm), from the cube's WCS-WAVE table. Planes 51-52 are blank (dichroic).
const WL = [0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025, 1.05, 1.075, 1.102, 1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292, 2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.57, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148, 4.184, 4.22, 4.257, 4.294, 4.331, 4.368, 4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915, 4.951, 4.988]
const BW = [0.018, 0.019, 0.019, 0.02, 0.02, 0.021, 0.022, 0.023, 0.023, 0.024, 0.025, 0.026, 0.026, 0.027, 0.028, 0.029, 0.03, 0.026, 0.027, 0.028, 0.029, 0.03, 0.03, 0.031, 0.032, 0.032, 0.033, 0.034, 0.035, 0.036, 0.037, 0.038, 0.039, 0.039, 0.039, 0.041, 0.042, 0.043, 0.045, 0.046, 0.047, 0.048, 0.049, 0.051, 0.052, 0.054, 0.055, 0.056, 0.057, 0.058, 0.059, 0.058, 0.073, 0.074, 0.076, 0.078, 0.079, 0.084, 0.086, 0.089, 0.091, 0.093, 0.094, 0.096, 0.098, 0.099, 0.102, 0.103, 0.035, 0.036, 0.036, 0.036, 0.036, 0.036, 0.037, 0.037, 0.037, 0.037, 0.037, 0.037, 0.037, 0.037, 0.037, 0.038, 0.038, 0.035, 0.036, 0.035, 0.036, 0.036, 0.037, 0.036, 0.037, 0.037, 0.037, 0.036, 0.036, 0.037, 0.038, 0.038, 0.037, 0.037]

/** HEALPix (theta, phi) -> face and in-face (ix, iy), nested scheme (port of healpix_base loc2xyf). */
function xyf(theta, phi) {
  const z = Math.cos(theta), za = Math.abs(z)
  const tt = (((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 2 / Math.PI
  if (za <= 2 / 3) {
    const t1 = NSIDE * (0.5 + tt), t2 = NSIDE * z * 0.75
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2)
    const ifp = Math.floor(jp / NSIDE), ifm = Math.floor(jm / NSIDE)
    const face = ifp === ifm ? (ifp | 4) : ifp < ifm ? ifp : ifm + 8
    return [face, jm & (NSIDE - 1), NSIDE - (jp & (NSIDE - 1)) - 1]
  }
  const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt
  const tmp = NSIDE * Math.sqrt(3 * (1 - za))
  const jp = Math.min(NSIDE - 1, Math.floor(tp * tmp)), jm = Math.min(NSIDE - 1, Math.floor((1 - tp) * tmp))
  return z >= 0 ? [ntt, NSIDE - jm - 1, NSIDE - jp - 1] : [ntt + 8, jp, jm]
}

const spread = (v) => { let o = 0; for (let b = 0; b < 8; b++) o |= ((v >> b) & 1) << (2 * b); return o }

/** Tile number and (column, row) inside it. Verified against the tiles' own HPX WCS (30/30 points). */
export function locate(ra, dec) {
  const [face, ix, iy] = xyf((90 - dec) * Math.PI / 180, ra * Math.PI / 180)
  const tile = face * 4 ** ORDER + (spread(ix >> SUB) | (spread(iy >> SUB) << 1))
  const side = 2 ** SUB
  return { tile, col: iy & (side - 1), row: side - 1 - (ix & (side - 1)) }
}

const tilePath = (tile) => `${HIPS_CUBE}/Norder${ORDER}/Dir${Math.floor(tile / 10000) * 10000}/Npix${tile}_cube.fits`

async function range(url, a, b) {
  // no-store: Chrome's HTTP cache serialises requests for the same URL ("cache lock"), which turned 204
  // parallel 4-byte reads of one tile into a crawl. These reads are tiny and never reused, so skip the cache.
  const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` }, cache: 'no-store' })
  if (!r.ok) throw new Error(`AWS S3 answered ${r.status}`)
  return new DataView(await r.arrayBuffer())
}

async function header(url, offset) {
  const cards = {}
  let pos = offset
  for (;;) {
    const v = await range(url, pos, pos + 2880)
    pos += 2880
    const text = new TextDecoder('ascii').decode(v)
    for (let i = 0; i < 2880; i += 80) {
      const c = text.slice(i, i + 80)
      if (c.startsWith('END')) return { cards, dataOffset: pos }
      if (c.slice(8, 10) === '= ') cards[c.slice(0, 8).trim()] = c.slice(10).split('/')[0].trim().replace(/'/g, '').trim()
    }
  }
}

const layouts = new Map()
async function layout(tile) {
  if (!layouts.has(tile)) {
    layouts.set(tile, (async () => {
      const path = tilePath(tile)
      const url = HOSTS[0] + path
      const p = await header(url, 0)
      const img = await header(url, p.dataOffset)
      const n1 = +img.cards.NAXIS1, n2 = +img.cards.NAXIS2, n3 = +img.cards.NAXIS3
      const size = Math.ceil((n1 * n2 * n3 * 4) / 2880) * 2880
      const nh = await header(url, img.dataOffset + size)
      return { path, n1, n2, n3, imgOff: img.dataOffset, nhOff: nh.dataOffset }
    })().catch((e) => { layouts.delete(tile); throw e }))
  }
  return layouts.get(tile)
}

async function pool(tasks, n) {
  const out = new Array(tasks.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k]() }
  }))
  return out
}

/**
 * { points: [{wl_um, bw_um, det, value (MJy/sr or null)}], tile, col, row }.
 * Exposure counts (NHITS) are skipped here to halve the requests; the backend version includes them.
 */
export async function skySpectrum(ra, dec) {
  const { tile, col, row } = locate(ra, dec)
  const L = await layout(tile)
  const at = (k) => L.imgOff + ((k * L.n2 + row) * L.n1 + col) * 4
  const tasks = Array.from({ length: L.n3 }, (_, k) => () =>
    range(HOSTS[k % HOSTS.length] + L.path, at(k), at(k) + 4).then((v) => v.getFloat32(0, false)))
  const vals = await pool(tasks, 6 * HOSTS.length)
  const points = Array.from({ length: L.n3 }, (_, k) => ({
    plane: k + 1, det: Math.floor(k / 17) + 1, wl_um: WL[k], bw_um: BW[k],
    value: Number.isFinite(vals[k]) ? vals[k] : null, nhits: null,
  }))
  return { ra, dec, tile, col, row, unit: 'MJy/sr', source: `s3://nasa-irsa-spherex/${HIPS_CUBE}`, points }
}

