import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import {
  ROW_MIN_WIDTH,
  SEARCH_ICON_BELOW_WIDTH,
  VIEW_TOGGLE_MIN_WIDTH,
} from '../../../../../shared/layout-widths'
import { useAppStore } from '../../../store/use-app-store'
import { INITIAL_WINDOW_WIDTH, resizeWindow } from '../../../test/resize-window'
import TitleBar from '../TitleBar'

describe('TitleBar search and actions by width', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.prefs.lang = 'zh'
    useAppStore.setState({
      data,
      currentTab: 'folders',
      modal: null,
      windowState: { alwaysOnTop: false, collapsed: false, opacity: 1 },
    })
  })

  afterEach(() => {
    cleanup()
    resizeWindow(INITIAL_WINDOW_WIDTH)
  })

  const bar = () => document.querySelector('.titlebar')!

  // The widths at which the search changes are constants (shared/layout-widths.ts): below the
  // first it is only its icon, from the width of the one-row tabs on it is drawn in full.
  it.each([
    [320, 'icon'],
    [400, 'icon'],
    [SEARCH_ICON_BELOW_WIDTH - 1, 'icon'],
    [SEARCH_ICON_BELOW_WIDTH, 'label'],
    [ROW_MIN_WIDTH.zh - 1, 'label'],
    [ROW_MIN_WIDTH.zh, 'full'],
    [1200, 'full'],
  ] as const)('is %i px wide: the search is %s (Chinese)', (width, mode) => {
    resizeWindow(width)
    render(<TitleBar />)

    expect(bar()).toHaveAttribute('data-search', mode)
  })

  it('keeps the name and the shortcut of the search for screen readers even as an icon', () => {
    resizeWindow(400)
    render(<TitleBar />)

    expect(screen.getByTestId('open-command')).toHaveAttribute(
      'aria-label',
      '搜索全部'
    )
    expect(screen.getByTestId('open-command')).toHaveAttribute(
      'title',
      '搜索全部 · Ctrl+K'
    )
  })

  it('puts the layout switch, "new group" and "add" right of the search in a slender window', () => {
    resizeWindow(400)
    const { container } = render(<TitleBar />)

    const ids = Array.from(
      container.querySelectorAll('.titlebar [data-testid]')
    ).map((node) => node.getAttribute('data-testid'))
    expect(ids).toEqual([
      'open-command',
      'toggle-view-mode',
      'add-group-folders',
      'add-loose-item-folders',
      'toggle-pin',
      'open-settings',
      'dock-panel',
      'close-window',
    ])
  })

  it('has no layout switch there on a page with one layout', () => {
    useAppStore.setState({ currentTab: 'notes' })
    resizeWindow(400)
    const { container } = render(<TitleBar />)

    const ids = Array.from(
      container.querySelectorAll('.titlebar [data-testid]')
    ).map((node) => node.getAttribute('data-testid'))
    expect(ids).toEqual([
      'open-command',
      'add-group-notes',
      'add-loose-item-notes',
      'toggle-pin',
      'open-settings',
      'dock-panel',
      'close-window',
    ])
  })

  it('drops the layout switch where the window row has no room for it, and keeps the other two', () => {
    // Only the zoom setting makes the interface this narrow: the window itself cannot be.
    resizeWindow(VIEW_TOGGLE_MIN_WIDTH - 1)
    const { container } = render(<TitleBar />)
    const ids = () =>
      Array.from(container.querySelectorAll('.section-actions button')).map(
        (node) => node.getAttribute('data-testid')
      )

    expect(ids()).toEqual(['add-group-folders', 'add-loose-item-folders'])

    resizeWindow(VIEW_TOGGLE_MIN_WIDTH)

    expect(ids()).toEqual([
      'toggle-view-mode',
      'add-group-folders',
      'add-loose-item-folders',
    ])
  })

  it('drops it as well when the zoom setting leaves that little room in a wider window', () => {
    // A 320px window at 140% is 229px of interface.
    const data = createDefaultAppData()
    data.prefs.lang = 'zh'
    data.prefs.zoom = 1.4
    useAppStore.setState({ data })
    resizeWindow(320)
    expect(Math.round(320 / 1.4)).toBeLessThan(VIEW_TOGGLE_MIN_WIDTH)

    render(<TitleBar />)

    expect(screen.queryByTestId('toggle-view-mode')).toBeNull()
    expect(screen.getByTestId('add-group-folders')).toBeInTheDocument()
    expect(screen.getByTestId('add-loose-item-folders')).toBeInTheDocument()
  })

  it('leaves them to the category row in a wide window', () => {
    resizeWindow(900)
    render(<TitleBar />)

    expect(screen.queryByTestId('add-loose-item-folders')).toBeNull()
    expect(screen.queryByTestId('add-group-folders')).toBeNull()
    expect(screen.queryByTestId('toggle-view-mode')).toBeNull()
  })

  it('shows only "add task" beside the search on the task page', () => {
    useAppStore.setState({ currentTab: 'tasks' })
    resizeWindow(400)
    render(<TitleBar />)

    expect(screen.getByTestId('add-task')).toBeInTheDocument()
    expect(screen.queryByTestId('add-group-tasks')).toBeNull()
  })

  it('keeps the actions working where they are', () => {
    resizeWindow(400)
    render(<TitleBar />)

    fireEvent.click(screen.getByTestId('add-loose-item-folders'))

    expect(useAppStore.getState().modal).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: null,
      itemId: null,
    })
  })

  it('follows a resize that crosses the width where the tabs go side by side', () => {
    resizeWindow(400)
    render(<TitleBar />)
    expect(screen.getByTestId('add-loose-item-folders')).toBeInTheDocument()

    resizeWindow(800)
    expect(screen.queryByTestId('add-loose-item-folders')).toBeNull()
    expect(bar()).toHaveAttribute('data-search', 'full')
  })
})
