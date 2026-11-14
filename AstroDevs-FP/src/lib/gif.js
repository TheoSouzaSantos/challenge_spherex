// AI-Assisted: the GIF exporter generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Turns the current loop into an animated GIF the user can download and share.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

/**
 * frames: array of HTMLCanvasElement (same size). delayMs per frame. Triggers a download.
 */
export function downloadGif(frames, delayMs, filename) {
  const { width, height } = frames[0]
  const gif = GIFEncoder()
  for (const c of frames) {
    const data = c.getContext('2d').getImageData(0, 0, width, height).data
    const palette = quantize(data, 256)
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: delayMs })
  }
  gif.finish()
  const url = URL.createObjectURL(new Blob([gif.bytes()], { type: 'image/gif' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
