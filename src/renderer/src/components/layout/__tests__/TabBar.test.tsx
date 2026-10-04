import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import { IconTabApp, IconTabFolder } from '../../common/icons'
import TabBar from '../TabBar'

function markup(element: ReactElement): string {
  const { container, unmount } = render(element)
  const html = container.innerHTML
  unmount()
  return html
}

function load(lang: Lang): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({ data, currentTab: 'folders' })
}

describe('TabBar icons', () => {
  beforeEach(() => {
    load('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('draws the current tab with the filled icon and the others duotone', () => {
    // Measure the expected markup first: the helper renders into its own container.
    const folderFill = markup(<IconTabFolder size={16} weight="fill" />)
    const folderDuotone = markup(<IconTabFolder size={16} weight="duotone" />)
    const appDuotone = markup(<IconTabApp size={16} weight="duotone" />)
    expect(folderFill).not.toBe(folderDuotone)

    render(<TabBar />)

    const iconOf = (id: string): string =>
      screen
        .getByTestId(`tab-${id}`)
        .querySelector('.tab-button-icon')
        ?.innerHTML.trim() ?? ''

    expect(iconOf('folders')).toBe(folderFill)
    expect(iconOf('apps')).toBe(appDuotone)
  })

  it('moves the filled icon along with the current tab', () => {
    useAppStore.setState({ currentTab: 'apps' })
    const appFill = markup(<IconTabApp size={16} weight="fill" />)
    const folderDuotone = markup(<IconTabFolder size={16} weight="duotone" />)

    render(<TabBar />)

    expect(
      screen.getByTestId('tab-apps').querySelector('.tab-button-icon')
        ?.innerHTML
    ).toBe(appFill)
    expect(
      screen.getByTestId('tab-folders').querySelector('.tab-button-icon')
        ?.innerHTML
    ).toBe(folderDuotone)
  })
})

describe('TabBar names and counts', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows only the icon and the name on a tab: the counts are gone', () => {
    load('en')
    const { container } = render(<TabBar />)

    expect(container.querySelector('.tab-count')).toBeNull()
    expect(screen.getByTestId('tab-folders')).toHaveTextContent(/^Folders$/)
    expect(screen.getByTestId('tab-tasks')).toHaveTextContent(/^Tasks$/)
  })

  it.each([
    [
      'zh',
      'tab-folders',
      '文件夹 · 2 个分组 3 个条目 · Alt+1',
      'tab-apps',
      '软件 · 0 个分组 0 个条目 · Alt+3',
    ],
    [
      'en',
      'tab-folders',
      'Folders · 2 groups, 3 items · Alt+1',
      'tab-apps',
      'Apps · 0 groups, 0 items · Alt+3',
    ],
    [
      'ja',
      'tab-folders',
      'フォルダ · 2 グループ 3 件 · Alt+1',
      'tab-apps',
      'アプリ · 0 グループ 0 件 · Alt+3',
    ],
  ] as const)(
    'puts the name, the groups and entries and the shortcut into the title and the accessible name in %s',
    (lang, first, firstText, second, secondText) => {
      load(lang)
      render(<TabBar />)

      for (const [id, text] of [
        [first, firstText],
        [second, secondText],
      ] as const) {
        expect(screen.getByTestId(id)).toHaveAttribute('title', text)
        expect(screen.getByTestId(id)).toHaveAttribute('aria-label', text)
      }
    }
  )

  it('counts loose entries together with the entries of groups', () => {
    load('en')
    const data = useAppStore.getState().data!
    data.loose.websites = [
      {
        id: 'site-a',
        kind: 'website',
        name: 'A',
        url: 'https://a.test',
        icon: 'A',
      },
    ]
    useAppStore.setState({ data })
    render(<TabBar />)

    // Two groups holding three entries, plus one loose entry.
    expect(screen.getByTestId('tab-websites')).toHaveAttribute(
      'title',
      'Sites · 2 groups, 4 items · Alt+2'
    )
  })

  it.each([
    ['zh', '任务 · 1 个待办 · Alt+7'],
    ['en', 'Tasks · 1 open · Alt+7'],
    ['ja', 'タスク · 未完了 1 件 · Alt+7'],
  ] as const)(
    'counts the tasks that are still open, not the finished ones, in %s',
    (lang, text) => {
      load(lang)
      const data = useAppStore.getState().data!
      data.tasks = {
        '2026-10-03': [
          {
            id: 't1',
            name: 'A',
            icon: 'A',
            status: 'todo',
            open: false,
            subtasks: [],
          },
          {
            id: 't2',
            name: 'B',
            icon: 'B',
            status: 'done',
            open: false,
            subtasks: [],
          },
          {
            id: 't3',
            name: 'C',
            icon: 'C',
            status: 'skip',
            open: false,
            subtasks: [],
          },
        ],
      }
      useAppStore.setState({ data })
      render(<TabBar />)

      expect(screen.getByTestId('tab-tasks')).toHaveAttribute('title', text)
    }
  )

  it('follows the stored language', () => {
    load('zh')
    render(<TabBar />)
    expect(screen.getByTestId('tab-folders')).toHaveAttribute(
      'title',
      expect.stringContaining('个分组')
    )

    act(() => {
      const data = useAppStore.getState().data!
      data.prefs.lang = 'en'
      useAppStore.setState({ data: { ...data } })
    })

    expect(screen.getByTestId('tab-folders')).toHaveAttribute(
      'title',
      expect.stringContaining('groups')
    )
  })
})

describe('TabBar actions of the category', () => {
  beforeEach(() => {
    load('en')
    useAppStore.setState({ modal: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('offers a new group and an add button for a collection', () => {
    useAppStore.setState({ currentTab: 'notes' })
    render(<TabBar />)

    expect(screen.getByTestId('add-group-notes')).toBeInTheDocument()
    expect(screen.getByTestId('add-loose-item-notes')).toBeInTheDocument()
    expect(screen.queryByTestId('add-task')).toBeNull()
  })

  it('offers only "add task" on the task page', () => {
    useAppStore.setState({ currentTab: 'tasks' })
    render(<TabBar />)

    expect(screen.getByTestId('add-task')).toBeInTheDocument()
    expect(screen.queryByTestId('add-group-tasks')).toBeNull()
    expect(screen.queryByTestId('add-loose-item-tasks')).toBeNull()
  })

  it('follows the category', () => {
    render(<TabBar />)
    expect(screen.getByTestId('add-loose-item-folders')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('tab-commands'))

    expect(screen.queryByTestId('add-loose-item-folders')).toBeNull()
    expect(screen.getByTestId('add-loose-item-commands')).toHaveAttribute(
      'aria-label',
      'New command'
    )
  })

  it('opens the group form and the entry form for the current category', () => {
    useAppStore.setState({ currentTab: 'websites' })
    render(<TabBar />)

    fireEvent.click(screen.getByTestId('add-group-websites'))
    expect(useAppStore.getState().modal).toEqual({
      kind: 'group',
      tab: 'websites',
      groupId: null,
    })
    fireEvent.click(screen.getByTestId('add-loose-item-websites'))
    expect(useAppStore.getState().modal).toEqual({
      kind: 'item',
      tab: 'websites',
      groupId: null,
      itemId: null,
    })
  })

  it('opens the task form on the selected day', () => {
    useAppStore.setState({ currentTab: 'tasks', selectedDate: '2026-10-05' })
    render(<TabBar />)

    fireEvent.click(screen.getByTestId('add-task'))

    expect(useAppStore.getState().modal).toEqual({
      kind: 'task',
      date: '2026-10-05',
      taskId: null,
    })
  })

  it('names the buttons even where only their icon is drawn', () => {
    render(<TabBar />)

    expect(screen.getByTestId('add-group-folders')).toHaveAttribute(
      'aria-label',
      'New group'
    )
    expect(screen.getByTestId('add-group-folders')).toHaveAttribute(
      'title',
      'New group'
    )
    expect(screen.getByTestId('add-loose-item-folders')).toHaveAttribute(
      'aria-label',
      'Add item'
    )
  })
})

describe('TabBar marker', () => {
  const offsetLeft = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetLeft'
  )
  const offsetWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetWidth'
  )

  beforeEach(() => {
    load('en')
    // Tabs of 60px with a 2px gap, so the tab at index i starts at 62 * i.
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get(this: HTMLElement) {
        const parent = this.parentElement
        return parent && this.classList.contains('tab-button')
          ? Array.from(parent.children).indexOf(this) * 62
          : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('tab-button') ? 60 : 0
      },
    })
  })

  afterEach(() => {
    cleanup()
    if (offsetLeft)
      Object.defineProperty(HTMLElement.prototype, 'offsetLeft', offsetLeft)
    if (offsetWidth)
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
  })

  it('is placed under the measured active button, not at a fixed fraction', () => {
    useAppStore.setState({ currentTab: 'passwords' })
    render(<TabBar />)

    const nav = screen.getByRole('navigation')
    expect(nav.style.getPropertyValue('--tab-x')).toBe('186px')
    expect(nav.style.getPropertyValue('--tab-w')).toBe('60px')
  })

  it('follows another category', () => {
    render(<TabBar />)
    const nav = screen.getByRole('navigation')
    expect(nav.style.getPropertyValue('--tab-x')).toBe('0px')

    fireEvent.click(screen.getByTestId('tab-tasks'))

    expect(nav.style.getPropertyValue('--tab-x')).toBe('372px')
  })

  it('does not assume seven tabs or a row count', () => {
    render(<TabBar />)
    const nav = screen.getByRole('navigation')

    for (const name of [
      '--active-tab',
      '--compact-tab-column',
      '--compact-tab-row',
    ])
      expect(nav.style.getPropertyValue(name), name).toBe('')
  })

  it('is put in place without the slide on the first frame', () => {
    render(<TabBar />)

    expect(screen.getByRole('navigation')).toHaveAttribute(
      'data-marker-instant'
    )
  })

  it('slides for a change of category once the first frame has been drawn', async () => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    try {
      render(<TabBar />)
      const nav = screen.getByRole('navigation')
      expect(nav).toHaveAttribute('data-marker-instant')
      act(() => callbacks.splice(0).forEach((callback) => callback(0)))
      expect(nav).not.toHaveAttribute('data-marker-instant')

      fireEvent.click(screen.getByTestId('tab-notes'))

      expect(nav).not.toHaveAttribute('data-marker-instant')
      expect(nav.style.getPropertyValue('--tab-x')).toBe('310px')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
