import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { VIEW_TOGGLE_MIN_WIDTH } from '../../../../../shared/layout-widths'
import {
  ALL_TABS,
  GRID_TABS,
  type AppData,
  type Lang,
  type Tab,
  type ViewMode,
} from '../../../../../shared/types'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import { INITIAL_WINDOW_WIDTH, resizeWindow } from '../../../test/resize-window'
import { IconViewGrid, IconViewList } from '../../common/icons'
import GroupSection from '../../sections/GroupSection'
import SectionActions from '../SectionActions'

// The switch between the grid and the list layout: the first button of the category's actions, on
// the three pages that have the two layouts. It is the same setting as "item layout" in the
// settings dialog (prefs.viewMode), within reach of the page it changes.
function show(
  tab: Tab,
  viewMode: ViewMode = 'list',
  lang: Lang = 'en'
): AppData {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  data.prefs.viewMode = viewMode
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    currentTab: tab,
    modal: null,
    toast: null,
    widgetPopup: null,
  })

  return data
}

function markup(element: ReactElement): string {
  const { container, unmount } = render(element)
  const html = container.innerHTML
  unmount()

  return html
}

const toggle = () => screen.getByTestId('toggle-view-mode')
const savedData = (call = 0) =>
  vi.mocked(window.quickLaunch.saveData).mock.calls[call]![0] as AppData

describe('SectionActions: the layout switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it.each(ALL_TABS)(
    'is on the folders, websites and apps pages only (%s)',
    (tab) => {
      show(tab)
      render(<SectionActions />)

      const expected = (GRID_TABS as readonly Tab[]).includes(tab)
      expect(screen.queryByTestId('toggle-view-mode') !== null).toBe(expected)
    }
  )

  it('names the pages that have it', () => {
    expect([...GRID_TABS]).toEqual(['folders', 'websites', 'apps'])
  })

  it('is the first button of the row, before "new group" and "add"', () => {
    show('folders')
    const { container } = render(<SectionActions />)

    expect(
      Array.from(container.querySelectorAll('.section-actions > button')).map(
        (button) => button.getAttribute('data-testid')
      )
    ).toEqual([
      'toggle-view-mode',
      'add-group-folders',
      'add-loose-item-folders',
    ])
  })

  it('gives way where the interface is too narrow for a third button: the layout is then only in the settings', () => {
    show('folders')
    resizeWindow(VIEW_TOGGLE_MIN_WIDTH - 1)
    try {
      const { container } = render(<SectionActions />)
      const ids = () =>
        Array.from(container.querySelectorAll('.section-actions > button')).map(
          (button) => button.getAttribute('data-testid')
        )

      expect(ids()).toEqual(['add-group-folders', 'add-loose-item-folders'])

      resizeWindow(VIEW_TOGGLE_MIN_WIDTH)

      expect(ids()).toEqual([
        'toggle-view-mode',
        'add-group-folders',
        'add-loose-item-folders',
      ])
    } finally {
      resizeWindow(INITIAL_WINDOW_WIDTH)
    }
  })

  it('leaves the other pages with the two buttons they had', () => {
    show('notes')
    const { container } = render(<SectionActions />)

    expect(
      Array.from(container.querySelectorAll('.section-actions > button')).map(
        (button) => button.getAttribute('data-testid')
      )
    ).toEqual(['add-group-notes', 'add-loose-item-notes'])
  })

  it('is a plain icon button the stylesheet draws as a square', () => {
    show('apps')
    render(<SectionActions />)

    expect(toggle()).toHaveAttribute('type', 'button')
    expect(toggle()).toHaveClass('secondary-button', 'section-view-toggle')
    // Only an icon: the name is in the title and the accessible name.
    expect(toggle()).toHaveTextContent('')
    expect(toggle().querySelector('svg')).not.toBeNull()
  })

  it.each([
    ['list', 'grid'],
    ['grid', 'list'],
  ] as const)(
    'carries the current layout (%s) and shows the icon of the one a click changes to (%s)',
    (current, next) => {
      const icon = markup(
        next === 'grid' ? (
          <IconViewGrid size={14} />
        ) : (
          <IconViewList size={14} />
        )
      )
      const other = markup(
        next === 'grid' ? (
          <IconViewList size={14} />
        ) : (
          <IconViewGrid size={14} />
        )
      )
      expect(icon).not.toBe(other)
      show('folders', current)
      render(<SectionActions />)

      expect(toggle()).toHaveAttribute('data-view-mode', current)
      expect(toggle().innerHTML).toBe(icon)
    }
  )

  it.each([
    ['zh', '切换为网格', '切换为列表'],
    ['en', 'Show as grid', 'Show as list'],
    ['ja', 'グリッド表示に切り替え', 'リスト表示に切り替え'],
  ] as const)(
    'is named in %s by what a click does, in the title and for screen readers',
    (lang, toGrid, toList) => {
      expect(workspaceStrings[lang].view_switch_grid).toBe(toGrid)
      expect(workspaceStrings[lang].view_switch_list).toBe(toList)

      show('websites', 'list', lang)
      const first = render(<SectionActions />)
      expect(toggle()).toHaveAttribute('title', toGrid)
      expect(toggle()).toHaveAccessibleName(toGrid)
      first.unmount()

      show('websites', 'grid', lang)
      render(<SectionActions />)
      expect(toggle()).toHaveAttribute('title', toList)
      expect(toggle()).toHaveAccessibleName(toList)
    }
  )

  it('flips the saved layout on a click, and back on the next one', async () => {
    show('folders', 'list')
    render(<SectionActions />)

    await act(async () => {
      fireEvent.click(toggle())
    })

    expect(useAppStore.getState().data?.prefs.viewMode).toBe('grid')
    expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
    expect(savedData().prefs.viewMode).toBe('grid')
    expect(toggle()).toHaveAttribute('data-view-mode', 'grid')
    expect(toggle()).toHaveAccessibleName('Show as list')

    await act(async () => {
      fireEvent.click(toggle())
    })

    expect(useAppStore.getState().data?.prefs.viewMode).toBe('list')
    expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(2)
    expect(savedData(1).prefs.viewMode).toBe('list')
    expect(toggle()).toHaveAttribute('data-view-mode', 'list')
    expect(toggle()).toHaveAccessibleName('Show as grid')
  })

  it('changes the layout and nothing else: no dialog opens and the entries are saved as they were', async () => {
    const before = structuredClone(show('apps', 'grid'))
    render(<SectionActions />)

    await act(async () => {
      fireEvent.click(toggle())
    })

    expect(useAppStore.getState().modal).toBeNull()
    expect(savedData()).toEqual({
      ...before,
      prefs: { ...before.prefs, viewMode: 'list', lastTab: 'apps' },
    })
  })

  it('is one setting for the three pages: switching on one page shows on the others', async () => {
    show('folders', 'list')
    render(<SectionActions />)
    await act(async () => {
      fireEvent.click(toggle())
    })

    act(() => useAppStore.getState().setCurrentTab('apps'))

    expect(toggle()).toHaveAttribute('data-view-mode', 'grid')
  })

  it('puts the old layout back when the change could not be saved', async () => {
    show('folders', 'list')
    vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
      ok: false,
      error: 'disk full',
    })
    render(<SectionActions />)

    await act(async () => {
      fireEvent.click(toggle())
    })

    expect(useAppStore.getState().data?.prefs.viewMode).toBe('list')
    expect(toggle()).toHaveAttribute('data-view-mode', 'list')
    expect(useAppStore.getState().toast).toMatchObject({
      message: 'disk full',
      tone: 'danger',
    })
  })
})

describe('SectionActions: the page follows the switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia, and the grid layout asks for it.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(cleanup)

  it('redraws the page as a grid and as a list again', async () => {
    show('folders', 'list')
    render(
      <>
        <SectionActions />
        <GroupSection tab="folders" />
      </>
    )
    expect(screen.getByTestId('list-section-folders')).toBeInTheDocument()
    expect(screen.queryByTestId('widget-grid-folders')).toBeNull()

    await act(async () => {
      fireEvent.click(toggle())
    })

    expect(screen.getByTestId('widget-grid-folders')).toBeInTheDocument()
    expect(screen.queryByTestId('list-section-folders')).toBeNull()

    await act(async () => {
      fireEvent.click(toggle())
    })

    expect(screen.getByTestId('list-section-folders')).toBeInTheDocument()
    expect(screen.queryByTestId('widget-grid-folders')).toBeNull()
  })
})
