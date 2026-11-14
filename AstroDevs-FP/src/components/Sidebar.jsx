// AI-Assisted: the sidebar component generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The right-hand column, read top to bottom in the order people work: pick a tool, look at the
 * region, move through time, then measure. Each block is a labelled section (Gestalt common region).
 */
import { lazy, Suspense, useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine, faCircleInfo, faCrop, faCrosshairs, faHand, faLayerGroup, faRainbow, faTriangleExclamation } from '../lib/icons'
import Timeline from './Timeline'
import LightCurve from './LightCurve'
import SpectrumChart from './SpectrumChart'
import { DETECTORS, detLabel, hasApi } from '../lib/data'
import { formatDec, formatRA } from '../lib/coords'
import { currentVisitIndex } from '../lib/playback'

// PixiJS only loads once a region is open (Vercel "bundle-dynamic-imports").
const Workspace = lazy(() => import('./Workspace'))

const TOOLS = [
  ['pan', faHand, 'Move', 'Drag to move, scroll to zoom, double-click to reset'],
  ['crop', faCrop, 'Cut out', 'Click the sky map to open that patch (C)'],
  ['track', faCrosshairs, 'Follow', 'Click a star to follow it through every visit (T)'],
  ['curve', faChartLine, 'Brightness', 'Click a star to see its brightness over time'],
  ['spectrum', faRainbow, 'Spectrum', 'Click anywhere, on the map or the patch, to see its 102 colors (S)'],
]
const FOVS = [[0.025, '1.5′'], [0.05, '3′'], [0.08, '4.8′'], [0.1, '6′'], [0.2, '12′']]

const EXPLAIN = [
  ['What am I looking at?', 'Real infrared photos from NASA\'s SPHEREx space telescope, of the same patch of sky, taken months apart. We add the colors: your eyes cannot see this light.'],
  ['Why do things move?', 'Nearby stars drift across the sky as they orbit the galaxy, and Earth\'s trip around the Sun makes close objects wobble a little. A dot that shifts between visits is close to us.'],
  ['The circle with a cross', 'It marks where the star catalogues say the object should be on each date. If the dot follows it, the motion is real, not a glitch.'],
  ['Colors and µm', 'SPHEREx splits infrared light into 102 colors between 0.75 and 5 microns (µm), read by six detectors. Longer wavelengths show colder things, like brown dwarfs.'],
  ['Flagged pixels', 'Pixels the telescope marked as unreliable: saturated bright stars, cosmic-ray hits, reflections. We fill them in from their neighbours so they do not look like holes or new objects. A dot that shows up only once is usually noise.'],
  ['The spectrum', 'Put the 102 colors side by side and you get a spectrum. Cold brown dwarfs get brighter toward 5 µm, and dips can point to water ice, methane or carbon dioxide.'],
]

const TABS = [['curve', 'Brightness'], ['spectrum', 'Spectrum'], ['details', 'Details'], ['explain', 'Explain']]

export default function Sidebar({ s, dispatch, set, stageRef, onPick, onTrackTarget, onExportGif, onTarget, onCancel }) {
  const r = s.region
  const idx = r ? currentVisitIndex(s) : 0
  const visit = r?.visits[idx]
  const renderState = useMemo(() => r && ({
    visitId: visit.id, layers: s.layers, mode: s.mode, overlays: s.overlays,
    track: s.track, curvePoint: s.curvePoint, blend: s.blend,
  }), [r, visit, s.layers, s.mode, s.overlays, s.track, s.curvePoint, s.blend])

  const visible = s.layers.filter((l) => l.visible)
  const primary = visible.at(-1) || s.layers.at(-1)
  const frameInfo = r && primary ? r.detectors.find((d) => d.det === primary.det)?.frames[visit.id] : null
  const trackStats = r && s.track ? trackSummary(r, s.track) : null
  const loading = s.status === 'loading'

  return (
    <aside className="sidebar" aria-label="Region and tools">
      <section className="panel-section toolbar-section" aria-label="Tools">
        <div className="toolbar" role="toolbar" aria-label="Tools">
          {TOOLS.map(([k, icon, label, tip]) => (
            <button key={k} className={`tool ${s.tool === k ? 'on' : ''}`} onClick={() => set({ tool: s.tool === k && k !== 'pan' ? 'pan' : k })} title={tip} aria-pressed={s.tool === k}>
              <FontAwesomeIcon icon={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {s.tool === 'crop' && (
          <label className="inline-select fov" title="How big a patch to cut out. Bigger patches take longer to load live.">
            Size of the patch
            <select value={s.cropFov} onChange={(e) => set({ cropFov: +e.target.value })}>
              {FOVS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
      </section>

      {!r && !loading && (
        <section className="panel-section empty">
          <h2>Pick a patch of sky</h2>
          <p>Search at the top, or choose <b>Cut out</b> and click the map. Not sure where to look? Start with one of these:</p>
          <div className="chips">
            {s.index.map((t) => <button key={t.slug} className="chip" onClick={() => onTarget(t.slug)} title={t.blurb}>{t.name}</button>)}
          </div>
          <p className="muted small">You can also choose <b>Spectrum</b> and click anywhere on the map to see the 102 infrared colors of that spot.</p>
          {!hasApi && <p className="muted small">Opening any other patch needs our live service, which is not connected on this copy. The five above always work.</p>}
        </section>
      )}
      {!r && s.spectrum && (
        <section className="panel-section"><h3 className="eyebrow">Spectrum</h3><SpectrumChart spec={s.spectrum} onClose={() => set({ spectrum: null })} /></section>
      )}
      {loading && (
        <section className="panel-section empty" aria-live="polite">
          <div className="spinner" />
          <p>Gathering the SPHEREx visits of this patch. A new patch can take a minute.</p>
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </section>
      )}
      {s.status === 'error' && (
        <section className="panel-section empty error" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} size="lg" />
          <p>{s.error}</p>
        </section>
      )}

      {r && !loading && (
        <>
          <section className="panel-section region" aria-label="Region">
            <div className="region-head">
              <div>
                <h2>{r.name}</h2>
                <p className="mono coords">{formatRA(r.ra)} {formatDec(r.dec)} · {(r.fov_deg * 60).toFixed(1)}′ wide</p>
              </div>
              {r.simulated && <span className="badge warn" title={r.notes?.[0]}>Simulated</span>}
            </div>
            {r.simulated && (
              <p className="sim-note">This is a simulated sample built from real Gaia star positions, not SPHEREx pixels.</p>
            )}

            <Suspense fallback={<div className="stage-placeholder"><div className="spinner" /></div>}>
              <Workspace meta={r} frames={s.frames} renderState={renderState} tool={s.tool} onPick={onPick} stageRef={stageRef} />
            </Suspense>
            {s.mode === 'diff' && (
              <p className="legend"><i className="sw blue" />fainter now: where it was <i className="sw orange" />brighter now: where it is <span>· against {r.visits[0].date}</span></p>
            )}
            <div className="ws-caption">
              <span><i className="dot" style={{ background: primary ? DETECTORS[primary.det].color : '#fff' }} />
                {primary ? detLabel(primary.det) : ''}{frameInfo?.wl_um ? <span className="mono"> · {frameInfo.wl_um} µm</span> : null}</span>
              <button className="link" onClick={() => set({ drawer: true })}><FontAwesomeIcon icon={faLayerGroup} /> {visible.length === 1 ? '1 layer' : `${visible.length} layers`}</button>
            </div>
          </section>

          <Timeline s={s} set={set} dispatch={dispatch} onExportGif={onExportGif} />

          <section className="panel-section" aria-label="Measure">
            <h3 className="eyebrow">Measure</h3>
            <div className="track-box">
              <button className="ghost" onClick={onTrackTarget} disabled={!r.target?.px}>
                <FontAwesomeIcon icon={faCrosshairs} /> Follow {r.target?.name || 'the target'}
              </button>
              {trackStats ? (
                <span>Moved <b className="mono">{trackStats.measured}″</b> in {trackStats.years} yr
                  {trackStats.predicted !== null && <> · expected <b className="mono">{trackStats.predicted}″</b></>}
                  {' '}<button className="link" onClick={() => set({ track: null })}>clear</button></span>
              ) : <span className="muted small">or choose <b>Follow</b> and click any star</span>}
            </div>

            <div className="tabs small" role="tablist">
              {TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={s.tab === k} className={s.tab === k ? 'on' : ''} onClick={() => set({ tab: k })}>{l}</button>
              ))}
            </div>
            {s.tab === 'curve' && <LightCurve s={s} set={set} />}
            {s.tab === 'spectrum' && (s.spectrum
              ? <SpectrumChart spec={s.spectrum} />
              : <p className="muted small">Choose <b>Spectrum</b> and click a star in the patch, or anywhere on the map.</p>)}
            {s.tab === 'details' && <Details r={r} visit={visit} frameInfo={frameInfo} primary={primary} />}
            {s.tab === 'explain' && (
              <dl className="explain">{EXPLAIN.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
            )}
          </section>
        </>
      )}

      <footer className="credits">
        <FontAwesomeIcon icon={faCircleInfo} /> Built with NASA data: SPHEREx images from NASA/IPAC IRSA and the SPHEREx open data on AWS. Star positions from ESA Gaia DR3. Sky map by Aladin Lite (CDS).
      </footer>
    </aside>
  )
}

function trackSummary(r, track) {
  const ids = r.visits.map((v) => v.id).filter((id) => track[id])
  if (ids.length < 2) return null
  const a = track[ids[0]], b = track[ids.at(-1)]
  const measured = Math.hypot(b[0] - a[0], b[1] - a[1]) * r.pixscale_arcsec
  const va = r.visits.find((v) => v.id === ids[0]), vb = r.visits.find((v) => v.id === ids.at(-1))
  let predicted = null
  const tp = r.target?.px
  if (tp?.[ids[0]] && Math.hypot(tp[ids[0]][0] - a[0], tp[ids[0]][1] - a[1]) < 2) {
    predicted = Math.hypot(tp[ids.at(-1)][0] - tp[ids[0]][0], tp[ids.at(-1)][1] - tp[ids[0]][1]) * r.pixscale_arcsec
  } else {
    const star = r.gaia.find((g) => g.px[ids[0]] && Math.hypot(g.px[ids[0]][0] - a[0], g.px[ids[0]][1] - a[1]) < 1.5)
    if (star) predicted = Math.hypot(star.px[ids.at(-1)][0] - star.px[ids[0]][0], star.px[ids.at(-1)][1] - star.px[ids[0]][1]) * r.pixscale_arcsec
  }
  return {
    measured: measured.toFixed(1),
    predicted: predicted === null ? null : predicted.toFixed(1),
    years: ((vb.mjd - va.mjd) / 365.25).toFixed(1),
  }
}

function Details({ r, visit, frameInfo, primary }) {
  const t = r.target
  const rows = [
    ['Date of this visit', `${visit.date} (MJD ${visit.mjd.toFixed(2)})`],
    ['Detector', primary ? detLabel(primary.det) : '–'],
    ['Wavelength at the target', frameInfo?.wl_um ? `${frameInfo.wl_um} µm${frameInfo.bw_um ? `, ${frameInfo.bw_um} µm wide` : ''}` : 'not available'],
    ['Exposures stacked', frameInfo?.n_exp ?? 'none in this visit'],
    ['Flagged pixels', frameInfo ? `${(frameInfo.flag_frac * 100).toFixed(1)}% per exposure, ${((frameInfo.masked_frac || 0) * 100).toFixed(1)}% in all of them` : '–'],
    ['Pixel size', `${r.pixscale_arcsec}″`],
    ['Data', r.release],
    ['Processed', r.generated_utc],
  ]
  const ph = primary && r.photometry?.[String(primary.det)]?.[visit.id]
  const mode = primary && r.photometry_mode?.[String(primary.det)]
  if (ph) rows.push(['Target brightness', `${ph.flux.toFixed(3)} ± ${ph.err.toFixed(3)} ${r.photometry_unit || ''}${mode ? ' (saturated: ring around the core)' : ''}`])
  if (t) {
    rows.push(['Target motion', `${(Math.hypot(t.pmra, t.pmdec) / 1000).toFixed(2)}″ per year · parallax ${t.plx.toFixed(1)} mas`])
    rows.push(['Expected shift', `${t.predicted_shift_arcsec}″ (${t.predicted_shift_px} px) across these visits`])
    rows.push(['Positions from', t.source])
  }
  return (
    <table className="details"><tbody>
      {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td className={/[0-9]/.test(String(v)) ? 'mono' : ''}>{v}</td></tr>)}
    </tbody></table>
  )
}
