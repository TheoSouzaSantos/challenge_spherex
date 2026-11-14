// AI-Assisted: the search panel generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * The search bar that opens from the navbar. Two tabs: find an object or coordinates, or
 * show the sky above a place on Earth (address or latitude/longitude, plus a time).
 */
import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faMagnifyingGlass, faXmark } from '../lib/icons'
import { geocode, zenith } from '../lib/earth'
import { formatDec, formatRA } from '../lib/coords'

const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export default function SearchPanel({ index, onSearch, onTarget, onEarth, onClose }) {
  const [tab, setTab] = useState('sky')
  const [q, setQ] = useState('')
  const [place, setPlace] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [when, setWhen] = useState(() => toLocalInput(new Date()))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submitSky = (e) => { e.preventDefault(); onSearch(q) }

  const submitEarth = async (e) => {
    e.preventDefault()
    setErr('')
    let la = parseFloat(lat), lo = parseFloat(lon), label = `${la.toFixed(2)}°, ${lo.toFixed(2)}°`
    try {
      setBusy(true)
      if (place.trim()) {
        const g = await geocode(place.trim())
        la = g.lat; lo = g.lon; label = g.label.split(',').slice(0, 2).join(',')
        setLat(la.toFixed(4)); setLon(lo.toFixed(4))
      }
      if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90) throw new Error('Enter an address or a latitude/longitude')
      const z = zenith(la, lo, new Date(when))
      onEarth({ ...z, label: `${label} on ${new Date(when).toLocaleString()} (zenith ${formatRA(z.ra)} ${formatDec(z.dec)})` })
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="search-panel" role="dialog" aria-label="Search">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'sky'} className={tab === 'sky' ? 'on' : ''} onClick={() => setTab('sky')}>
          <FontAwesomeIcon icon={faMagnifyingGlass} /> A star or coordinates
        </button>
        <button role="tab" aria-selected={tab === 'earth'} className={tab === 'earth' ? 'on' : ''} onClick={() => setTab('earth')}>
          <FontAwesomeIcon icon={faLocationDot} /> The sky above a place
        </button>
        <button className="icon-btn close" onClick={onClose} aria-label="Close search" title="Close (Esc)"><FontAwesomeIcon icon={faXmark} /></button>
      </div>

      {tab === 'sky' ? (
        <form onSubmit={submitSky}>
          <div className="row">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Star name or coordinates"
              placeholder="Barnard's Star, or 08h55m10.8s -7d14m42s, or 133.795 -7.245" />
            <button className="primary" type="submit" disabled={!q.trim()}>Go</button>
          </div>
          <p className="hint">Coordinates go Right Ascension first, then Declination. Hours and degrees (08h55m10.8s -7d14m42s or 08:55:10.8 -07:14:42) and plain degrees both work.</p>
          <h3 className="eyebrow">Try one of these</h3>
          <div className="chips">
            {index.map((t) => (
              <button key={t.slug} type="button" className="chip" onClick={() => onTarget(t.slug)} title={t.blurb}>
                {t.name}<small>{t.kind === 'variable' ? 'changes brightness' : t.kind === 'galaxy' ? 'stays still' : 'moves'}</small>
              </button>
            ))}
          </div>
        </form>
      ) : (
        <form onSubmit={submitEarth}>
          <div className="row">
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="A city or address, like São Paulo, Brazil" aria-label="City or address" />
          </div>
          <p className="hint or">or exact coordinates</p>
          <div className="row">
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude, e.g. -23.55" aria-label="Latitude" inputMode="decimal" />
            <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude, e.g. -46.63" aria-label="Longitude" inputMode="decimal" />
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date and time" />
          </div>
          <div className="row end">
            <button className="primary" type="submit" disabled={busy || (!place.trim() && (!lat || !lon))}>{busy ? 'Looking it up…' : 'Show that sky'}</button>
          </div>
          <p className="hint">The map turns to the point straight overhead, and its edge becomes your horizon. Addresses are looked up with OpenStreetMap.</p>
          {err && <p className="error" role="alert">{err}</p>}
        </form>
      )}
    </div>
  )
}
