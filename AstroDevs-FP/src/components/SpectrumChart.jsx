// AI-Assisted: the spectrum chart generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The 102-band SPHEREx spectrum of one point on the sky (0.75-5 µm), coloured by detector.
 * Gaps are bands with no valid data there: the two blank dichroic channels, or a saturated bright star.
 */
import { DETECTORS } from '../lib/data'
import { formatDec, formatRA } from '../lib/coords'

export default function SpectrumChart({ spec, onClose }) {
  if (!spec) return null
  if (spec.status === 'loading') {
    return <div className="spectrum"><div className="spinner small" /><p className="muted small">Reading 102 bands from the SPHEREx all-sky cube on AWS…</p></div>
  }
  if (spec.status === 'error') return <div className="spectrum"><p className="error">{spec.error}</p></div>

  const d = spec.data
  const pts = d.points.filter((p) => p.value !== null)
  const W = 440, H = 190, P = { l: 46, r: 10, t: 12, b: 28 }
  const x0 = 0.7, x1 = 5.05
  const vals = pts.map((p) => p.value)
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (!pts.length) { lo = 0; hi = 1 }
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1
  lo -= pad; hi += pad
  const X = (w) => P.l + ((w - x0) / (x1 - x0)) * (W - P.l - P.r)
  const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
  const missing = d.points.length - pts.length
  const yticks = [lo + pad, (lo + hi) / 2, hi - pad]

  return (
    <div className="spectrum">
      <div className="spec-head">
        <span>{spec.label || 'Spectrum'} · <span className="mono">{formatRA(d.ra)} {formatDec(d.dec)}</span></span>
        {onClose && <button className="link" onClick={onClose}>close</button>}
      </div>
      {pts.length === 0 ? (
        <p className="muted">No valid data at this spot. Very bright stars saturate SPHEREx, so their cores are blank in every band.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="SPHEREx spectrum">
          {yticks.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} className="grid" />
              <text x={P.l - 6} y={Y(t) + 4} textAnchor="end" className="axis">{fmt(t)}</text>
            </g>
          ))}
          {[1, 2, 3, 4, 5].map((w) => <text key={w} x={X(w)} y={H - 10} textAnchor="middle" className="axis">{w} µm</text>)}
          <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" className="axis-title">Brightness ({d.unit})</text>
          {[1, 2, 3, 4, 5, 6].map((det) => {
            const seg = d.points.filter((p) => p.det === det)
            const parts = []
            let cur = []
            for (const p of seg) {
              if (p.value === null) { if (cur.length) parts.push(cur); cur = [] } else cur.push(p)
            }
            if (cur.length) parts.push(cur)
            return (
              <g key={det} style={{ color: DETECTORS[det].color }}>
                {parts.map((pp, i) => <polyline key={i} fill="none" stroke="currentColor" strokeWidth="1.4" points={pp.map((p) => `${X(p.wl_um)},${Y(p.value)}`).join(' ')} />)}
                {seg.filter((p) => p.value !== null).map((p) => (
                  <circle key={p.plane} cx={X(p.wl_um)} cy={Y(p.value)} r="2.4" fill="currentColor">
                    <title>{`${p.wl_um.toFixed(3)} µm (±${(p.bw_um / 2).toFixed(3)}) · D${p.det} · ${p.value.toPrecision(3)} ${d.unit}${p.nhits ? ` · ${p.nhits} exposures` : ''}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}
        </svg>
      )}
      <p className="muted small">How bright this spot is in each of SPHEREx's 102 infrared colors, from short (left) to long (right) wavelengths.</p>
      <details className="small muted">
        <summary>About this data</summary>
        <p>Surface brightness of one ~13″ pixel of the SPHEREx DR1 all-sky cube, read live from NASA's open data bucket on AWS. It averages the whole survey, so it does not change with the timeline.
        {missing > 0 && ` ${missing} of 102 bands have no valid data here${missing > 2 ? ', usually because a bright star saturates the detector' : ': the two channels at the edge of a filter, which are empty by design'}.`}</p>
      </details>
    </div>
  )
}

function fmt(v) {
  const a = Math.abs(v)
  return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : a >= 0.01 ? v.toFixed(3) : v.toExponential(1)
}
