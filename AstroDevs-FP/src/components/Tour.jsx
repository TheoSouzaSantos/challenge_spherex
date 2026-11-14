// AI-Assisted: the guided tour generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * A short guided tour for first-time visitors: a welcome card, then a spotlight on each part of the
 * screen with one or two plain sentences. It can be skipped at any step (button or Esc), and replayed
 * from the "?" button. Shared links open straight to their view without it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const STEPS = [
  { title: 'Watch the infrared sky change' },
  { target: '.search-trigger', title: 'Find something', text: 'Type a star name or sky coordinates here, or the name of a city to see the sky above it. Shortcut: /' },
  { target: '.skyview', title: 'The whole sky', text: 'This is SPHEREx\'s map of the entire sky. Drag to move around and scroll to zoom. The circles are ready-made patches you can click.' },
  { target: '.toolbar', title: 'Your tools', text: 'Move is the default. Cut out opens any patch you click on the map. Follow, Brightness and Spectrum measure what you click.' },
  { target: '.stage', title: 'The patch', text: 'These are real SPHEREx photos of one small piece of sky. The circle with a cross marks where the star should be on each date.' },
  { target: '.timeline', title: 'Move through time', text: 'Press play to loop the visits like a short film. "Compare two dates" flips between two of them; "What changed" paints the difference blue and orange.' },
  { target: '.menu-btn', title: 'Pick the colors', text: 'SPHEREx sees 102 infrared colors. Choose which ones you see, mix them, or put an old date over a new one.' },
  { target: '.tool:nth-child(5)', title: 'Spectrum', text: 'Choose Spectrum, then click any point, on the map or in the patch, to see how bright it is in all 102 colors.' },
  { title: 'That\'s it', text: 'Press the ? button at the top right any time to see this tour again. Clear skies.' },
]

export default function Tour({ step, index, hasRegion, onStart, onStep, onClose }) {
  const s = STEPS[step]
  const card = useRef(null)
  const [rect, setRect] = useState(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const last = step === STEPS.length - 1
  const spot = s.target ? rect : null // derived: steps without a target never show a spotlight

  // Follow the highlighted element (it may appear a moment later, scroll into view, or move on resize).
  useEffect(() => {
    if (!s.target) return
    const el = document.querySelector(s.target)
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    const measure = () => {
      const e = document.querySelector(s.target)
      if (!e) { setRect(null); return }
      const r = e.getBoundingClientRect()
      setRect((old) => (old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height ? old : { top: r.top, left: r.left, width: r.width, height: r.height }))
    }
    const first = requestAnimationFrame(measure)
    const t = setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { cancelAnimationFrame(first); clearInterval(t); window.removeEventListener('resize', measure) }
  }, [s.target, hasRegion])

  // Put the card next to the spotlight, inside the window.
  useLayoutEffect(() => {
    const c = card.current
    if (!c) return
    const w = c.offsetWidth, h = c.offsetHeight, m = 14, W = window.innerWidth, H = window.innerHeight
    const rect = spot
    if (!rect) { setPos({ top: Math.max(m, (H - h) / 2), left: Math.max(m, (W - w) / 2) }); return }
    const cx = rect.left + rect.width / 2 - w / 2, cy = rect.top + rect.height / 2 - h / 2
    const clampX = (x) => Math.min(W - w - m, Math.max(m, x)), clampY = (y) => Math.min(H - h - m, Math.max(m, y))
    let top, left
    if (rect.top + rect.height + m + h <= H - m) { top = rect.top + rect.height + m; left = clampX(cx) }       // below
    else if (rect.top - h - m >= m) { top = rect.top - h - m; left = clampX(cx) }                          // above
    else if (rect.left - w - m >= m) { left = rect.left - w - m; top = clampY(cy) }                         // left
    else if (rect.left + rect.width + m + w <= W - m) { left = rect.left + rect.width + m; top = clampY(cy) } // right
    else { top = clampY(rect.top + 24); left = clampX(rect.left + 24) }                                    // inside a huge area
    setPos({ top, left })
  }, [spot, step])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight' && step > 0) onStep(Math.min(STEPS.length - 1, step + 1))
      else if (e.key === 'ArrowLeft' && step > 1) onStep(step - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [step, onStep, onClose])

  useEffect(() => { card.current?.querySelector('button.primary')?.focus() }, [step])

  if (step === 0) {
    const first = index.find((t) => t.slug === 'barnards-star') || index[0]
    return (
      <div className="tour-dim" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div className="tour-card welcome" ref={card} style={pos}>
          <p className="eyebrow">Welcome to CosmoSight</p>
          <h2 id="tour-title">{s.title}</h2>
          <p>In 1930, Clyde Tombaugh found Pluto by flipping between two photos of the same stars, taken days apart, and spotting the one dot that moved.</p>
          <p>NASA's SPHEREx telescope photographs the whole sky every six months, in 102 shades of infrared light. CosmoSight lets you flip through those photos the same way.</p>
          <div className="tour-actions">
            <button className="primary" onClick={() => onStart(first?.slug)}>Take the 1-minute tour</button>
            <button className="ghost" onClick={onClose}>Skip, I'll explore</button>
          </div>
          <p className="muted small">The tour opens {first?.name || 'a test target'} and shows you around, one part of the screen at a time.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {spot
        ? <div className="tour-spot" style={{ top: spot.top - 6, left: spot.left - 6, width: spot.width + 12, height: spot.height + 12 }} />
        : <div className="tour-dim" />}
      <div className="tour-card" ref={card} style={pos}>
        <p className="eyebrow">Step {step} of {STEPS.length - 1}</p>
        <h2 id="tour-title">{s.title}</h2>
        <p>{s.text}</p>
        <div className="tour-actions">
          {!last && <button className="ghost skip" onClick={onClose}>Skip tour</button>}
          <span className="tour-dots" aria-hidden="true">{STEPS.slice(1).map((_, i) => <i key={i} className={i + 1 === step ? 'on' : ''} />)}</span>
          {step > 1 && <button className="ghost" onClick={() => onStep(step - 1)}>Back</button>}
          <button className="primary" onClick={() => (last ? onClose() : onStep(step + 1))}>{last ? 'Start exploring' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
