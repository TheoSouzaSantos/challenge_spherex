// AI-Assisted: the app entry point generated with Claude Code (Anthropic) and reviewed by the team.
/**
 * Entry point. We skip React StrictMode on purpose: Aladin Lite and PixiJS each own a WebGL
 * context that must be created exactly once, and StrictMode mounts components twice in development.
 */
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
