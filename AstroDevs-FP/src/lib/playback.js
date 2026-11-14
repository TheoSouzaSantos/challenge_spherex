// AI-Assisted: the playback helper generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Which visit is on screen right now: the blink pair alternates, otherwise it is the timeline frame.
 */
/** With many visits the date labels collide: show the first, the last and every `step`-th one in between. */
export function showLabel(i, n, max = 5) {
  const step = Math.ceil(n / max)
  if (i === 0 || i === n - 1) return true
  return i % step === 0 && n - 1 - i >= step
}

export function currentVisitIndex(s) {
  if (s.mode === 'blink') return s.blinkPhase ? s.blinkB : s.blinkA
  return s.frame
}

/**
 * Which visits have an image in the band(s) on screen. SPHEREx's detectors watch different strips of sky,
 * so a star can be seen in D1 one month and in D3 another: playback and stepping skip the empty dates.
 * A visit counts if any visible layer that follows the timeline has a frame there.
 */
export function visitsWithData(region, layers) {
  const follow = layers.filter((l) => l.visible && l.epoch === 'follow')
  const dets = follow.map((l) => region.detectors.find((d) => d.det === l.det)).filter(Boolean)
  return region.visits.map((v) => !dets.length || dets.some((d) => d.frames[v.id]))
}

export function nearestWithData(ok, i) {
  if (ok[i]) return i
  for (let d = 1; d < ok.length; d++) {
    if (ok[i + d]) return i + d
    if (ok[i - d]) return i - d
  }
  return i
}

/** Next index with data in [from, to], moving `dir` (+1/-1); wraps inside the range when `wrap`. */
export function stepWithData(ok, i, dir, [from, to], wrap) {
  for (let j = i + dir; j >= from && j <= to; j += dir) if (ok[j]) return j
  if (!wrap) return i
  for (let j = dir > 0 ? from : to; j >= from && j <= to; j += dir) if (ok[j]) return j
  return i
}
