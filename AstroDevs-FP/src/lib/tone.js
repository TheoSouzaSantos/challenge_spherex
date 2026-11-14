// AI-Assisted: the tone-curve code generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Per-layer contrast: black point, white point and midtones (gamma), plus the layer's tint.
 *
 * This runs on the CPU through a 256-entry lookup table. Frames are tiny (tens to a few hundred
 * pixels on a side), so it is instant and we do not need a custom shader.
 */
export function toneLUT({ black = 0, white = 255, gamma = 1 }) {
  const lut = new Uint8Array(256)
  const span = Math.max(1, white - black)
  for (let v = 0; v < 256; v++) {
    const x = Math.min(1, Math.max(0, (v - black) / span))
    lut[v] = Math.round(255 * Math.pow(x, 1 / gamma))
  }
  return lut
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Paint a gray frame through a LUT and a tint colour into an RGBA buffer. */
export function paint(out, gray, lut, rgb) {
  const [r, g, b] = rgb
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    const v = lut[gray[i]]
    out[j] = (v * r) / 255
    out[j + 1] = (v * g) / 255
    out[j + 2] = (v * b) / 255
    out[j + 3] = 255
  }
}

/** Undo the server's asinh display stretch -> approximate image value (for relative photometry). */
export function grayToValue(g, stretch, a = 0.1) {
  const x = a * Math.sinh((g / 255) * Math.asinh(1 / a))
  return stretch.vmin + x * (stretch.vmax - stretch.vmin)
}
