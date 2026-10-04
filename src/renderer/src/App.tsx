import { useEffect } from 'react'

import ErrorBoundary from './components/common/ErrorBoundary'
import CommandPalette from './components/common/CommandPalette'
import { IconErrorMark } from './components/common/icons'
import DataNoticeBanner from './components/layout/DataNoticeBanner'
import FeedbackStrip from './components/layout/FeedbackStrip'
import ExternalDropZone from './components/layout/ExternalDropZone'
import LoadingScreen from './components/layout/LoadingScreen'
import OnboardingCard from './components/layout/OnboardingCard'
import TabBar from './components/layout/TabBar'
import TitleBar from './components/layout/TitleBar'
import Modal from './components/modals/Modal'
import ContentRouter from './components/sections/ContentRouter'
import { useI18n } from './hooks/use-i18n'
import { useAppShortcuts } from './hooks/use-app-shortcuts'
import { useDataStatus } from './hooks/use-data-status'
import { useUndoShortcut } from './hooks/use-undo-shortcut'
import { useWindowPresentation } from './hooks/use-window-presentation'
import { usePeekInteraction } from './hooks/use-peek-interaction'
import { HTML_LANG } from './i18n/resolve-lang'
import { useAppStore } from './store/use-app-store'
import { applyMotionTokens } from './utils/motion-tokens'
import {
  getBackgroundUiVariables,
  resolveBackground,
  resolveTheme,
} from './styles/background-theme'

export default function App(): JSX.Element {
  const data = useAppStore((state) => state.data)
  const loading = useAppStore((state) => state.loading)
  const loadData = useAppStore((state) => state.loadData)
  const showToast = useAppStore((state) => state.showToast)
  const currentTab = useAppStore((state) => state.currentTab)
  const error = useAppStore((state) => state.error)
  // The open settings dialog previews appearance changes before they are saved.
  const preview = useAppStore((state) => state.previewPrefs)
  const { t, lang } = useI18n()
  useAppShortcuts()
  useUndoShortcut()
  useDataStatus()
  useWindowPresentation()
  usePeekInteraction()
  const motion = preview?.motion ?? data?.prefs.motion
  const theme = resolveTheme(preview?.theme ?? data?.prefs.theme)
  const background = resolveBackground(
    preview?.background ?? data?.prefs.background
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Screen readers pick the voice (and the browser the letterforms) by the document language.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang]
  }, [lang])

  useEffect(() => {
    if (motion === undefined) {
      return
    }

    applyMotionTokens(document.documentElement, motion)
  }, [motion])

  useEffect(() => {
    const targets = [document.documentElement, document.body]
    const backgroundVars = getBackgroundUiVariables(theme, background)

    for (const target of targets) {
      target.classList.remove('theme-light', 'theme-dark')
      target.classList.add(`theme-${theme}`)
      target.dataset.theme = theme
      target.dataset.background = background

      for (const [key, value] of Object.entries(backgroundVars)) {
        target.style.setProperty(key, value)
      }
    }

    return () => {
      for (const target of targets) {
        target.classList.remove('theme-light', 'theme-dark')
        delete target.dataset.theme
        delete target.dataset.background

        for (const key of Object.keys(backgroundVars)) {
          target.style.removeProperty(key)
        }
      }
    }
  }, [background, theme])

  if (!loading && !data && error) {
    return (
      <div className="load-error">
        <IconErrorMark size={32} />
        <strong>{t('errorBoundary.title')}</strong>
        <p>{error}</p>
        <button className="primary-button" onClick={() => void loadData()}>
          {t('errorBoundary.retry')}
        </button>
      </div>
    )
  }
  if (loading || !data) {
    return <LoadingScreen />
  }

  return (
    <div
      className={`app-root theme-${theme}`}
      data-testid="app-root"
      data-current-tab={currentTab}
      data-background={background}
      style={
        {
          ...getBackgroundUiVariables(theme, background),
          zoom: preview?.zoom ?? data.prefs.zoom,
        } as React.CSSProperties
      }
    >
      <div className="app-shell">
        <ErrorBoundary
          detail={t('errorBoundary.detail')}
          retryLabel={t('errorBoundary.retry')}
          title={t('errorBoundary.title')}
          onError={() => {
            showToast(t('errorBoundary.detail'), 'danger')
          }}
        >
          <TitleBar />
          <DataNoticeBanner />
          <TabBar />
          <OnboardingCard />
          <div className="workspace">
            <main className="workspace-content">
              <ContentRouter />
            </main>
          </div>
        </ErrorBoundary>
        {/* After the boundary, so a message about a crashed view is not swept away with it. */}
        <FeedbackStrip />
      </div>
      <Modal />
      <CommandPalette />
      <ExternalDropZone />
    </div>
  )
}
