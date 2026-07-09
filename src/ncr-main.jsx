import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import NCRApp from './NCRApp.jsx'

createRoot(document.getElementById('ncr-root')).render(
  <StrictMode>
    <NCRApp />
  </StrictMode>,
)
