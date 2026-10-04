import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import { IconProvider } from './components/common/icons'
import RootErrorBoundary from './components/common/RootErrorBoundary'
import DockBubble from './components/layout/DockBubble'
import './styles/global.css'
import './styles/workspace.css'
import './styles/code.css'
import './styles/collection.css'
import './styles/tasks.css'
import './styles/item-editor.css'
import './styles/motion.css'
import './styles/dock.css'
import './styles/data-notice.css'
import './styles/entry-icon.css'
import './styles/icon-picker.css'
import './styles/chrome.css'
import './styles/feedback.css'
import './styles/onboarding.css'
import { HTML_LANG } from './i18n/resolve-lang'
import { getStartupParams } from './utils/startup-params'

// The first frame already reads in the saved language and wears the saved theme (the main process
// puts both in the URL), so the loading screen does not change colour when the data arrives.
const startup = getStartupParams()
if (startup.lang) document.documentElement.lang = HTML_LANG[startup.lang]
if (startup.theme)
  for (const target of [document.documentElement, document.body])
    target.classList.add(`theme-${startup.theme}`)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <IconProvider>
      {new URLSearchParams(window.location.search).get('view') === 'dock' ? (
        <RootErrorBoundary compact>
          <DockBubble />
        </RootErrorBoundary>
      ) : (
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      )}
    </IconProvider>
  </React.StrictMode>
)
