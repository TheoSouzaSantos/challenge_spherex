// AI-Assisted: the data loading code generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Where the app gets its data from.
 *
 * Two sources with the same format: prebaked test targets shipped with the site (always work,
 * even offline) and the live API (beta) for any other position. Frames are decoded once into
 * plain byte arrays, so the timeline, tone curves and measurements never wait on the network.
 */
const BASE = import.meta.env.BASE_URL
export const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const hasApi = API !== ''

export const DETECTORS = {
  1: { range: [0.75, 1.09], color: '#7c6cff', hint: 'near-infrared, hot stars' },
  2: { range: [1.10, 1.62], color: '#3d8bff', hint: 'stars shine brightest here' },
  3: { range: [1.63, 2.41], color: '#2fd4c8', hint: 'cool stars, dust-hidden stars' },
  4: { range: [2.42, 3.82], color: '#b6e35a', hint: 'water ice and methane bands' },
  5: { range: [3.83, 4.41], color: '#ffb347', hint: 'cold objects, CO2 ice' },
  6: { range: [4.42, 5.0], color: '#ff5a4e', hint: 'coldest objects, brown dwarfs' },
}

export const detLabel = (det) => {
  const d = DETECTORS[det]
  return `D${det} · ${d.range[0].toFixed(2)}–${d.range[1].toFixed(2)} µm`
}

// SPHEREx all-sky HiPS cube: 102 slices, 17 per detector (frame = 17*(D-1) + channel).
export const SPHEREX_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube'
export const SKY_SURVEYS = {
  spherex: { name: 'SPHEREx all-sky (DR1)', url: SPHEREX_HIPS, format: 'png' },
  '2mass': { name: '2MASS color (near-IR)', url: 'https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color', format: 'jpeg' },
  dss: { name: 'DSS2 color (visible)', url: 'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color', format: 'jpeg' },
}
// Central wavelength of each cube frame, from the HiPS 'properties' file (data_cube_crval3_arr, µm).
const CUBE_WL = [0.753, 0.771, 0.790, 0.809, 0.828, 0.848, 0.868, 0.889, 0.910, 0.932, 0.955, 0.978, 1.001, 1.025, 1.050, 1.075, 1.102, 1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592, 1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.240, 2.292, 2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.570, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.970, 4.005, 4.040, 4.076, 4.112, 4.148, 4.184, 4.220, 4.257, 4.294, 4.331, 4.368, 4.405, 4.435, 4.467, 4.500, 4.533, 4.566, 4.600, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915, 4.951, 4.988]
export const BLANK_SLICES = [50, 51] // dichroic channels, blank in the cube

/**
 * Band to show when the slider lands on `next`, coming from `prev`: blank bands are skipped in the
 * direction of travel, so the sky map never goes empty while you scroll through the colors.
 */
export function skipBlankSlice(next, prev = next) {
  if (!BLANK_SLICES.includes(next)) return next
  const dir = next >= prev ? 1 : -1
  let k = next
  while (BLANK_SLICES.includes(k)) k += dir
  return Math.min(101, Math.max(0, k))
}

export function sliceInfo(slice) {
  const det = Math.min(6, Math.floor(slice / 17) + 1)
  return { det, wl: CUBE_WL[slice], blank: BLANK_SLICES.includes(slice) }
}

/** Errors carry `unreachable: true` when the service is down (no answer, or 502/503/504), so the app
 *  can fall back to the saved regions instead of showing a dead end. */
async function getJSON(url) {
  let r
  try {
    r = await fetch(url)
  } catch {
    throw Object.assign(new Error('The service did not answer.'), { unreachable: true })
  }
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try { msg = (await r.json()).detail || msg } catch { /* not JSON */ }
    throw Object.assign(new Error(msg), { unreachable: [502, 503, 504].includes(r.status) })
  }
  return r.json()
}

export const loadIndex = () => getJSON(`${BASE}data/index.json`)

export async function loadPrebaked(slug) {
  const meta = await getJSON(`${BASE}data/${slug}/meta.json`)
  return { ...meta, base: `${BASE}data/${slug}/`, live: false }
}

export async function loadLive({ ra, dec, fov, dets, name }) {
  const q = new URLSearchParams({ ra: ra.toFixed(6), dec: dec.toFixed(6), fov: fov.toFixed(3), dets: dets.join(',') })
  if (name) q.set('name', name)
  const meta = await getJSON(`${API}/api/region?${q}`)
  return { ...meta, base: API + meta.base, live: true }
}

export const resolveName = (q) => getJSON(`${API}/api/resolve?q=${encodeURIComponent(q)}`)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${src}`))
    img.src = src
  })
}

/**
 * Decode every frame once: gray[det][visit] = Uint8Array (display values), diff[det][visit] = Image,
 * mask[det][visit] = canvas with the flagged pixels painted magenta (transparent elsewhere).
 */
export async function loadFrames(meta) {
  const gray = {}, diff = {}, mask = {}
  const canvas = document.createElement('canvas')
  canvas.width = meta.width
  canvas.height = meta.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const jobs = []
  for (const d of meta.detectors) {
    gray[d.det] = {}
    diff[d.det] = {}
    mask[d.det] = {}
    for (const [vid, f] of Object.entries(d.frames)) {
      jobs.push(loadImage(meta.base + f.png).then((img) => {
        ctx.clearRect(0, 0, meta.width, meta.height)
        ctx.drawImage(img, 0, 0)
        const px = ctx.getImageData(0, 0, meta.width, meta.height).data
        const g = new Uint8Array(meta.width * meta.height)
        for (let i = 0; i < g.length; i++) g[i] = px[i * 4]
        gray[d.det][vid] = g
      }))
      if (f.diff) jobs.push(loadImage(meta.base + f.diff).then((img) => { diff[d.det][vid] = img }))
      if (f.mask) jobs.push(loadImage(meta.base + f.mask).then((img) => { mask[d.det][vid] = maskCanvas(img, meta) }))
    }
  }
  await Promise.all(jobs)
  return { gray, diff, mask }
}

function maskCanvas(img, meta) {
  const c = document.createElement('canvas')
  c.width = meta.width
  c.height = meta.height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const on = px[i] > 127
    px[i] = 255; px[i + 1] = 60; px[i + 2] = 220; px[i + 3] = on ? 105 : 0
  }
  ctx.putImageData(data, 0, 0)
  return c
}
