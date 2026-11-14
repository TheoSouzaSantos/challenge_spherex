// AI-Assisted: the whole-sky map component generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The big sky map, powered by Aladin Lite (CDS) and the SPHEREx all-sky cube from IRSA.
 *
 * It shows the whole sky, lets people zoom anywhere, marks the test targets, draws the selected
 * region, and in "Cut out" mode turns a click into a new region.
 */
import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEarthAmericas, faExpand, faSatellite } from '../lib/icons'
import { SKY_SURVEYS, sliceInfo } from '../lib/data'

// Aladin Lite is ~2.9 MB: load it after the page has painted (Vercel "bundle-dynamic-imports"),
// so the header, sidebar and the five test targets are usable while the sky map arrives.
let A = null
const loadAladin = () => import('aladin-lite').then((m) => { A = m.default; return A.init })
import { formatDec, formatRA, squareCorners } from '../lib/coords'

/**
 * Aladin 3.8 maps setSliceNumber(n) to a tile frame assuming frames are evenly spaced in frequency:
 * frame = floor((nu - nuMin) / (nuMax - nuMin) * depth), nu = c / (emMin + n/depth * (emMax - emMin)).
 * The SPHEREx cube is ordered by wavelength, so invert that to request exactly frame k (measured 2026-11-14).
 */
function aladinSlice(layer, k) {
  const { emMin, emMax, cubeDepth: d } = layer
  if (!emMin || !emMax || !d) return k
  const nuMin = 1 / emMax, nuMax = 1 / emMin
  const nu = nuMin + ((k + 0.5) / d) * (nuMax - nuMin)
  return ((1 / nu - emMin) / (emMax - emMin)) * d
}

export default function SkyView({ survey, slice, focus, region, targets, cropMode, cropFov, onCrop, onPickTarget,
  spectrumMode, specPoint, onSpectrum }) {
  const el = useRef(null)
  const aladin = useRef(null)
  const ov = useRef({})
  const cb = useRef({})
  const base = useRef(null)
  const coo = useRef(null) // cursor position, written straight to the DOM (Vercel "rerender-use-ref-transient-values")
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')

  useEffect(() => { cb.current = { onCrop, onPickTarget, cropMode, cropFov, spectrumMode, onSpectrum } })

  useEffect(() => {
    let alive = true
    const div = el.current
    loadAladin().then(() => {
      if (!alive) return
      const a = A.aladin(div, {
        survey: SKY_SURVEYS.spherex.url, fov: 360, projection: 'MOL', cooFrame: 'ICRSd', target: '0 +0',
        showReticle: false, showZoomControl: true, showFullscreenControl: false, showLayersControl: false,
        showGotoControl: false, showShareControl: false, showSimbadPointerControl: false, showCooGridControl: false,
        showSettingsControl: false, showProjectionControl: false, showFrame: false, showCooLocation: false,
        showStatusBar: false, showContextMenu: false,
      })
      aladin.current = a
      if (import.meta.env.DEV) window.__cosmosight = { aladin: a } // debugging hook
      ov.current.region = A.graphicOverlay({ color: '#f2a541', lineWidth: 2, name: 'Open patch' })
      ov.current.cursor = A.graphicOverlay({ color: '#f0f0f5', lineWidth: 1, name: 'Cut-out preview' })
      ov.current.targets = A.catalog({ name: 'Test targets', color: '#f0f0f5', sourceSize: 16, shape: 'circle',
        displayLabel: true, labelColumn: 'name', labelColor: '#f0f0f5', labelFont: '500 13px Barlow, system-ui' })
      a.addOverlay(ov.current.region)
      a.addOverlay(ov.current.cursor)
      a.addCatalog(ov.current.targets)
      ov.current.spec = A.catalog({ name: 'Spectrum point', color: '#ff4fd8', sourceSize: 16, shape: 'cross' })
      a.addCatalog(ov.current.spec)
      a.on('click', (e) => {
        if (e && !e.isDragging && cb.current.cropMode) cb.current.onCrop(e.ra, e.dec)
        else if (e && !e.isDragging && cb.current.spectrumMode) cb.current.onSpectrum(e.ra, e.dec)
      })
      a.on('mouseMove', (e) => {
        if (coo.current && e && isFinite(e.ra)) coo.current.textContent = `${formatRA(e.ra)} ${formatDec(e.dec)}`
        const o = ov.current.cursor
        o.removeAll()
        if (cb.current.cropMode && e && isFinite(e.ra)) o.add(A.polygon(squareCorners(e.ra, e.dec, cb.current.cropFov)))
      })
      a.on('objectClicked', (obj) => {
        const slug = obj?.data?.slug
        if (slug) cb.current.onPickTarget(slug)
      })
      setReady(true)
    }).catch((e) => setFailed(`The sky map could not start. It needs a browser with WebGL 2. (${e.message || e})`))
    return () => { alive = false; div.innerHTML = ''; aladin.current = null }
  }, [])

  useEffect(() => {
    const a = aladin.current
    if (!ready || !a) return
    const sv = SKY_SURVEYS[survey]
    const layer = A.HiPS(sv.url, { name: sv.name, imgFormat: sv.format })
    a.setBaseImageLayer(layer)
    base.current = layer
  }, [ready, survey])

  // A cube slice only sticks once Aladin has added the layer, so wait for it.
  useEffect(() => {
    if (!ready || survey !== 'spherex') return
    let tries = 0
    let timer = 0
    const apply = () => {
      const layer = base.current
      if (layer?.added && layer.setSliceNumber) layer.setSliceNumber(aladinSlice(layer, slice))
      if (tries++ < 25) timer = setTimeout(apply, 200) // re-apply briefly: Aladin may reset it while loading
    }
    apply()
    return () => clearTimeout(timer)
  }, [ready, survey, slice])

  useEffect(() => {
    const a = aladin.current
    if (!ready || !a || !focus) return
    if (focus.projection) a.setProjection(focus.projection)
    a.gotoRaDec(focus.ra, focus.dec)
    a.setFoV(focus.fov)
  }, [ready, focus])

  useEffect(() => {
    if (!ready) return
    const o = ov.current.region
    o.removeAll()
    if (region) o.add(A.polygon(squareCorners(region.ra, region.dec, region.fov_deg)))
  }, [ready, region])

  useEffect(() => {
    if (!ready) return
    const c = ov.current.targets
    c.removeAll()
    c.addSources(targets.map((t) => A.source(t.ra, t.dec, { name: t.name, slug: t.slug })))
  }, [ready, targets])

  useEffect(() => {
    if (!ready) return
    ov.current.spec.removeAll()
    if (specPoint) ov.current.spec.addSources([A.source(specPoint.ra, specPoint.dec, { name: 'spectrum' })])
  }, [ready, specPoint])

  useEffect(() => {
    if (!ready || cropMode) return
    ov.current.cursor.removeAll()
  }, [ready, cropMode])

  const wholeSky = () => {
    const a = aladin.current
    if (!a) return
    a.setProjection('MOL')
    a.setFoV(360)
  }

  const info = survey === 'spherex' ? sliceInfo(slice) : null

  return (
    <div className={`skyview ${cropMode || spectrumMode ? 'cropping' : ''}`}>
      <div ref={el} className="aladin" />
      {!ready && !failed && <div className="sky-loading"><div className="spinner" /><span>Loading the sky map…</span></div>}
      <div className="sky-hud">
        <button className="ghost" onClick={wholeSky} title="Show the whole sky" disabled={!ready}><FontAwesomeIcon icon={faEarthAmericas} /> Whole sky</button>
        {region && <button className="ghost" disabled={!ready} onClick={() => { const a = aladin.current; a.setProjection('SIN'); a.gotoRaDec(region.ra, region.dec); a.setFoV(Math.max(0.4, region.fov_deg * 5)) }}><FontAwesomeIcon icon={faExpand} /> Back to the patch</button>}
        <span className="sky-label mono cursor-coo" ref={coo} title="Sky position under the mouse (RA, Dec)">move the mouse over the sky</span>
        <span className="sky-label" title="What the map behind shows. Change it under Wavelengths.">
          <FontAwesomeIcon icon={faSatellite} /> {SKY_SURVEYS[survey].name}{info ? <span className="mono"> · {info.wl.toFixed(3)} µm{info.blank ? ' (empty band)' : ''}</span> : null}
        </span>
      </div>
      {spectrumMode && <div className="sky-banner" role="status">Click anywhere to see the 102 infrared colors of that spot · Esc to stop</div>}
      {cropMode && <div className="sky-banner" role="status">Click the sky to open a {(cropFov * 60).toFixed(1)}′ patch · Esc to stop</div>}
      {failed && <div className="sky-banner error" role="alert">{failed}</div>}
    </div>
  )
}
