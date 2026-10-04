import { IconClose, IconPin, IconSearch, IconSettings } from '../common/icons'
import brandIcon from '../../assets/marubako-small.svg'

import { useI18n } from '../../hooks/use-i18n'
import { useLayoutMode } from '../../hooks/use-layout-mode'
import { useAppStore } from '../../store/use-app-store'
import SectionActions from './SectionActions'

/**
 * The window row: search, the area that drags the window, pin, settings and the two ways out. While
 * the window is too narrow for the tabs to carry icon and name side by side, "new group" and "add"
 * sit beside the search; wider, they move to the category row.
 */
export default function TitleBar(): JSX.Element {
  const { t } = useI18n()
  const { tabMode, searchMode } = useLayoutMode()
  const setModal = useAppStore((state) => state.setModal)
  const setCommandOpen = useAppStore((state) => state.setCommandOpen)
  const hideWindow = useAppStore((state) => state.hideWindow)
  const toggleCollapse = useAppStore((state) => state.toggleCollapse)
  const togglePin = useAppStore((state) => state.togglePin)
  const windowState = useAppStore((state) => state.windowState)
  // With the ball turned off, collapsing goes to the tray, so the labels must not promise a ball.
  const hasBubble = useAppStore(
    (state) => state.data?.prefs.showBubble !== false
  )
  const collapseLabel = hasBubble ? t('dock_panel') : t('hide_to_tray')

  return (
    <header className="titlebar" data-search={searchMode}>
      <button
        className="command-trigger titlebar-search"
        type="button"
        title={`${t('global_search')} · Ctrl+K`}
        aria-label={t('global_search')}
        data-testid="open-command"
        onClick={() => setCommandOpen(true)}
      >
        <IconSearch size={14} />
        <span>{t('global_search')}</span>
        <kbd>Ctrl K</kbd>
      </button>
      {tabMode !== 'row' && <SectionActions />}
      <div className="titlebar-actions">
        <button
          className={`icon-button ${windowState.alwaysOnTop ? 'active' : ''}`}
          type="button"
          title={t('pin')}
          aria-label={t('pin')}
          aria-pressed={windowState.alwaysOnTop}
          data-testid="toggle-pin"
          onClick={() => void togglePin()}
        >
          <IconPin
            size={16}
            weight={windowState.alwaysOnTop ? 'fill' : 'duotone'}
          />
        </button>
        <button
          className="icon-button"
          type="button"
          title={t('settings')}
          data-testid="open-settings"
          onClick={() => setModal({ kind: 'settings' })}
        >
          <IconSettings size={16} />
        </button>
        {/* The ball's own shape: the button says where the panel goes. */}
        <button
          className="icon-button titlebar-ball"
          type="button"
          title={hasBubble ? t('dock_panel_hint') : collapseLabel}
          aria-label={collapseLabel}
          data-testid="dock-panel"
          onClick={() => void toggleCollapse()}
        >
          <img src={brandIcon} alt="" width={14} height={14} />
        </button>
        <button
          className="icon-button danger titlebar-close"
          type="button"
          title={t('hide_to_tray')}
          data-testid="close-window"
          onClick={() => void hideWindow()}
        >
          <IconClose size={16} />
        </button>
      </div>
    </header>
  )
}
