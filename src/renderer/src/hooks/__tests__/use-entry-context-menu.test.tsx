import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextMenuItem } from '../../../../shared/context-menu'
import { createDefaultAppData } from '../../../../shared/default-data'
import type { AppData, FolderItem, GroupTab } from '../../../../shared/types'
import { clearUndoRecord } from '../../store/undo'
import { useAppStore } from '../../store/use-app-store'
import { entryTargetAt, useEntryContextMenu } from '../use-entry-context-menu'

const state = () => useAppStore.getState()
const menuMock = () => vi.mocked(window.quickLaunch.showContextMenu)

function folder(id: string): FolderItem {
  return {
    id,
    kind: 'folder',
    name: `Folder ${id}`,
    icon: 'F',
    path: `C:\\${id}`,
  }
}

function seed(): AppData {
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  data.folders = [
    {
      id: 'g1',
      name: 'Work',
      icon: 'W',
      open: true,
      items: [folder('a1'), folder('a2')],
    },
    { id: 'g2', name: 'Home', icon: 'H', open: true, items: [] },
  ]
  data.loose.folders = [folder('l1')]
  data.topOrder.folders = [
    { type: 'loose', id: 'l1' },
    { type: 'group', id: 'g1' },
    { type: 'group', id: 'g2' },
  ]
  data.loose.passwords = [
    {
      id: 'p1',
      kind: 'password',
      name: 'Mail',
      icon: 'K',
      username: 'me@x.test',
      password: 'secret',
      note: '',
    },
  ]

  return data
}

/** A page with one of every kind of tile, marked the way the real ones are. */
function Page({ tab }: { tab: GroupTab }): JSX.Element {
  const menu = useEntryContextMenu(tab)

  return (
    <section data-testid="page" {...menu}>
      <article
        data-top-entry-id="l1"
        data-top-entry-type="loose"
        data-testid="loose"
        tabIndex={0}
      >
        <button type="button">inner</button>
        <input data-testid="field" />
      </article>
      <article
        data-top-entry-id="g1"
        data-top-entry-type="group"
        data-testid="group"
        tabIndex={0}
      >
        <div
          data-list-group-id="g1"
          data-list-item-id="a1"
          data-testid="row"
          tabIndex={0}
        >
          row
        </div>
      </article>
      <div data-popup-item-id="a2" data-testid="popup-tile" tabIndex={0} />
      <p data-testid="empty">nothing here</p>
    </section>
  )
}

function mount(tab: GroupTab = 'folders'): void {
  useAppStore.setState({
    data: seed(),
    currentTab: tab,
    loading: false,
    modal: null,
    toast: null,
    widgetPopup: null,
    error: null,
  })
  render(<Page tab={tab} />)
}

/** Picks an item of the menu the next time one is shown. */
function choose(id: string | null): ContextMenuItem[][] {
  const shown: ContextMenuItem[][] = []
  menuMock().mockImplementation(async (items) => {
    shown.push(items)
    return { ok: true, data: id }
  })

  return shown
}

const flatten = (items: ContextMenuItem[]) =>
  items.flatMap((item) => [item, ...(item.submenu ?? [])])

describe('entryTargetAt', () => {
  beforeEach(() => mount())
  afterEach(cleanup)

  it('reads a loose entry, a group, and an entry in a group of the list', () => {
    expect(entryTargetAt(screen.getByTestId('loose'), 'folders')).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: null,
      itemId: 'l1',
    })
    expect(entryTargetAt(screen.getByTestId('group'), 'folders')).toEqual({
      kind: 'group',
      tab: 'folders',
      groupId: 'g1',
    })
    // The row of an entry sits inside its group card: the nearer one is the one.
    expect(entryTargetAt(screen.getByTestId('row'), 'folders')).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: 'g1',
      itemId: 'a1',
    })
  })

  it('finds the entry from anything inside it', () => {
    expect(
      entryTargetAt(screen.getByRole('button', { name: 'inner' }), 'folders')
    ).toMatchObject({ itemId: 'l1' })
  })

  it('reads a tile of the open group popup with the group that is open', () => {
    expect(
      entryTargetAt(screen.getByTestId('popup-tile'), 'folders')
    ).toBeNull()

    useAppStore.setState({ widgetPopup: { tab: 'folders', groupId: 'g1' } })

    expect(entryTargetAt(screen.getByTestId('popup-tile'), 'folders')).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: 'g1',
      itemId: 'a2',
    })
  })

  it('reads nothing from the space between entries', () => {
    expect(entryTargetAt(screen.getByTestId('empty'), 'folders')).toBeNull()
    expect(entryTargetAt(null, 'folders')).toBeNull()
  })
})

describe('right-click', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearUndoRecord()
    mount()
  })

  afterEach(cleanup)

  it('opens the menu of the entry under the pointer, and holds back the default menu', async () => {
    const shown = choose(null)

    let notPrevented = true
    await act(async () => {
      notPrevented = fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(notPrevented).toBe(false)
    expect(shown).toHaveLength(1)
    expect(flatten(shown[0]!).map((item) => item.label)).toContain('Delete')
    // With the pointer there is no position: the menu opens where the mouse is.
    expect(menuMock()).toHaveBeenCalledWith(shown[0], undefined)
  })

  it('opens the menu of a group on its card', async () => {
    const shown = choose(null)

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('group'))
    })

    expect(shown[0]!.map((item) => item.label ?? item.type)).toEqual([
      'Open',
      'Rename…',
      'separator',
      'Delete',
    ])
  })

  it('leaves the space between entries alone', async () => {
    const shown = choose(null)

    let notPrevented = false
    await act(async () => {
      notPrevented = fireEvent.contextMenu(screen.getByTestId('empty'))
    })

    expect(shown).toHaveLength(0)
    expect(notPrevented).toBe(true)
  })

  it('does nothing when the menu is dismissed', async () => {
    choose(null)

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().modal).toBeNull()
    expect(state().toast).toBeNull()
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('says so when the menu could not be shown', async () => {
    menuMock().mockResolvedValueOnce({ ok: false, error: 'menu failed' })

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().toast).toMatchObject({
      message: 'menu failed',
      tone: 'danger',
    })
  })

  it('renames: opens the editor on that entry', async () => {
    choose('rename')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().modal).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: null,
      itemId: 'l1',
      focus: 'name',
    })
  })

  it('renames a group: opens the group form', async () => {
    choose('rename')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('group'))
    })

    expect(state().modal).toEqual({
      kind: 'group',
      tab: 'folders',
      groupId: 'g1',
    })
  })

  it('deletes at once with the undo in the strip, like every other delete', async () => {
    choose('delete')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().data!.loose.folders).toEqual([])
    expect(state().toast?.action?.label).toBe('Undo')
  })

  it('asks before deleting a group that holds entries', async () => {
    choose('delete')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('group'))
    })

    expect(state().modal?.kind).toBe('confirm')
    expect(state().data!.folders).toHaveLength(2)
  })

  it('moves an entry to the group that was chosen, and says so', async () => {
    choose('move:group:g2')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().data!.loose.folders).toEqual([])
    expect(state().data!.folders[1]!.items.map((item) => item.id)).toEqual([
      'l1',
    ])
    expect(state().toast?.message).toBe('Moved to "Home"')
  })

  it('moves an entry of a group out to the standalone entries', async () => {
    choose('move:loose')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('row'))
    })

    expect(state().data!.loose.folders.map((item) => item.id)).toEqual([
      'l1',
      'a1',
    ])
    expect(state().data!.folders[0]!.items.map((item) => item.id)).toEqual([
      'a2',
    ])
  })

  it('opens a group in its popup', async () => {
    choose('open')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('group'))
    })

    expect(state().widgetPopup).toEqual({ tab: 'folders', groupId: 'g1' })
  })

  it('launches an entry', async () => {
    choose('open')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(window.quickLaunch.openPath).toHaveBeenCalledWith('C:\\l1')
  })

  it('ignores an id that is not one of its items', async () => {
    choose('format-disk')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().modal).toBeNull()
    expect(state().data!.loose.folders).toHaveLength(1)
  })
})

describe('right-click on a password entry', () => {
  let written: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    written = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async (value: string) => {
          written.push(value)
        }),
      },
    })
    mount('passwords')
    // The page's loose tile stands for the password entry on this tab.
    const tile = screen.getByTestId('loose')
    tile.setAttribute('data-top-entry-id', 'p1')
  })

  afterEach(cleanup)

  it('copies the password or the username, and says so', async () => {
    choose('copy-password')
    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })
    expect(written).toEqual(['secret'])
    expect(state().toast?.message).toBe('Password copied')

    choose('copy-username')
    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })
    expect(written).toEqual(['secret', 'me@x.test'])
    expect(state().toast?.message).toBe('Username copied')
  })

  it('says why when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('blocked')
        }),
      },
    })
    choose('copy-password')

    await act(async () => {
      fireEvent.contextMenu(screen.getByTestId('loose'))
    })

    expect(state().toast).toMatchObject({ message: 'blocked', tone: 'danger' })
  })
})

describe('the keyboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.clearAllMocks()
    clearUndoRecord()
    mount()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('F2 opens the editor on the focused entry', () => {
    const prevented = !fireEvent.keyDown(screen.getByTestId('loose'), {
      key: 'F2',
    })

    expect(prevented).toBe(true)
    expect(state().modal).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: null,
      itemId: 'l1',
      focus: 'name',
    })
  })

  it('F2 on a group opens the group form, on a row of the list the row', () => {
    fireEvent.keyDown(screen.getByTestId('group'), { key: 'F2' })
    expect(state().modal).toMatchObject({ kind: 'group', groupId: 'g1' })

    useAppStore.setState({ modal: null })
    fireEvent.keyDown(screen.getByTestId('row'), { key: 'F2' })
    expect(state().modal).toMatchObject({
      kind: 'item',
      groupId: 'g1',
      itemId: 'a1',
    })
  })

  it('Delete deletes the focused entry at once, with the undo offered', async () => {
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('loose'), { key: 'Delete' })
    })

    expect(state().data!.loose.folders).toEqual([])
    expect(state().toast?.action?.label).toBe('Undo')
  })

  it('works from a button inside the entry, too', async () => {
    fireEvent.keyDown(screen.getByRole('button', { name: 'inner' }), {
      key: 'F2',
    })

    expect(state().modal).toMatchObject({ itemId: 'l1' })
  })

  it('leaves F2 and Delete alone in a text field', () => {
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'F2' })
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'Delete' })

    expect(state().modal).toBeNull()
    expect(state().data!.loose.folders).toHaveLength(1)
  })

  it('leaves them alone with Ctrl, Alt or Meta held, and while a dialog is open', () => {
    fireEvent.keyDown(screen.getByTestId('loose'), { key: 'F2', ctrlKey: true })
    fireEvent.keyDown(screen.getByTestId('loose'), {
      key: 'Delete',
      altKey: true,
    })
    fireEvent.keyDown(screen.getByTestId('loose'), {
      key: 'Delete',
      metaKey: true,
    })
    expect(state().modal).toBeNull()
    expect(state().data!.loose.folders).toHaveLength(1)

    useAppStore.setState({ modal: { kind: 'settings' } })
    fireEvent.keyDown(screen.getByTestId('loose'), { key: 'Delete' })
    expect(state().data!.loose.folders).toHaveLength(1)
  })

  it('does nothing away from an entry', () => {
    const notPrevented = fireEvent.keyDown(screen.getByTestId('empty'), {
      key: 'F2',
    })

    expect(notPrevented).toBe(true)
    expect(state().modal).toBeNull()
  })

  it('Shift+F10 and the menu key open the menu below the entry, in window pixels', async () => {
    const shown = choose(null)
    const tile = screen.getByTestId('loose')
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      right: 240,
      top: 100,
      bottom: 144,
      width: 200,
      height: 44,
      x: 40,
      y: 100,
      toJSON: () => ({}),
    })

    await act(async () => {
      fireEvent.keyDown(tile, { key: 'F10', shiftKey: true })
    })
    await act(async () => {
      fireEvent.keyDown(tile, { key: 'ContextMenu' })
    })

    expect(shown).toHaveLength(2)
    expect(menuMock()).toHaveBeenNthCalledWith(1, shown[0], { x: 64, y: 140 })
    expect(menuMock()).toHaveBeenNthCalledWith(2, shown[1], { x: 64, y: 140 })
  })

  it('answers the menu key once, though the browser raises its own contextmenu event after it', async () => {
    const shown = choose(null)
    const tile = screen.getByTestId('loose')

    await act(async () => {
      fireEvent.keyDown(tile, { key: 'ContextMenu' })
      fireEvent.contextMenu(tile)
    })

    expect(shown).toHaveLength(1)
    // The echo is held back too, so the page's own menu does not show up either.
    // A right-click a while later is a new request.
    await act(async () => {
      vi.setSystemTime(Date.now() + 2000)
      fireEvent.contextMenu(tile)
    })
    expect(shown).toHaveLength(2)
  })

  it('does not take F10 without Shift', async () => {
    const shown = choose(null)

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('loose'), { key: 'F10' })
    })

    expect(shown).toHaveLength(0)
  })

  it('does not act on a key that another handler has taken', () => {
    const tile = screen.getByTestId('loose')
    tile.addEventListener('keydown', (event) => event.preventDefault())

    fireEvent.keyDown(tile, { key: 'F2' })

    expect(state().modal).toBeNull()
  })
})
