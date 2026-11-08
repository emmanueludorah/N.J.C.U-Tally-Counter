import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Production only: saved files would hide code changes during development.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // When a new version takes over from an older one, reload once so the
  // phone runs the latest code instead of the old saved copy.
  if (navigator.serviceWorker.controller) {
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The site still works online if offline support can't be set up.
    })
  })
}
