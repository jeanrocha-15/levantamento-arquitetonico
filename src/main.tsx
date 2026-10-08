import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { registerOffline } from './offline'
import './theme.css'
import './styles.css'
import './workspace.css'
import './interface.css'
import { applyTheme, loadTheme } from './theme'
applyTheme(loadTheme())
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>)
registerOffline()

