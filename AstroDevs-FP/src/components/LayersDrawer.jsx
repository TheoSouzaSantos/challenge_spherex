// AI-Assisted: the layers drawer generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The panel behind the hamburger button: pick which wavelengths and which dates are on screen,
 * mix them, and tune opacity and contrast per layer. It also picks the sky-map background band.
 * Quick recipes come first, fine tuning per layer below (most-used first).
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowDown, faArrowUp, faPlus, faRotateLeft, faTrashCan, faXmark } from '../lib/icons'
import { makeLayer } from '../lib/layers'
import { BLANK_SLICES, DETECTORS, SKY_SURVEYS, detLabel, skipBlankSlice, sliceInfo } from '../lib/data'

export default function LayersDrawer({ open, s, dispatch, set }) {
  const region = s.region
  const dets = region ? region.detectors.map((d) => d.det) : []
  const visits = region?.visits || []
  const patch = (id, p) => dispatch({ type: 'layer', id, patch: p })
  const setLayers = (layers) => set({ layers })

  const move = (i, d) => {
    const l = [...s.layers]
    const j = i + d
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    setLayers(l)
  }

  const presets = region && [
    { label: 'One color', title: 'A single wavelength, in white', make: () => [makeLayer(s.layers.at(-1)?.det || dets[0])] },
    { label: 'All colors', title: 'Each wavelength gets its own color: short = blue, long = red', make: () => dets.map((d) => makeLayer(d, { color: DETECTORS[d].color, opacity: 0.85 })) },
    {
      label: 'Then vs now', title: 'First visit in blue, the playing visit in orange. Anything that moved shows up in two colors.',
      make: () => {
        const d = s.layers.at(-1)?.det || dets[0]
        return [makeLayer(d, { epoch: visits[0].id, color: '#3d8bff' }), makeLayer(d, { color: '#ffb347' })]
      },
    },
  ]

  const info = sliceInfo(s.slice)

  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-label="Wavelengths and layers" aria-hidden={!open} inert={open ? undefined : ''}>
      <div className="drawer-head">
        <h2>Wavelengths</h2>
        <button className="icon-btn" onClick={() => set({ drawer: false })} aria-label="Close" title="Close (Esc)">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {!region && <p className="muted">Open a patch of sky first. Then you can choose which infrared colors to see, and from which dates.</p>}

      {region && (
        <>
          <section className="panel-section">
            <h3 className="eyebrow">Quick recipes</h3>
            <div className="presets">
              {presets.map((p) => <button key={p.label} className="ghost" title={p.title} onClick={() => setLayers(p.make())}>{p.label}</button>)}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-row">
              <h3 className="eyebrow">Layers, top first</h3>
              <label className="inline-select">
                Mix
                <select value={s.blend} onChange={(e) => set({ blend: e.target.value })} aria-label="How layers mix">
                  <option value="add">Add light</option>
                  <option value="screen">Soft</option>
                  <option value="normal">Cover</option>
                </select>
              </label>
            </div>
            <ol className="layer-list">
              {s.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
                <li key={l.id} className={`layer ${l.visible ? '' : 'off'}`}>
                  <div className="layer-row">
                    <input type="checkbox" checked={l.visible} onChange={(e) => patch(l.id, { visible: e.target.checked })} aria-label="Show this layer" />
                    <input type="color" value={l.color} onChange={(e) => patch(l.id, { color: e.target.value })} aria-label="Layer color" />
                    <select value={l.det} onChange={(e) => patch(l.id, { det: +e.target.value })} aria-label="Wavelength">
                      {dets.map((d) => <option key={d} value={d}>{detLabel(d)}</option>)}
                    </select>
                    <div className="layer-actions">
                      <button className="icon-btn sm" onClick={() => move(i, 1)} aria-label="Move up" title="Move up" disabled={i === s.layers.length - 1}><FontAwesomeIcon icon={faArrowUp} /></button>
                      <button className="icon-btn sm" onClick={() => move(i, -1)} aria-label="Move down" title="Move down" disabled={i === 0}><FontAwesomeIcon icon={faArrowDown} /></button>
                      <button className="icon-btn sm" onClick={() => setLayers(s.layers.filter((x) => x.id !== l.id))} aria-label="Remove layer" title="Remove" disabled={s.layers.length === 1}><FontAwesomeIcon icon={faTrashCan} /></button>
                    </div>
                  </div>
                  <p className="layer-hint">{DETECTORS[l.det].hint}</p>
                  <label className="field">
                    <span>Date</span>
                    <select value={l.epoch} onChange={(e) => patch(l.id, { epoch: e.target.value })}>
                      <option value="follow">Follows the timeline</option>
                      {visits.map((v, k) => <option key={v.id} value={v.id}>Always visit {k + 1} ({v.date})</option>)}
                    </select>
                  </label>
                  <Slider label="Opacity" min={0} max={1} step={0.01} value={l.opacity} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch(l.id, { opacity: v })} />
                  <Slider label="Shadows" min={0} max={250} step={1} value={l.black} onChange={(v) => patch(l.id, { black: Math.min(v, l.white - 5) })} />
                  <Slider label="Highlights" min={5} max={255} step={1} value={l.white} onChange={(v) => patch(l.id, { white: Math.max(v, l.black + 5) })} />
                  <Slider label="Midtones" min={0.3} max={3} step={0.05} value={l.gamma} fmt={(v) => v.toFixed(2)} onChange={(v) => patch(l.id, { gamma: v })} />
                  <button className="link" onClick={() => patch(l.id, { black: 0, white: 255, gamma: 1, opacity: 1 })}>
                    <FontAwesomeIcon icon={faRotateLeft} /> Reset
                  </button>
                </li>
              ))}
            </ol>
            <button className="ghost wide" onClick={() => setLayers([...s.layers, makeLayer(dets.find((d) => !s.layers.some((l) => l.det === d)) || dets[0], { opacity: 0.8 })])}>
              <FontAwesomeIcon icon={faPlus} /> Add a layer
            </button>
          </section>
        </>
      )}

      <section className="panel-section">
        <h3 className="eyebrow">Sky map behind</h3>
        <div className="radio-col">
          {Object.entries(SKY_SURVEYS).map(([k, v]) => (
            <label key={k}><input type="radio" name="survey" checked={s.survey === k} onChange={() => set({ survey: k })} /> {v.name}</label>
          ))}
        </div>
        {s.survey === 'spherex' && (
          <Slider label={`Band ${s.slice + 1} of 102 · ${info.wl.toFixed(3)} µm`} min={0} max={101} step={1}
            value={s.slice} onChange={(v) => set({ slice: skipBlankSlice(v, s.slice) })} fmt={() => ''} />
        )}
        {s.survey === 'spherex' && <p className="muted small">Bands {BLANK_SLICES.map((b) => b + 1).join(' and ')} are skipped: they sit on the edge between two filters and hold no data.</p>}
        <p className="muted small">The map is SPHEREx's average of the whole survey. The time-lapse comes from the separate visits of the patch you open.</p>
      </section>
    </aside>
  )
}

function Slider({ label, min, max, step, value, onChange, fmt = (v) => v }) {
  return (
    <label className="field">
      <span>{label} <em className="mono">{fmt(value)}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}
