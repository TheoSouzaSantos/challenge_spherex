// AI-Assisted: the light-curve chart generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Brightness over time. By default it plots the target at its predicted position in each
 * visit (computed by the pipeline). With the Brightness tool the user can click any star and
 * we measure it in the browser instead.
 */
import { DETECTORS } from '../lib/data'
import { aperture } from '../lib/measure'
import { showLabel } from '../lib/playback'

export default function LightCurve({ s, set }) {
  const { region, frames, curvePoint } = s
  const visits = region.visits
  const series = []
  for (const d of region.detectors) {
    const pts = []
    for (const v of visits) {
      let f = null
      if (curvePoint) {
        const g = frames.gray[d.det]?.[v.id]
        if (g) f = aperture(g, d.stretch, region.width, region.height, curvePoint[0], curvePoint[1])
      } else {
        f = region.photometry?.[String(d.det)]?.[v.id]?.flux ?? null // mJy (pipeline aperture photometry)
      }
      if (f !== null && isFinite(f)) pts.push({ mjd: v.mjd, date: v.date, f, unit: curvePoint ? '' : region.photometry_unit || '' })
    }
    const pos = pts.map((p) => p.f).filter((x) => x > 0).sort((a, b) => a - b)
    if (pts.length < 2 || !pos.length) continue
    const med = pos[pos.length >> 1]
    series.push({ det: d.det, pts: pts.map((p) => ({ ...p, r: p.f / med })) })
  }

  const W = 440, H = 170, P = { l: 40, r: 10, t: 10, b: 26 }
  const t0 = visits[0].mjd, t1 = visits[visits.length - 1].mjd || t0 + 1
  const rs = series.flatMap((s2) => s2.pts.map((p) => p.r))
  const lo = Math.min(0.5, ...rs), hi = Math.max(1.5, ...rs)
  const X = (mjd) => P.l + ((mjd - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r)
  const Y = (r) => P.t + (1 - (r - lo) / (hi - lo)) * (H - P.t - P.b)
  const ticks = [lo, 1, hi].map((v) => +v.toFixed(2))

  return (
    <div className="lightcurve">
      <p className="muted small">
        {curvePoint
          ? 'Brightness at the point you clicked (yellow circle), relative to its typical value. Measured from the displayed frames, so treat it as approximate.'
          : `Brightness of ${region.target?.name || 'the target'} at its predicted position in each visit, relative to its typical value.${Object.keys(region.photometry_mode || {}).length ? ' The star saturates the detector, so we measure the ring of light around its core: the ups and downs are real, the absolute level is low.' : ''}`}
        {' '}Use the <b>Brightness</b> tool and click any star to measure it instead.
      </p>
      {series.length === 0 ? (
        <p className="muted">Not enough measurements here. Click a brighter star with the Brightness tool.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Light curve">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} className={t === 1 ? 'grid mid' : 'grid'} />
              <text x={P.l - 6} y={Y(t) + 4} textAnchor="end" className="axis">{t}×</text>
            </g>
          ))}
          {visits.map((v, i) => showLabel(i, visits.length) && <text key={v.id} x={X(v.mjd)} y={H - 8} textAnchor={i === 0 ? 'start' : i === visits.length - 1 ? 'end' : 'middle'} className="axis">{v.date.slice(0, 7)}</text>)}
          {series.map((sr) => (
            <g key={sr.det} style={{ color: DETECTORS[sr.det].color }}>
              <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={sr.pts.map((p) => `${X(p.mjd)},${Y(p.r)}`).join(' ')} />
              {sr.pts.map((p) => (
                <circle key={p.mjd} cx={X(p.mjd)} cy={Y(p.r)} r="3.5" fill="currentColor">
                  <title>{`D${sr.det} · ${p.date} · ${p.r.toFixed(2)}×${p.unit ? ` · ${p.f.toFixed(3)} ${p.unit}` : ''}`}</title>
                </circle>
              ))}
            </g>
          ))}
        </svg>
      )}
      <div className="legend-row">
        {series.map((sr) => <span key={sr.det}><i className="dot" style={{ background: DETECTORS[sr.det].color }} />D{sr.det}</span>)}
        {curvePoint && <button className="link" onClick={() => set({ curvePoint: null })}>Back to target</button>}
      </div>
    </div>
  )
}
