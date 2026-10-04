import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type {
  CommandItem,
  FolderItem,
  PasswordItem,
  TaskItem,
} from '../../../../shared/types'
import { useAppStore } from '../../store/use-app-store'
import {
  getGroupItemSortableId,
  getPopupItemSortableId,
  getTopEntrySortableId,
} from '../../dnd/move-operations'
import CommandPalette from '../common/CommandPalette'
import FolderWidget from '../groups/FolderWidget'
import GroupCard from '../groups/GroupCard'
import LooseWidget from '../groups/LooseWidget'
import WidgetPopup from '../groups/WidgetPopup'
import CommandSnippet from '../items/CommandSnippet'
import GridItem from '../items/GridItem'
import ItemRow from '../items/ItemRow'
import PasswordCard from '../items/PasswordCard'
import TaskCard from '../tasks/TaskCard'
import DragOverlayPreview from '../sections/group-section/DragOverlayPreview'

const TILE = 'tile:rocket-launch:9'

const folder = (icon: string): FolderItem => ({
  id: 'f1',
  kind: 'folder',
  name: 'Tile folder',
  icon,
  path: 'C:\tile',
})
const password = (icon: string): PasswordItem => ({
  id: 'p1',
  kind: 'password',
  name: 'Tile password',
  icon,
  username: 'me',
  password: 'secret',
  note: '',
})
const command = (icon: string): CommandItem => ({
  id: 'c1',
  kind: 'command',
  name: 'Tile command',
  icon,
  content: 'dir',
  language: 'powershell',
  description: '',
})
const task = (icon: string): TaskItem => ({
  id: 't1',
  name: 'Tile task',
  icon,
  status: 'todo',
  open: true,
  subtasks: [],
})

// Slot class -> what each place draws for a stored icon value.
const SLOTS: Array<[string, (icon: string) => HTMLElement]> = [
  [
    'group-card-icon',
    (icon) =>
      render(
        <GroupCard
          tab="folders"
          group={{ id: 'g1', name: 'G', icon, open: false, items: [] }}
        />
      ).container,
  ],
  [
    'widget-folder-symbol',
    (icon) =>
      render(
        <FolderWidget
          tab="folders"
          groupId="g1"
          name="G"
          icon={icon}
          count={0}
          previewIcons={[]}
        />
      ).container,
  ],
  [
    'loose-icon-source',
    (icon) =>
      render(<LooseWidget tab="folders" item={folder(icon)} />).container,
  ],
  [
    'grid-ico',
    (icon) =>
      render(<GridItem tab="folders" groupId="g1" item={folder(icon)} />)
        .container,
  ],
  [
    'item-icon',
    (icon) =>
      render(<ItemRow tab="folders" groupId="g1" item={folder(icon)} />)
        .container,
  ],
  [
    'item-icon',
    (icon) =>
      render(
        <PasswordCard
          item={password(icon)}
          revealed={false}
          onToggleReveal={() => {}}
          onCopyUsername={async () => true}
          onCopyPassword={async () => true}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      ).container,
  ],
  [
    'snippet-icon',
    (icon) =>
      render(
        <CommandSnippet
          item={command(icon)}
          onCopy={async () => true}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      ).container,
  ],
  [
    'task-card-icon',
    (icon) =>
      render(<TaskCard date="2026-10-03" task={task(icon)} />).container,
  ],
]

describe('every place that shows an entry icon draws a tile through EntryIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no scrollIntoView; the search palette scrolls the selected result into view.
    Element.prototype.scrollIntoView = vi.fn()
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'folders',
      modal: null,
      widgetPopup: null,
      commandOpen: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it.each(SLOTS)('%s', (slot, mount) => {
    const container = mount(TILE)
    const tile = container.querySelector(`.${slot} > .entry-tile`)

    expect(tile).not.toBeNull()
    expect(tile).toHaveAttribute('data-tile-glyph', 'rocket-launch')
    expect(tile).toHaveAttribute('data-tile-color', '9')
  })

  it('shows the same tile in the group popup and the search results', () => {
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    data.folders = [
      {
        id: 'g1',
        name: 'Popup group',
        icon: TILE,
        open: true,
        items: [folder(TILE)],
      },
    ]
    data.topOrder.folders = [{ type: 'group', id: 'g1' }]
    useAppStore.setState({
      data,
      widgetPopup: { tab: 'folders', groupId: 'g1' },
    })
    render(<WidgetPopup />)
    expect(
      document.querySelector('.widget-popup-icon > .entry-tile')
    ).toHaveAttribute('data-tile-glyph', 'rocket-launch')
    cleanup()

    useAppStore.setState({ widgetPopup: null, commandOpen: true })
    render(<CommandPalette />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Tile folder' },
    })
    act(() => {})

    const resultTile = document.querySelector(
      '.command-result-icon > .entry-tile'
    )
    expect(resultTile).toHaveAttribute('data-tile-glyph', 'rocket-launch')
    expect(resultTile).toHaveAttribute('data-tile-color', '9')
  })

  it.each(SLOTS)('%s keeps an old emoji value as plain text', (slot, mount) => {
    const container = mount('💼')
    const text = container.querySelector(`.${slot} > span`)

    expect(text?.textContent).toBe('💼')
    expect(container.querySelector('.entry-tile')).toBeNull()
  })
})

describe('the drag preview shows the same tile as the card it was lifted from', () => {
  const group = {
    id: 'g1',
    name: 'Dragged group',
    icon: TILE,
    open: true,
    items: [folder(TILE)],
  }

  function preview(id: string, isGridMode: boolean): HTMLElement {
    const data = createDefaultAppData()
    data.folders = [group]
    data.loose.folders = [{ ...folder(TILE), id: 'loose-1' }]
    useAppStore.setState({ data })

    return render(
      <DragOverlayPreview
        tab="folders"
        data={data}
        activeDragOverlay={{ id, width: 200, height: 60, anchorOffset: null }}
        popup={{ tab: 'folders', groupId: 'g1' }}
        popupGroup={group}
        isGridMode={isGridMode}
      />
    ).container
  }

  afterEach(() => {
    cleanup()
  })

  it.each([
    ['a grid group', getTopEntrySortableId({ type: 'group', id: 'g1' }), true],
    ['a list group', getTopEntrySortableId({ type: 'group', id: 'g1' }), false],
    [
      'a grid loose entry',
      getTopEntrySortableId({ type: 'loose', id: 'loose-1' }),
      true,
    ],
    [
      'a list loose entry',
      getTopEntrySortableId({ type: 'loose', id: 'loose-1' }),
      false,
    ],
    ['an entry inside a group', getGroupItemSortableId('g1', 'f1'), false],
    ['an entry inside the popup', getPopupItemSortableId('f1'), true],
  ])('%s', (_label, id, isGridMode) => {
    const tile = preview(id, isGridMode).querySelector('.entry-tile')

    expect(tile).toHaveAttribute('data-tile-glyph', 'rocket-launch')
    expect(tile).toHaveAttribute('data-tile-color', '9')
  })
})

describe('no component prints an icon string directly', () => {
  const componentsRoot = resolve(__dirname, '..')

  function files(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        return entry.name === '__tests__' ? [] : files(full)
      }
      return entry.name.endsWith('.tsx') ? [full] : []
    })
  }

  it('renders item, group, task and result icons only through EntryIcon', () => {
    const offenders: string[] = []

    for (const file of files(componentsRoot)) {
      const source = readFileSync(file, 'utf8')
      // `{item.icon}`, `{group.icon}`, `{task.icon}`, `{result.icon}` or a bare `{icon}` as JSX text.
      if (/>\s*\{\s*(?:\w+\.)?icon\s*\}\s*</.test(source)) {
        offenders.push(relative(componentsRoot, file))
      }
    }

    // EntryIcon is the renderer itself; EmptyState takes a ready-made React node, not a stored string.
    const allowed = ['EntryIcon.tsx', 'EmptyState.tsx']

    expect(
      offenders.filter((file) => !allowed.some((name) => file.endsWith(name)))
    ).toEqual([])
  })
})
