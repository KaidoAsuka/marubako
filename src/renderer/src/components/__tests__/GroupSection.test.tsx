import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import GroupSection from '../sections/GroupSection'
import { useAppStore } from '../../store/use-app-store'

describe('GroupSection', () => {
  beforeEach(() => {
    const data = createDefaultAppData()
    data.notes = [
      {
        id: 'group-notes-test',
        name: 'Work Notes',
        icon: 'N',
        open: true,
        items: [
          {
            id: 'note-test',
            kind: 'note',
            name: 'Checklist',
            icon: 'C',
            content: 'Ship migration',
          },
        ],
      },
    ]
    data.loose.notes = [
      {
        id: 'note-loose',
        kind: 'note',
        name: 'Inbox',
        icon: 'I',
        content: 'Loose note',
      },
    ]
    data.topOrder.notes = [
      { type: 'group', id: 'group-notes-test' },
      { type: 'loose', id: 'note-loose' },
    ]

    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'notes',
      modal: null,
      widgetPopup: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders note groups and their items', () => {
    render(<GroupSection tab="notes" />)

    expect(screen.getByTestId('section-notes')).toBeInTheDocument()
    expect(screen.getByText('Work Notes')).toBeInTheDocument()
    expect(screen.getByText('Checklist')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
  })

  it.each([
    ['folders', 'grid'],
    ['folders', 'list'],
    ['websites', 'grid'],
    ['websites', 'list'],
    ['apps', 'grid'],
    ['apps', 'list'],
    ['passwords', 'list'],
    ['commands', 'list'],
    ['notes', 'list'],
  ] as const)(
    'carries no title row, filter box or buttons of its own on %s (%s)',
    (tab, viewMode) => {
      // jsdom has no matchMedia, and the grid view asks for it.
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => ({
          matches: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      })
      const data = useAppStore.getState().data!
      useAppStore.setState({
        currentTab: tab,
        data: { ...data, prefs: { ...data.prefs, viewMode } },
      })
      const { container } = render(<GroupSection tab={tab} />)

      expect(container.querySelector('.section-toolbar')).toBeNull()
      expect(container.querySelector('.search-box')).toBeNull()
      expect(screen.queryByTestId(`search-${tab}`)).toBeNull()
      expect(screen.queryByTestId(`toggle-view-${tab}`)).toBeNull()
      // "New group", "add" and the layout switch are in the bar above the content (SectionActions).
      expect(screen.queryByTestId(`add-group-${tab}`)).toBeNull()
      expect(screen.queryByTestId(`add-loose-item-${tab}`)).toBeNull()
      expect(screen.queryByTestId('toggle-view-mode')).toBeNull()
      expect(container.querySelector('button.section-view-toggle')).toBeNull()
    }
  )

  it.each([
    ['folders', 'list', 'list-section-folders'],
    ['folders', 'grid', 'widget-grid-folders'],
    ['apps', 'list', 'list-section-apps'],
    ['apps', 'grid', 'widget-grid-apps'],
    // The pages without the two layouts are always a list.
    ['notes', 'grid', 'list-section-notes'],
    ['passwords', 'grid', 'list-section-passwords'],
  ] as const)('draws %s in the saved layout (%s)', (tab, viewMode, testId) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    const data = useAppStore.getState().data!
    useAppStore.setState({
      currentTab: tab,
      data: { ...data, prefs: { ...data.prefs, viewMode } },
    })
    render(<GroupSection tab={tab} />)

    expect(screen.getByTestId(testId)).toBeInTheDocument()
  })

  it('draws the three pages with two layouts as a list in a new installation', () => {
    // The sample data as it is: no layout chosen by the test.
    useAppStore.setState({
      data: createDefaultAppData(),
      currentTab: 'folders',
    })
    render(<GroupSection tab="folders" />)

    expect(screen.getByTestId('list-section-folders')).toBeInTheDocument()
    expect(screen.queryByTestId('widget-grid-folders')).toBeNull()
  })

  it.each(['forward', 'backward'] as const)(
    'carries the side it comes in from (%s) for the stylesheet, and nothing when it is simply there',
    (enter) => {
      const slid = render(<GroupSection tab="notes" enter={enter} />)
      expect(screen.getByTestId('section-notes')).toHaveAttribute(
        'data-enter',
        enter
      )
      expect(screen.getByTestId('section-notes')).toHaveClass('section-content')
      slid.unmount()

      const there = render(<GroupSection tab="notes" enter={null} />)
      expect(screen.getByTestId('section-notes')).not.toHaveAttribute(
        'data-enter'
      )
      there.unmount()

      render(<GroupSection tab="notes" />)
      expect(screen.getByTestId('section-notes')).not.toHaveAttribute(
        'data-enter'
      )
    }
  )

  it('keeps its heading for screen readers, not drawn', () => {
    render(<GroupSection tab="notes" />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('备忘')
    expect(heading).toHaveClass('sr-only')
    // First in the section, so a reader meets it before the entries.
    expect(screen.getByTestId('section-notes').firstElementChild).toBe(heading)
  })

  it('opens the entry menu on a right-click on an entry and a group card, and nowhere else', async () => {
    vi.mocked(window.quickLaunch.showContextMenu).mockClear()
    useAppStore.setState({
      data: {
        ...useAppStore.getState().data!,
        prefs: { ...useAppStore.getState().data!.prefs, viewMode: 'list' },
      },
    })
    render(<GroupSection tab="notes" />)

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('item-row-note-loose'))
    })
    expect(window.quickLaunch.showContextMenu).toHaveBeenCalledTimes(1)
    const entryMenu = vi.mocked(window.quickLaunch.showContextMenu).mock
      .calls[0]![0]
    expect(entryMenu.map((item) => item.id ?? item.type)).toContain('rename')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('group-card-group-notes-test'))
    })
    expect(window.quickLaunch.showContextMenu).toHaveBeenCalledTimes(2)

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('section-notes'))
    })
    expect(window.quickLaunch.showContextMenu).toHaveBeenCalledTimes(2)
  })

  it('has no filter of its own any more: the page lists every entry, and the global search is the one way to find', () => {
    // The page filter was taken out with its box; nothing in the store can narrow a page now.
    expect('query' in useAppStore.getState()).toBe(false)
    expect('setQuery' in useAppStore.getState()).toBe(false)

    render(<GroupSection tab="notes" />)

    expect(screen.queryByText('无搜索结果')).toBeNull()
    expect(screen.getByText('Work Notes')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
  })
})
