// AI-Assisted: the navbar generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Top bar: the layers (hamburger) button on the left, the search button in the middle,
 * and data-status badges plus help on the right.
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faCircleQuestion, faMagnifyingGlass } from '../lib/icons'

// Hoisted static JSX (Vercel "rendering-hoist-jsx"): the mark never changes.
const mark = (
  <svg className="brand-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <ellipse cx="11" cy="11" rx="10" ry="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="11" cy="11" r="3.1" fill="currentColor" />
    <circle cx="18.2" cy="4" r="1.2" fill="var(--lamp)" />
  </svg>
)

export default function Navbar({ drawerOpen, onMenu, onSearch, searchOpen, region, onHelp }) {
  return (
    <header className="navbar">
      <div className="nav-left">
        <button className={`menu-btn ${drawerOpen ? 'on' : ''}`} onClick={onMenu} aria-label="Wavelengths and layers"
          title="Choose which infrared colors and dates you see (L)" aria-expanded={drawerOpen}>
          <FontAwesomeIcon icon={faBars} /> <span>Wavelengths</span>
        </button>
        <a className="brand" href="./" aria-label="CosmoSight home">
          {mark}
          <span className="brand-name">CosmoSight</span>
        </a>
      </div>

      <button className={`search-trigger ${searchOpen ? 'on' : ''}`} onClick={onSearch} aria-expanded={searchOpen} title="Search (/)">
        <FontAwesomeIcon icon={faMagnifyingGlass} />
        <span>Find a star, a coordinate or a place on Earth</span>
        <kbd>/</kbd>
      </button>

      <div className="nav-right">
        {region?.simulated && <span className="badge warn" title={region.notes?.[0]}>Simulated sample</span>}
        {region && !region.simulated && <span className="status" title={`${region.release} · processed ${region.generated_utc}`}><i className="dot ok" />Real SPHEREx data · {region.offline ? 'offline copy' : region.live ? 'live' : 'saved copy'}</span>}
        <button className="icon-btn" onClick={onHelp} aria-label="How CosmoSight works" title="How it works">
          <FontAwesomeIcon icon={faCircleQuestion} />
        </button>
      </div>
    </header>
  )
}
