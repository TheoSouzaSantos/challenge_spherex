// AI-Assisted: the PixiJS workspace generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The PixiJS workspace that shows the selected region.
 *
 * Each layer is one detector at one date, tinted with its own color. Layers are stacked with
 * additive blending, like shining several colored projectors on the same wall: a star that sits
 * still in two dates turns white, a star that moved shows two colors. On top we draw the
 * overlays (predicted position, Gaia stars, tracked path, photometry aperture).
 *
 * We render on demand instead of every frame - the picture only changes when the user does something.
 */
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { hexToRgb, paint, toneLUT } from './tone'

const COLORS = { target: 0x00e5ff, gaia: 0x4ade80, gaiaFast: 0xffd166, track: 0xff4fd8, aperture: 0xfacc15 }

export class Stage {
  async init(el, size) {
    const app = new Application()
    await app.init({
      width: size, height: size, background: '#000000', antialias: true, preserveDrawingBuffer: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    })
    app.ticker.stop() // we render on demand
    this.app = app
    this.size = size
    this.world = new Container()
    this.diff = new Sprite()
    this.mask = new Sprite()
    this.maskTextures = new Map()
    this.overlay = new Graphics()
    app.stage.addChild(this.world, this.overlay)
    this.layerSprites = new Map()
    this.diffTextures = new Map()
    this.view = { zoom: 1, cx: 0, cy: 0 }
    el.appendChild(app.canvas)
    return this
  }

  destroy() {
    this.app?.destroy(true, { children: true, texture: true })
    this.app = null
  }

  setRegion(meta, frames) {
    for (const l of this.layerSprites.values()) { l.sprite.destroy(); l.texture.destroy(true) }
    this.layerSprites.clear()
    for (const t of this.diffTextures.values()) t.destroy(true)
    this.diffTextures.clear()
    for (const t of this.maskTextures.values()) t.destroy(true)
    this.maskTextures.clear()
    this.world.removeChildren()
    this.world.addChild(this.diff, this.mask)
    this.meta = meta
    this.frames = frames
    this.resetView()
  }

  resetView() {
    if (!this.meta) return
    this.view = { zoom: 1, cx: this.meta.width / 2, cy: this.meta.height / 2 }
  }

  get scale() {
    return (this.size / Math.max(this.meta.width, this.meta.height)) * this.view.zoom
  }

  get offset() {
    const s = this.scale
    return [this.size / 2 - this.view.cx * s, this.size / 2 - this.view.cy * s]
  }

  /** Screen (CSS px inside the canvas) -> image pixel coordinates (pixel centres at integers). */
  toImage(sx, sy) {
    const [ox, oy] = this.offset
    return [(sx - ox) / this.scale - 0.5, (sy - oy) / this.scale - 0.5]
  }

  toScreen(x, y) {
    const [ox, oy] = this.offset
    return [(x + 0.5) * this.scale + ox, (y + 0.5) * this.scale + oy]
  }

  pan(dx, dy) {
    this.view.cx -= dx / this.scale
    this.view.cy -= dy / this.scale
  }

  zoomAt(sx, sy, factor) {
    const [ix, iy] = this.toImage(sx, sy)
    this.view.zoom = Math.min(12, Math.max(0.5, this.view.zoom * factor))
    const [nx, ny] = this.toImage(sx, sy)
    this.view.cx += ix - nx
    this.view.cy += iy - ny
  }

  _layer(id) {
    let l = this.layerSprites.get(id)
    if (!l) {
      const { width: w, height: h } = this.meta
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      const texture = Texture.from(canvas)
      texture.source.scaleMode = 'nearest'
      const sprite = new Sprite(texture)
      l = { canvas, ctx, img: ctx.createImageData(w, h), texture, sprite, key: '' }
      this.layerSprites.set(id, l)
      this.world.addChildAt(sprite, this.world.children.length - 2) // keep the diff and mask sprites on top
    }
    return l
  }

  _diffTexture(det, vid) {
    const key = `${det}/${vid}`
    if (!this.diffTextures.has(key)) {
      const img = this.frames.diff[det]?.[vid]
      if (!img) return null
      const t = Texture.from(img)
      t.source.scaleMode = 'nearest'
      this.diffTextures.set(key, t)
    }
    return this.diffTextures.get(key)
  }

  /**
   * state: { visitId, layers, mode, overlays, track, curvePoint, blend }
   * Returns a list of notes (e.g. "no D6 data for this visit") for the UI.
   */
  render(state) {
    if (!this.app || !this.meta) return []
    const notes = []
    const { meta, frames } = this
    const s = this.scale
    const [ox, oy] = this.offset
    this.world.scale.set(s)
    this.world.position.set(ox, oy)

    const ids = new Set(state.layers.map((l) => l.id))
    for (const [id, l] of this.layerSprites) {
      if (!ids.has(id)) { l.sprite.destroy(); l.texture.destroy(true); this.layerSprites.delete(id) }
    }
    const visible = state.layers.filter((l) => l.visible)
    const primary = visible[visible.length - 1] || state.layers[state.layers.length - 1]

    // keep sprite order = layer order (bottom first)
    state.layers.forEach((layer, i) => {
      const l = this._layer(layer.id)
      if (this.world.getChildIndex(l.sprite) !== i) this.world.setChildIndex(l.sprite, i)
    })

    for (const layer of state.layers) {
      const l = this._layer(layer.id)
      const vid = layer.epoch === 'follow' ? state.visitId : layer.epoch
      const gray = frames.gray[layer.det]?.[vid]
      l.sprite.visible = layer.visible && state.mode !== 'diff' && !!gray
      if (layer.visible && !gray) notes.push(`No D${layer.det} data for this visit`)
      if (!l.sprite.visible) continue
      const key = `${vid}|${layer.black}|${layer.white}|${layer.gamma}|${layer.color}`
      if (key !== l.key) {
        paint(l.img.data, gray, toneLUT(layer), hexToRgb(layer.color))
        l.ctx.putImageData(l.img, 0, 0)
        l.texture.source.update()
        l.key = key
      }
      l.sprite.alpha = layer.opacity
      l.sprite.blendMode = state.blend
    }

    this.diff.visible = false
    if (state.mode === 'diff' && primary) {
      const det = primary.det
      const ref = meta.detectors.find((d) => d.det === det)?.diff_ref
      if (state.visitId === ref) notes.push('Reference visit: the difference starts at the next visit')
      const t = this._diffTexture(det, state.visitId)
      if (t) {
        this.diff.texture = t
        this.diff.alpha = 1
        this.diff.blendMode = 'normal'
        this.diff.visible = true
      }
    }

    // flagged pixels (saturated cores, cosmic rays, dead pixels) for the top visible band
    this.mask.visible = false
    if (state.overlays.mask && primary) {
      const key = `${primary.det}/${state.visitId}`
      const src = this.frames.mask?.[primary.det]?.[state.visitId]
      if (src) {
        if (!this.maskTextures.has(key)) {
          const t = Texture.from(src)
          t.source.scaleMode = 'nearest'
          this.maskTextures.set(key, t)
        }
        this.mask.texture = this.maskTextures.get(key)
        this.mask.blendMode = 'normal'
        this.mask.visible = true
      }
    }

    this._overlays(state, s)
    this.app.render()
    return notes
  }

  _overlays(state, s) {
    const g = this.overlay
    const { meta } = this
    const vid = state.visitId
    const o = state.overlays
    g.clear()

    if (o.gaia) {
      for (const star of meta.gaia) {
        const p = star.px[vid]
        if (!p) continue
        const [x, y] = this.toScreen(p[0], p[1])
        g.circle(x, y, Math.max(3, 1.1 * s)).stroke({ width: 1, color: star.pm > 100 ? COLORS.gaiaFast : COLORS.gaia, alpha: 0.45 })
      }
    }
    if (o.target && meta.target?.px) {
      const pts = meta.visits.map((v) => meta.target.px[v.id]).filter(Boolean).map((p) => this.toScreen(p[0], p[1]))
      if (pts.length > 1) {
        g.moveTo(pts[0][0], pts[0][1])
        for (const p of pts.slice(1)) g.lineTo(p[0], p[1])
        g.stroke({ width: 1, color: COLORS.target, alpha: 0.45 })
      }
      const p = meta.target.px[vid]
      if (p) {
        const [x, y] = this.toScreen(p[0], p[1])
        const r = Math.max(7, 2.4 * s), gap = r * 0.45, len = r * 0.9
        g.circle(x, y, r).stroke({ width: 1.5, color: COLORS.target, alpha: 0.9 })
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          g.moveTo(x + dx * (r + gap), y + dy * (r + gap)).lineTo(x + dx * (r + gap + len), y + dy * (r + gap + len))
        }
        g.stroke({ width: 1.5, color: COLORS.target, alpha: 0.9 })
      }
    }
    if (state.track) {
      const pts = meta.visits.map((v) => state.track[v.id]).filter(Boolean).map((p) => this.toScreen(p[0], p[1]))
      if (pts.length > 1) {
        g.moveTo(pts[0][0], pts[0][1])
        for (const p of pts.slice(1)) g.lineTo(p[0], p[1])
        g.stroke({ width: 2, color: COLORS.track, alpha: 0.9 })
      }
      for (const p of pts) g.circle(p[0], p[1], 2.5).fill({ color: COLORS.track, alpha: 0.9 })
      const cur = state.track[vid]
      if (cur) {
        const [x, y] = this.toScreen(cur[0], cur[1])
        g.circle(x, y, Math.max(6, 2 * s)).stroke({ width: 2, color: COLORS.track })
      }
    }
    if (state.curvePoint) {
      const [x, y] = this.toScreen(state.curvePoint[0], state.curvePoint[1])
      g.circle(x, y, 2 * s).stroke({ width: 1.5, color: COLORS.aperture })
      g.circle(x, y, 4 * s).circle(x, y, 7 * s).stroke({ width: 1, color: COLORS.aperture, alpha: 0.45 })
    }
  }

  /** Render a state and return a 2D canvas copy (for GIF export), with a caption burned in. */
  snapshot(state, caption) {
    this.render(state)
    const c = document.createElement('canvas')
    c.width = this.size
    c.height = this.size
    const ctx = c.getContext('2d')
    ctx.drawImage(this.app.canvas, 0, 0, this.size, this.size)
    if (caption) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, this.size - 26, this.size, 26)
      ctx.fillStyle = '#e6ebf5'
      ctx.font = '13px system-ui, sans-serif'
      ctx.fillText(caption, 8, this.size - 9)
    }
    return c
  }
}
