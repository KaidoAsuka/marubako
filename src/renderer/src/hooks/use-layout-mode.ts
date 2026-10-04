import { useLayoutEffect, useState } from 'react'

import type { Lang } from '../../../shared/types'
import { visibleTabs } from '../../../shared/tabs'
import {
  resolveSearchMode,
  resolveTabMode,
  type SearchMode,
  type TabMode,
} from '../../../shared/layout-widths'
import { resolveLang } from '../i18n/resolve-lang'
import { useAppStore } from '../store/use-app-store'

export type LayoutMode = {
  tabMode: TabMode
  searchMode: SearchMode
}

/** The width the interface has to work with: the window, less what the zoom setting takes. */
function contentWidth(zoom: number): number {
  return Math.round(window.innerWidth / (zoom > 0 ? zoom : 1))
}

function modeAt(lang: Lang, zoom: number, tabCount: number): LayoutMode {
  const width = contentWidth(zoom)

  return {
    tabMode: resolveTabMode(lang, width, tabCount),
    searchMode: resolveSearchMode(lang, width, tabCount),
  }
}

/**
 * Which layout the window row and the category row use at the current width. The widths that decide
 * it are constants per language (shared/layout-widths.ts); nothing is measured here, the window width
 * is only compared against them. The zoom setting scales what is drawn, so it scales the width too.
 * A window being dragged to a new size re-renders only when it crosses one of those widths. The
 * widths shrink with the number of categories the user has left visible.
 */
export function useLayoutMode(): LayoutMode {
  const lang = useAppStore((state) => resolveLang(state.data?.prefs.lang))
  const zoom = useAppStore(
    (state) => state.previewPrefs?.zoom ?? state.data?.prefs.zoom ?? 1
  )
  const tabCount = useAppStore(
    (state) => visibleTabs(state.data?.prefs.hiddenTabs).length
  )
  const [mode, setMode] = useState(() => modeAt(lang, zoom, tabCount))

  useLayoutEffect(() => {
    const update = () => {
      const next = modeAt(lang, zoom, tabCount)
      setMode((current) =>
        current.tabMode === next.tabMode &&
        current.searchMode === next.searchMode
          ? current
          : next
      )
    }
    update()
    window.addEventListener('resize', update)

    return () => window.removeEventListener('resize', update)
  }, [lang, zoom, tabCount])

  return mode
}
