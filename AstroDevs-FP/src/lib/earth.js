// AI-Assisted: the sky-from-Earth helpers generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * "What is straight above me right now?" - turns a place on Earth and a time into the RA/Dec
 * of the zenith, so the sky map can show the half of the sky that place can see.
 */
/** Zenith (RA, Dec) in degrees. Ignores precession/nutation (<0.4° in 2026), fine for pointing the sky map. */
export function zenith(lat, lon, date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const d = jd - 2451545.0
  const t = d / 36525
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000
  const lst = (((gmst + lon) % 360) + 360) % 360
  return { ra: lst, dec: lat }
}

/** Address -> {lat, lon, label} via OpenStreetMap Nominatim (light, user-triggered use only). */
export async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Geocoding failed (${r.status})`)
  const [hit] = await r.json()
  if (!hit) throw new Error('Address not found')
  return { lat: +hit.lat, lon: +hit.lon, label: hit.display_name }
}
