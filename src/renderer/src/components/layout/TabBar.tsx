import { useEffect, useLayoutEffect, useRef } from 'react'
import { TAB_ICONS } from '../common/tab-icons'

import { visibleTabs } from '../../../../shared/tabs'
import { ALL_TABS } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useLayoutMode } from '../../hooks/use-layout-mode'
import { useAppStore } from '../../store/use-app-store'
import { describeTab } from '../../utils/tab-summary'
import SectionActions from './SectionActions'

// Every category, in the fixed order; the ones the user has hidden are filtered out when drawing.
const tabs = ALL_TABS.map((id) => ({
  id,
  label: `tab_${id}`,
  Icon: TAB_ICONS[id],
}))

/**
 * Puts the marker under the active button by measuring it, so any number of tabs, any width and any
 * label length work. `instant` moves it without the slide (first paint, a window being resized):
 * only choosing another category should be seen to move it.
 */
function placeMarker(nav: HTMLElement, instant: boolean): void {
  const active = nav.querySelector<HTMLElement>('.tab-button.active')
  if (!active) return

  if (instant) {
    nav.dataset.markerInstant = ''
    // Cleared once the frame that carries the new position has been drawn.
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => {
        delete nav.dataset.markerInstant
      })
  }
  nav.style.setProperty('--tab-x', `${active.offsetLeft}px`)
  nav.style.setProperty('--tab-w', `${active.offsetWidth}px`)
}

export default function TabBar(): JSX.Element {
  const { t, lang } = useI18n()
  const { tabMode } = useLayoutMode()
  const currentTab = useAppStore((state) => state.currentTab)
  const setCurrentTab = useAppStore((state) => state.setCurrentTab)
  const data = useAppStore((state) => state.data)
  // Only the categories the user has not hidden; Alt+number counts these.
  const shown = visibleTabs(data?.prefs.hiddenTabs)
  const visible = tabs.filter((tab) => shown.includes(tab.id))
  const nav = useRef<HTMLElement>(null)
  const placed = useRef(false)

  // Another category slides the marker; the first placement does not.
  useLayoutEffect(() => {
    if (!nav.current) return
    placeMarker(nav.current, !placed.current)
    placed.current = true
  }, [currentTab, lang])

  // A new layout, or another set of categories, moves every tab at once: the marker simply follows.
  const shownKey = shown.join(',')
  useLayoutEffect(() => {
    if (nav.current) placeMarker(nav.current, true)
  }, [tabMode, shownKey])

  // The buttons also change size without a category change: with the window, the language and the
  // width of the actions beside them. Only a window being resized skips the slide; a marker that is
  // already sliding to another category is simply given its new target.
  useEffect(() => {
    const element = nav.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let windowWidth = window.innerWidth
    const observer = new ResizeObserver(() => {
      const resized = window.innerWidth !== windowWidth
      windowWidth = window.innerWidth
      placeMarker(element, resized)
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="workspace-nav"
      data-tab-mode={tabMode}
      data-tab-count={visible.length}
    >
      <nav className="tabbar" aria-label={t('workspace_library')} ref={nav}>
        {visible.map((tab, index) => {
          const summary = describeTab(t, data, tab.id, index)

          return (
            <button
              key={tab.id}
              className={`tab-button ${currentTab === tab.id ? 'active' : ''}`}
              type="button"
              aria-current={currentTab === tab.id ? 'page' : undefined}
              title={summary}
              aria-label={summary}
              data-testid={`tab-${tab.id}`}
              onClick={() => setCurrentTab(tab.id)}
            >
              <span className="tab-button-icon">
                <tab.Icon
                  size={tabMode === 'stacked' ? 18 : 16}
                  weight={currentTab === tab.id ? 'fill' : 'duotone'}
                />
              </span>
              <span className="tab-label">{t(tab.label)}</span>
            </button>
          )
        })}
      </nav>
      {tabMode === 'row' && <SectionActions />}
    </div>
  )
}
