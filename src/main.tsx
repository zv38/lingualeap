import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import StartupOverlay from './components/startup/StartupOverlay'
import './index.css'
import { initConsoleArt } from './utils/consoleArt'
import { SecurityClient } from './security/SecurityClient'
import { initSentry } from './utils/sentry'
import { registerSW } from 'virtual:pwa-register'

initConsoleArt()
initSentry()

SecurityClient.init({
  enabled: import.meta.env.PROD || import.meta.env.VITE_ENABLE_SECURITY_SDK === 'true',
})

registerSW()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StartupOverlay />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
