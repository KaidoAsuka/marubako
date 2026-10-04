import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { ALL_TABS, type AppData, type Tab } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import { todayKey } from '../../../utils/date'
import ContentRouter from '../ContentRouter'

// Switching category: the page slides in from the side its tab lies on (motion.css reads
// `data-enter`), and the first page of a session is simply there. The bodies of groups and tasks
// unfold only when the user opens them (`data-unfold`), not when their page arrives.
function seed(configure: (data: AppData) => void = () => {}): void {
  const data = createDefaultAppData('en')
  // Group cards with their bodies: the list layout, with every sample group open.
  data.prefs.viewMode = 'list'
  for (const group of [...data.folders, ...data.websites]) group.open = true
  data.tasks[todayKey()] = [
    {
      id: 'task-open',
      name: 'Ship release',
      icon: 'R',
      status: 'todo',
      open: true,
      subtasks: [{ id: 'sub-1', name: 'Run checks', status: 'todo' }],
    },
    {
      id: 'task-shut',
      name: 'Write notes',
      icon: 'N',
      status: 'todo',
      open: false,
      subtasks: [{ id: 'sub-2', name: 'Draft', status: 'todo' }],
    },
  ]
  configure(data)
  useAppStore.setState({
    data,
    loading: false,
    currentTab: 'folders',
    selectedDate: todayKey(),
    modal: null,
    widgetPopup: null,
  })
}

const page = (tab: Tab) => screen.getByTestId(`section-${tab}`)
const go = (tab: Tab) => act(() => useAppStore.getState().setCurrentTab(tab))

describe('ContentRouter: the side a page comes in from', () => {
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
    seed()
  })

  afterEach(cleanup)

  it('shows the first page of a session as it is, with no direction', () => {
    render(<ContentRouter />)

    expect(page('folders')).not.toHaveAttribute('data-enter')
  })

  it('shows the first page as it is whichever category the session starts on', () => {
    useAppStore.setState({ currentTab: 'tasks' })
    render(<ContentRouter />)

    expect(page('tasks')).not.toHaveAttribute('data-enter')
  })

  it('brings a category further along the tab row in forward', () => {
    render(<ContentRouter />)

    go('commands')

    expect(page('commands')).toHaveAttribute('data-enter', 'forward')
    expect(screen.queryByTestId('section-folders')).toBeNull()
  })

  it('brings a category earlier in the row in backward', () => {
    useAppStore.setState({ currentTab: 'commands' })
    render(<ContentRouter />)

    go('websites')

    expect(page('websites')).toHaveAttribute('data-enter', 'backward')
  })

  it('treats the task page like the others: it is the last tab', () => {
    render(<ContentRouter />)

    go('tasks')
    expect(page('tasks')).toHaveAttribute('data-enter', 'forward')

    go('notes')
    expect(page('notes')).toHaveAttribute('data-enter', 'backward')
  })

  // Forty-two pages are drawn here: more time than one test usually gets on a busy machine.
  it('follows the order of the tab row for every pair of categories', () => {
    for (const from of ALL_TABS) {
      for (const to of ALL_TABS) {
        if (from === to) continue
        useAppStore.setState({ currentTab: from })
        const { unmount } = render(<ContentRouter />)

        go(to)

        expect(page(to), `${from} to ${to}`).toHaveAttribute(
          'data-enter',
          ALL_TABS.indexOf(to) > ALL_TABS.indexOf(from) ? 'forward' : 'backward'
        )
        unmount()
      }
    }
  }, 30_000)

  it('slides a page that is come back to again, as a new element', () => {
    render(<ContentRouter />)
    const first = page('folders')

    go('websites')
    go('folders')

    expect(page('folders')).toHaveAttribute('data-enter', 'backward')
    // A new element: the animation of a stylesheet only plays for one that has just appeared.
    expect(page('folders')).not.toBe(first)
  })

  it('keeps the page and its direction through a redraw, so the slide is not played twice', async () => {
    render(<ContentRouter />)
    go('websites')
    const shown = page('websites')

    // Something else changes while the page is on screen: the item layout.
    await act(async () => {
      await useAppStore.getState().updateData((draft) => {
        draft.prefs.viewMode = 'grid'
      })
    })

    expect(page('websites')).toBe(shown)
    expect(page('websites')).toHaveAttribute('data-enter', 'forward')
  })

  it('takes the direction from the page that was left, not from the first one', () => {
    render(<ContentRouter />)

    go('commands')
    go('passwords')
    expect(page('passwords')).toHaveAttribute('data-enter', 'backward')

    // Passwords lies after folders, where the session began, but before commands.
    go('notes')
    expect(page('notes')).toHaveAttribute('data-enter', 'forward')
  })
})

describe('ContentRouter: what unfolds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seed()
  })

  afterEach(cleanup)

  const body = (testId: string): HTMLElement | null =>
    screen
      .getByTestId(testId)
      .querySelector<HTMLElement>('.group-card-body, .task-card-body')
  const click = async (testId: string): Promise<void> => {
    await act(async () => {
      fireEvent.click(screen.getByTestId(testId))
    })
  }

  it('does not unfold the open groups of the first page', () => {
    render(<ContentRouter />)

    const bodies = page('folders').querySelectorAll('.group-card-body')
    expect(bodies.length).toBeGreaterThan(0)
    for (const element of bodies) {
      expect(element).not.toHaveAttribute('data-unfold')
    }
  })

  it('does not unfold the open groups of a page that slides in: they are part of the page', () => {
    render(<ContentRouter />)

    go('websites')

    const bodies = page('websites').querySelectorAll('.group-card-body')
    expect(bodies.length).toBeGreaterThan(0)
    for (const element of bodies) {
      expect(element).not.toHaveAttribute('data-unfold')
    }
  })

  it('unfolds a group the user opens, also one that was open when the page arrived', async () => {
    render(<ContentRouter />)
    go('websites')

    await click('group-toggle-grp-sites-tools')
    expect(body('group-card-grp-sites-tools')).toBeNull()
    await click('group-toggle-grp-sites-tools')

    expect(body('group-card-grp-sites-tools')).toHaveAttribute('data-unfold')
    // The neighbour was not touched.
    expect(body('group-card-grp-sites-fun')).not.toHaveAttribute('data-unfold')
  })

  it('unfolds a group that arrived closed when the user opens it', async () => {
    seed((data) => {
      data.websites[0]!.open = false
    })
    render(<ContentRouter />)
    go('websites')
    expect(body('group-card-grp-sites-tools')).toBeNull()

    await click('group-toggle-grp-sites-tools')

    expect(body('group-card-grp-sites-tools')).toHaveAttribute('data-unfold')
  })

  it('forgets that when the page is left: coming back, the group is part of the page again', async () => {
    render(<ContentRouter />)
    go('websites')
    await click('group-toggle-grp-sites-tools')
    await click('group-toggle-grp-sites-tools')
    expect(body('group-card-grp-sites-tools')).toHaveAttribute('data-unfold')

    go('folders')
    go('websites')

    expect(body('group-card-grp-sites-tools')).not.toBeNull()
    expect(body('group-card-grp-sites-tools')).not.toHaveAttribute(
      'data-unfold'
    )
  })

  it('does the same for tasks: open on arrival is part of the page, opened by the user unfolds', async () => {
    render(<ContentRouter />)

    go('tasks')

    expect(body('task-card-task-open')).not.toBeNull()
    expect(body('task-card-task-open')).not.toHaveAttribute('data-unfold')
    expect(body('task-card-task-shut')).toBeNull()

    await click('task-toggle-task-shut')

    expect(body('task-card-task-shut')).toHaveAttribute('data-unfold')
    expect(body('task-card-task-open')).not.toHaveAttribute('data-unfold')
  })
})
