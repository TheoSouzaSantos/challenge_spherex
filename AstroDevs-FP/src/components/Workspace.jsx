// AI-Assisted: the workspace component generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * React wrapper around the PixiJS stage: mounts it once, hands it the current state, and turns
 * mouse actions into pan (drag), zoom (wheel), reset (double-click) and picks (Track / Brightness tools).
 */
import { useEffect, useRef, useState } from 'react'
import { Stage } from '../lib/stage'

const SIZE = 520

export default function Workspace({ meta, frames, renderState, tool, onPick, stageRef }) {
  const host = useRef(null)
  const stage = useRef(null)
  const last = useRef(renderState)
  const drag = useRef(null)
  const [ready, setReady] = useState(false)
  const [notes, setNotes] = useState([])
  const [failed, setFailed] = useState('')
  const [scale, setScale] = useState(0)

  useEffect(() => {
    let alive = true
    const st = new Stage()
    st.init(host.current, SIZE).then(() => {
      if (!alive) { st.destroy(); return }
      stage.current = st
      stageRef.current = st
      setReady(true)
    }).catch((e) => setFailed(e.message || 'WebGL is not available'))
    return () => {
      alive = false
      if (stage.current) { stage.current.destroy(); stage.current = null; stageRef.current = null }
    }
  }, [stageRef])

  useEffect(() => {
    if (ready && meta && frames) stage.current.setRegion(meta, frames)
  }, [ready, meta, frames])

  useEffect(() => {
    last.current = renderState
    if (ready && meta && frames) {
      setNotes(stage.current.render(renderState))
      setScale(stage.current.scale)
    }
  }, [ready, meta, frames, renderState])

  const rerender = () => {
    if (!stage.current) return
    stage.current.render(last.current)
    setScale(stage.current.scale)
  }

  const local = (e) => {
    const r = host.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const onPointerDown = (e) => {
    host.current.setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    drag.current = { x, y, moved: false }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || !stage.current) return
    const [x, y] = local(e)
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < 4) return
    d.moved = true
    stage.current.pan(x - d.x, y - d.y)
    d.x = x
    d.y = y
    rerender()
  }
  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || !stage.current) return
    if (tool === 'track' || tool === 'curve' || tool === 'spectrum') {
      const [x, y] = local(e)
      onPick(...stage.current.toImage(x, y))
    }
  }
  const onWheel = (e) => {
    if (!stage.current) return
    e.preventDefault()
    const [x, y] = local(e)
    // proportional to the wheel/trackpad movement, so a mouse notch and a trackpad flick both feel natural
    stage.current.zoomAt(x, y, Math.min(2, Math.max(0.5, Math.exp(-e.deltaY * 0.0015))))
    rerender()
  }

  useEffect(() => {
    const h = host.current
    h.addEventListener('wheel', onWheel, { passive: false })
    return () => h.removeEventListener('wheel', onWheel)
  })

  const scaleBar = meta && scale ? barFor(meta, scale) : null

  return (
    <div className="workspace">
      <div
        ref={host} className={`stage tool-${tool}`} style={{ width: SIZE, height: SIZE }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onDoubleClick={() => { stage.current?.resetView(); rerender() }}
        role="img" aria-label="Selected sky region"
      />
      {scaleBar && (
        <div className="scalebar" style={{ width: scaleBar.px }}><span>{scaleBar.label}</span></div>
      )}
      <div className="compass" aria-hidden="true"><span className="n">N</span><span className="e">E</span></div>
      {meta?.simulated && <div className="watermark" aria-hidden="true">SIMULATED DATA · not SPHEREx pixels</div>}
      {notes.length > 0 && <div className="stage-note">{[...new Set(notes)].join(' · ')}</div>}
      {failed && <div className="stage-note error">{failed}</div>}
    </div>
  )
}

function barFor(meta, scale) {
  const pxPerArcsec = scale / meta.pixscale_arcsec
  for (const arcsec of [5, 10, 15, 30, 60, 120, 300, 600]) {
    const px = arcsec * pxPerArcsec
    if (px >= 50) return { px, label: arcsec >= 60 ? `${arcsec / 60}′` : `${arcsec}″` }
  }
  return null
}
