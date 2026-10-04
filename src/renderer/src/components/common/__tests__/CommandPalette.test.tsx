import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { AppData, GroupTab, Tab } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import { readRecent, recordUse } from '../../../utils/recent'
import CommandPalette from '../CommandPalette'

const state = () => useAppStore.getState()

// jsdom does not lay anything out, and has no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn()

/** A clean data set with one of each kind of entry. */
function dataSet(configure: (data: AppData) => void = () => {}): AppData {
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  for (const key of [
    'folders',
    'websites',
    'apps',
    'passwords',
    'notes',
    'commands',
  ] as const) {
    data[key] = []
    data.loose[key] = []
  }
  data.tasks = {}
  data.loose.websites = [
    {
      id: 'site',
      kind: 'website',
      name: 'Zeta site',
      icon: 'S',
      url: 'https://zeta.test',
    },
  ]
  data.loose.commands = [
    {
      id: 'cmd',
      kind: 'command',
      name: 'Zeta command',
      icon: 'C',
      content: 'Get-Process | Sort-Object CPU',
      language: 'powershell',
      description: 'list the busy ones',
    },
  ]
  data.loose.notes = [
    {
      id: 'note',
      kind: 'note',
      name: 'Zeta note',
      icon: 'N',
      content: 'remember the milk',
    },
  ]
  data.loose.passwords = [
    {
      id: 'pw',
      kind: 'password',
      name: 'Zeta login',
      icon: 'P',
      username: 'zeta@example.com',
      password: 'hunter2-secret',
      note: 'private hint',
    },
  ]
  configure(data)

  return data
}

function open(
  configure?: (data: AppData) => void,
  currentTab: Tab = 'folders'
): void {
  useAppStore.setState({
    data: dataSet(configure),
    loading: false,
    currentTab,
    commandOpen: true,
    modal: null,
    toast: null,
    widgetPopup: null,
  })
  render(<CommandPalette />)
}

const input = () => screen.getByTestId('command-input')
const options = () => screen.getAllByRole('option')
const optionNames = () =>
  options().map((option) => option.querySelector('strong')?.textContent)

async function search(query: string): Promise<void> {
  fireEvent.change(input(), { target: { value: query } })
  await waitFor(() => expect(options().length).toBeGreaterThan(0))
}

describe('the search palette: what Enter does', () => {
  let written: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    written = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async (value: string) => {
          written.push(value)
        }),
      },
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ commandOpen: false, modal: null, toast: null })
  })

  it('copies the code of a command and says so, without opening the editor', async () => {
    open()
    await search('zeta command')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(written).toEqual(['Get-Process | Sort-Object CPU'])
    expect(state().toast).toMatchObject({ message: 'Copied', tone: 'success' })
    expect(state().modal).toBeNull()
    expect(state().commandOpen).toBe(false)
  })

  it('copies the content of a note', async () => {
    open()
    await search('zeta note')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(written).toEqual(['remember the milk'])
    expect(state().modal).toBeNull()
  })

  it('copies the password of a password entry, and never shows it in the list', async () => {
    open()
    await search('zeta login')
    // The list shows the username, never the password or the note.
    expect(screen.getByTestId('command-palette')).not.toHaveTextContent(
      'hunter2-secret'
    )
    expect(screen.getByTestId('command-palette')).not.toHaveTextContent(
      'private hint'
    )

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(written).toEqual(['hunter2-secret'])
    expect(state().toast?.message).toBe('Password copied')
    expect(state().modal).toBeNull()
    expect(state().commandOpen).toBe(false)
  })

  it('does not search for the password', async () => {
    open()

    fireEvent.change(input(), { target: { value: 'hunter2' } })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('opens the editor for an entry with nothing to copy', async () => {
    open((data) => {
      data.loose.passwords[0]!.password = ''
    })
    await search('zeta login')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(written).toEqual([])
    expect(state().modal).toEqual({
      kind: 'item',
      tab: 'passwords',
      groupId: null,
      itemId: 'pw',
    })
  })

  it('opens the editor on Shift+Enter instead of copying, for any kind', async () => {
    open()
    await search('zeta command')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    })

    expect(written).toEqual([])
    expect(state().modal).toEqual({
      kind: 'item',
      tab: 'commands',
      groupId: null,
      itemId: 'cmd',
    })
    expect(state().currentTab).toBe('commands')
    expect(state().commandOpen).toBe(false)
  })

  it('opens the editor from the pencil on the row', async () => {
    open()
    await search('zeta note')

    fireEvent.click(screen.getByTestId('command-edit-0'))

    expect(written).toEqual([])
    expect(state().modal).toMatchObject({ kind: 'item', itemId: 'note' })
  })

  it('has a pencil on entries, none on groups or tasks', async () => {
    open((data) => {
      data.websites = [
        { id: 'g', name: 'Zeta group', icon: 'G', open: true, items: [] },
      ]
      data.tasks['2026-10-04'] = [
        {
          id: 't',
          name: 'Zeta task',
          icon: 'T',
          status: 'todo',
          open: true,
          subtasks: [],
        },
      ]
    })
    fireEvent.change(input(), { target: { value: 'zeta' } })

    const rows = screen.getAllByRole('option')
    for (const row of rows) {
      const kind = row.getAttribute('data-action')
      const hasPencil = row.parentElement?.querySelector('.command-result-edit')
      expect(Boolean(hasPencil), `${row.textContent}`).toBe(kind !== 'view')
    }
  })

  it('launches a website, and goes on to fold the panel when "hide after launch" is on', async () => {
    open((data) => {
      data.prefs.hideAfterLaunch = true
    })
    await search('zeta site')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(window.quickLaunch.openUrl).toHaveBeenCalledWith(
      'https://zeta.test',
      'default'
    )
    expect(window.quickLaunch.window.dismissAfterLaunch).toHaveBeenCalledTimes(
      1
    )
    expect(state().commandOpen).toBe(false)
  })

  it('launches a website and leaves the panel where it is when the setting is off', async () => {
    open()
    await search('zeta site')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(window.quickLaunch.openUrl).toHaveBeenCalledTimes(1)
    expect(window.quickLaunch.window.dismissAfterLaunch).not.toHaveBeenCalled()
    expect(state().commandOpen).toBe(false)
  })

  it('stays open and says why when a launch fails', async () => {
    vi.mocked(window.quickLaunch.openUrl).mockResolvedValueOnce({
      ok: false,
      error: 'no browser',
    })
    open()
    await search('zeta site')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(state().commandOpen).toBe(true)
    expect(state().toast).toMatchObject({
      message: 'Couldn’t open “Zeta site”. Please try again.',
      tone: 'danger',
    })
  })

  it('stays open and says why when the copy fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('clipboard blocked')
        }),
      },
    })
    open()
    await search('zeta note')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(state().commandOpen).toBe(true)
    expect(state().toast).toMatchObject({
      message: 'clipboard blocked',
      tone: 'danger',
    })
  })

  it('shows a group by opening it, as before', async () => {
    open((data) => {
      data.websites = [
        { id: 'g', name: 'Zeta group', icon: 'G', open: true, items: [] },
      ]
      data.prefs.viewMode = 'grid'
    })
    fireEvent.change(input(), { target: { value: 'zeta group' } })
    await waitFor(() => expect(options().length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(state().widgetPopup).toEqual({ tab: 'websites', groupId: 'g' })
    expect(state().currentTab).toBe('websites')
  })

  it('shows a group in the list layout by going to its page and opening it there: a list has no popup', async () => {
    open((data) => {
      data.websites = [
        { id: 'g', name: 'Zeta group', icon: 'G', open: false, items: [] },
      ]
      data.prefs.viewMode = 'list'
    })
    fireEvent.change(input(), { target: { value: 'zeta group' } })
    await waitFor(() => expect(options().length).toBeGreaterThan(0))

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(state().widgetPopup).toBeNull()
    expect(state().currentTab).toBe('websites')
    expect(state().data!.websites[0]).toMatchObject({ id: 'g', open: true })
    expect(state().commandOpen).toBe(false)
  })

  it('does nothing on Enter when there is no result', async () => {
    open()
    fireEvent.change(input(), { target: { value: 'nothing like this' } })

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(state().commandOpen).toBe(true)
    expect(written).toEqual([])
  })
})

describe('the search palette: the action is on the row', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ commandOpen: false, modal: null, toast: null })
  })

  it('names what Enter does on every row, by kind', async () => {
    open()
    await search('zeta')

    const labels = Object.fromEntries(
      options().map((option) => [
        option.querySelector('strong')?.textContent,
        option.querySelector('.command-result-action')?.textContent,
      ])
    )

    expect(labels).toEqual({
      'Zeta site': 'Launch',
      'Zeta command': 'Copy',
      'Zeta note': 'Copy',
      'Zeta login': 'Copy password',
    })
  })

  it('says "Edit" on an entry that has nothing to copy', async () => {
    open((data) => {
      data.loose.notes[0]!.content = ''
    })
    await search('zeta note')

    expect(options()[0]).toHaveTextContent('Edit')
  })

  it('puts the action of the selected row in the footer, and follows the selection', async () => {
    open()
    await search('zeta')
    const footer = screen.getByTestId('command-footer-enter')
    const first = options()[0]!.getAttribute('data-action')
    expect(first).toBe('open')
    expect(footer).toHaveTextContent('Launch')

    // The rows follow the order of the categories: site, login, command, note.
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(footer).toHaveTextContent('Copy password')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(footer).toHaveTextContent(/^\s*Copy\s*$/)
  })

  it('tells where the editor is: the footer names Shift+Enter, the pencil too', async () => {
    open()
    await search('zeta note')

    expect(screen.getByTestId('command-palette')).toHaveTextContent('Shift')
    expect(screen.getByTestId('command-edit-0')).toHaveAttribute(
      'title',
      'Edit (Shift+Enter)'
    )
  })

  it.each([
    ['zh', '复制密码'],
    ['en', 'Copy password'],
    ['ja', 'パスワードをコピー'],
  ] as const)('speaks %s', async (lang, label) => {
    open((data) => {
      data.prefs.lang = lang
    })
    fireEvent.change(input(), { target: { value: 'zeta login' } })
    await waitFor(() => expect(options().length).toBe(1))

    expect(options()[0]).toHaveTextContent(label)
  })
})

describe('the search palette: Alt+number', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ commandOpen: false, modal: null, toast: null })
  })

  it('does what Enter would on that row, without moving to it', async () => {
    open()
    await search('zeta')
    expect(optionNames()).toEqual([
      'Zeta site',
      'Zeta login',
      'Zeta command',
      'Zeta note',
    ])

    await act(async () => {
      fireEvent.keyDown(input(), { key: '4', altKey: true })
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'remember the milk'
    )
    expect(state().commandOpen).toBe(false)
  })

  it('does nothing for a number past the last row', async () => {
    open()
    await search('zeta')

    await act(async () => {
      fireEvent.keyDown(input(), { key: '9', altKey: true })
    })

    expect(state().commandOpen).toBe(true)
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('leaves Ctrl+Alt+number and a plain number alone', async () => {
    open()
    await search('zeta')

    await act(async () => {
      fireEvent.keyDown(input(), { key: '1', altKey: true, ctrlKey: true })
      fireEvent.keyDown(input(), { key: '1' })
    })

    expect(state().commandOpen).toBe(true)
    expect(window.quickLaunch.openUrl).not.toHaveBeenCalled()
  })

  it('shows the digits on the first nine rows while Alt is held, and only then', async () => {
    open((data) => {
      data.loose.notes = Array.from({ length: 12 }, (_, i) => ({
        id: `n${i}`,
        kind: 'note' as const,
        name: `Zeta note ${i}`,
        icon: 'N',
        content: 'x',
      }))
    })
    await search('zeta note')
    expect(screen.queryAllByTestId('command-digit')).toHaveLength(0)

    fireEvent.keyDown(input(), { key: 'Alt', altKey: true })
    expect(
      screen.getAllByTestId('command-digit').map((digit) => digit.textContent)
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])

    fireEvent.keyUp(input(), { key: 'Alt' })
    expect(screen.queryAllByTestId('command-digit')).toHaveLength(0)
  })

  it('hides the digits when the search loses focus while Alt is down', async () => {
    open()
    await search('zeta')
    fireEvent.keyDown(input(), { key: 'Alt', altKey: true })
    expect(screen.getAllByTestId('command-digit').length).toBeGreaterThan(0)

    fireEvent.blur(input())

    expect(screen.queryAllByTestId('command-digit')).toHaveLength(0)
  })
})

describe('the search palette before anything is typed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ commandOpen: false, modal: null, toast: null })
  })

  const caption = () => screen.getByTestId('command-caption')

  it('lists what was used lately, newest first, under "Recent"', () => {
    recordUse('websites', 'site')
    recordUse('notes', 'note')

    open()

    expect(caption()).toHaveTextContent('Recent')
    expect(optionNames()).toEqual(['Zeta note', 'Zeta site'])
  })

  it('lists the category it was opened from when nothing was used lately', () => {
    open(undefined, 'notes')

    expect(caption()).toHaveTextContent('This category')
    expect(optionNames()).toEqual(['Zeta note'])
  })

  it('lists the first entries of everything when that category is empty too', () => {
    open(undefined, 'folders')

    expect(caption()).toHaveTextContent('All items')
    expect(optionNames()).toEqual([
      'Zeta site',
      'Zeta login',
      'Zeta command',
      'Zeta note',
    ])
  })

  it('no longer calls the first stored entries "quick access"', () => {
    open(undefined, 'folders')

    expect(caption()).not.toHaveTextContent(/quick access/i)
  })

  it('skips a recent entry that was deleted or hidden', () => {
    recordUse('notes', 'gone')
    recordUse('websites', 'site')
    recordUse('notes', 'note')

    open((data) => {
      data.prefs.hiddenTabs = ['notes']
    })

    expect(optionNames()).toEqual(['Zeta site'])
  })

  it('records what is used from the search, so it comes back as recent', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    })
    open()
    await search('zeta note')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(readRecent()[0]).toEqual({ tab: 'notes' as GroupTab, id: 'note' })
  })

  it('records a launch, wherever it came from', async () => {
    open()
    await search('zeta site')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(readRecent()[0]).toEqual({ tab: 'websites', id: 'site' })
  })

  it('does not record a launch that failed', async () => {
    vi.mocked(window.quickLaunch.openUrl).mockResolvedValueOnce({
      ok: false,
      error: 'nope',
    })
    open()
    await search('zeta site')

    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })

    expect(readRecent()).toEqual([])
  })
})
