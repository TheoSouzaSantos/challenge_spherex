// AI-Assisted: the timeline component generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The time controls under the image. The three things people use most (how to compare, play, which
 * date) are always visible; period, speed, blink pair and overlays sit behind "More controls" so the
 * panel does not ask ten questions at once (Hick's law, progressive disclosure).
 */
import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBackwardStep, faChevronDown, faDownload, faForwardStep, faPause, faPlay, faSliders } from '../lib/icons'
import { currentVisitIndex, nearestWithData, showLabel, visitsWithData } from '../lib/playback'

const MODES = [
  ['animate', 'Time-lapse', 'Play every visit in order', 'A'],
  ['blink', 'Compare two dates', 'Flip between two visits', 'B'],
  ['diff', 'What changed', 'Blue = was here, orange = is here now', 'D'],
]

export default function Timeline({ s, set, dispatch, onExportGif }) {
  const [more, setMore] = useState(false)
  const visits = s.region.visits
  const n = visits.length
  const idx = currentVisitIndex(s)
  const [from, to] = s.range
  const ok = visitsWithData(s.region, s.layers)
  const withData = ok.filter(Boolean).length
  const nth = ok.slice(0, idx + 1).filter(Boolean).length
  const months = Math.round((visits[n - 1].mjd - visits[0].mjd) / 30.44)
  const visitOptions = visits.map((v, i) => <option key={v.id} value={i}>{v.date}</option>)
  const dataOptions = visits.map((v, i) => (ok[i] ? <option key={v.id} value={i}>{v.date}</option> : null))

  return (
    <section className="panel-section timeline" aria-label="Time">
      <h3 className="eyebrow">Time</h3>

      <div className="seg" role="radiogroup" aria-label="How to show the visits">
        {MODES.map(([k, label, tip, key]) => (
          <button key={k} role="radio" aria-checked={s.mode === k} className={s.mode === k ? 'on' : ''}
            onClick={() => set({ mode: k, playing: k === 'diff' ? false : true, ...(k === 'diff' && s.frame === 0 && n > 1 ? { frame: 1 } : {}) })} title={`${tip} (${key})`}>{label}</button>
        ))}
      </div>

      <div className="transport">
        <button className="icon-btn" onClick={() => dispatch({ type: 'step', d: -1 })} aria-label="Previous visit"
          title="Previous visit (←)" disabled={s.mode === 'blink' || idx === ok.indexOf(true)}>
          <FontAwesomeIcon icon={faBackwardStep} />
        </button>
        <button className="play" onClick={() => set({ playing: !s.playing })} aria-label={s.playing ? 'Pause' : 'Play'} title="Play / pause (space)" disabled={n < 2}>
          <FontAwesomeIcon icon={s.playing ? faPause : faPlay} />
        </button>
        <button className="icon-btn" onClick={() => dispatch({ type: 'step', d: 1 })} aria-label="Next visit"
          title="Next visit (→)" disabled={s.mode === 'blink' || idx === ok.lastIndexOf(true)}>
          <FontAwesomeIcon icon={faForwardStep} />
        </button>
        <div className="now" aria-live="polite">
          <strong className="mono">{visits[idx].date}</strong>
          <span>Visit {nth} of {withData}{withData < n ? ' in this band' : ''}{n > 1 ? ` · ${months} months of sky` : ''}</span>
        </div>
      </div>

      <div className="track">
        <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={s.frame} disabled={s.mode === 'blink' || n < 2}
          onChange={(e) => set({ frame: nearestWithData(ok, +e.target.value), playing: false })} aria-label="Pick a visit" />
        <div className="ticks" aria-hidden="true">
          {visits.map((v, i) => (
            <span key={v.id} className={`${i < from || i > to ? 'out' : ''} ${i === idx ? 'cur' : ''} ${ok[i] ? '' : 'nodata'}`}
              style={{ left: n > 1 ? `${(i / (n - 1)) * 100}%` : '50%' }}>{showLabel(i, n) || i === idx ? v.date.slice(0, 7) : ''}</span>
          ))}
        </div>
      </div>

      {s.mode === 'blink' && (
        <div className="row-controls">
          <label>Flip <select value={s.blinkA} onChange={(e) => set({ blinkA: +e.target.value })}>{dataOptions}</select></label>
          <label>and <select value={s.blinkB} onChange={(e) => set({ blinkB: +e.target.value })}>{dataOptions}</select></label>
        </div>
      )}

      <div className="row-controls">
        <button className={`ghost ${more ? 'on' : ''}`} onClick={() => setMore(!more)} aria-expanded={more}>
          <FontAwesomeIcon icon={faSliders} /> More controls <FontAwesomeIcon icon={faChevronDown} className={more ? 'flip' : ''} />
        </button>
        <button className="ghost push" onClick={onExportGif} disabled={n < 2} title="Download this loop as an animated GIF">
          <FontAwesomeIcon icon={faDownload} /> Save GIF
        </button>
      </div>

      {more && (
        <div className="more">
          {s.mode === 'blink' ? (
            <label className="slider-row">Flip every <input type="range" min={150} max={1500} step={50} value={s.blinkMs}
              onChange={(e) => set({ blinkMs: +e.target.value })} /> <span className="mono">{(s.blinkMs / 1000).toFixed(2)} s</span></label>
          ) : (
            <>
              <div className="row-controls">
                <label>From <select value={from} onChange={(e) => { const a = +e.target.value; set({ range: [a, Math.max(a, to)], frame: a }) }}>{visitOptions}</select></label>
                <label>to <select value={to} onChange={(e) => { const b = +e.target.value; set({ range: [Math.min(from, b), b], frame: Math.min(from, b) }) }}>{visitOptions}</select></label>
              </div>
              <label className="slider-row">Speed <input type="range" min={0.5} max={8} step={0.5} value={s.fps}
                onChange={(e) => set({ fps: +e.target.value })} /> <span className="mono">{s.fps} frames/s</span></label>
            </>
          )}
          <fieldset className="checks">
            <legend className="eyebrow">Show on the image</legend>
            <label><input type="checkbox" checked={s.overlays.target} onChange={(e) => dispatch({ type: 'overlay', patch: { target: e.target.checked } })} /> Where the target should be</label>
            <label><input type="checkbox" checked={s.overlays.gaia} onChange={(e) => dispatch({ type: 'overlay', patch: { gaia: e.target.checked } })} /> Gaia catalogue stars ({s.region.gaia.length})</label>
            <label title="Pixels the mission flagged as unreliable: saturated star cores, cosmic rays, dead pixels. In the picture they are filled in from their neighbours.">
              <input type="checkbox" checked={s.overlays.mask} onChange={(e) => dispatch({ type: 'overlay', patch: { mask: e.target.checked } })} /> Flagged pixels
            </label>
          </fieldset>
        </div>
      )}
    </section>
  )
}
