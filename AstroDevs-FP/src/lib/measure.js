// AI-Assisted: the centroid and photometry code generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Measuring things in the browser: where a star is (centroid), how it moves from visit to
 * visit (trackSource), and how bright it is (aperture photometry).
 *
 * These work on the displayed frames, after the server's stretch has been undone, so the
 * numbers are good for comparing visits with each other, not as calibrated fluxes.
 */
import { grayToValue } from './tone'

function values(gray, stretch) {
  const lut = new Float32Array(256)
  for (let v = 0; v < 256; v++) lut[v] = grayToValue(v, stretch)
  const out = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]]
  return out
}

/** Brightest-peak centroid within `radius` px of (x0, y0). Returns [x, y] or null. */
export function centroid(gray, w, h, x0, y0, radius = 3) {
  let best = -1, bx = -1, by = -1
  for (let y = Math.max(0, Math.round(y0 - radius)); y <= Math.min(h - 1, Math.round(y0 + radius)); y++) {
    for (let x = Math.max(0, Math.round(x0 - radius)); x <= Math.min(w - 1, Math.round(x0 + radius)); x++) {
      if (Math.hypot(x - x0, y - y0) > radius) continue
      const v = gray[y * w + x]
      if (v > best) { best = v; bx = x; by = y }
    }
  }
  if (bx < 0 || best < 40) return null // nothing above the sky here
  let sw = 0, sx = 0, sy = 0
  let floor = 255
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = bx + dx, y = by + dy
    if (x >= 0 && y >= 0 && x < w && y < h) floor = Math.min(floor, gray[y * w + x])
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = bx + dx, y = by + dy
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const v = gray[y * w + x] - floor
    if (v <= 0) continue
    sw += v; sx += v * x; sy += v * y
  }
  return sw > 0 ? [sx / sw, sy / sw] : [bx, by]
}

/** Follow a source through every visit, starting from a click on visit `startIdx`. */
export function trackSource(meta, frames, det, startIdx, x, y) {
  const ids = meta.visits.map((v) => v.id)
  const g = frames.gray[det]
  const path = {}
  const start = centroid(g[ids[startIdx]], meta.width, meta.height, x, y, 3)
  if (!start) return null
  path[ids[startIdx]] = start
  for (const dir of [1, -1]) {
    let prev = start
    for (let i = startIdx + dir; i >= 0 && i < ids.length; i += dir) {
      if (!g[ids[i]]) continue
      const c = centroid(g[ids[i]], meta.width, meta.height, prev[0], prev[1], 2.5)
      if (!c) break
      path[ids[i]] = c
      prev = c
    }
  }
  return path
}

/** Relative aperture photometry at (x, y) in one frame. */
export function aperture(gray, stretch, w, h, x, y, r = 2, rIn = 4, rOut = 7) {
  const v = values(gray, stretch)
  let sum = 0, n = 0
  const sky = []
  for (let yy = Math.floor(y - rOut); yy <= Math.ceil(y + rOut); yy++) {
    for (let xx = Math.floor(x - rOut); xx <= Math.ceil(x + rOut); xx++) {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
      const d = Math.hypot(xx - x, yy - y)
      if (d <= r) { sum += v[yy * w + xx]; n++ } else if (d >= rIn && d <= rOut) sky.push(v[yy * w + xx])
    }
  }
  if (n < 3 || sky.length < 5) return null
  sky.sort((a, b) => a - b)
  return sum - n * sky[sky.length >> 1]
}
