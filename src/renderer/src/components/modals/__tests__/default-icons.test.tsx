import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import {
  DEFAULT_GROUP_ICONS,
  DEFAULT_ITEM_ICONS,
  DEFAULT_TASK_ICON,
} from '../../../../../shared/default-icons'
import type { AppData, GroupTab } from '../../../../../shared/types'
import type { ModalState } from '../../../store/store-types'
import { useAppStore } from '../../../store/use-app-store'
import { parseTileIcon } from '../../../utils/tile-icon'
import GroupForm from '../GroupForm'
import ItemForm from '../ItemForm'
import TaskForm from '../TaskForm'

const TABS: GroupTab[] = [
  'folders',
  'websites',
  'apps',
  'passwords',
  'notes',
  'commands',
]

function saved(): AppData {
  const calls = vi.mocked(window.quickLaunch.saveData).mock.calls
  return calls[calls.length - 1]?.[0] as AppData
}

function seed({ modal }: { modal: ModalState }): void {
  useAppStore.setState({
    data: createDefaultAppData(),
    loading: false,
    currentTab: 'folders',
    modal,
  })
}

const previewTile = () =>
  screen
    .getByTestId('icon-picker-trigger')
    .querySelector('.entry-tile')
    ?.getAttribute('data-tile-glyph')

describe('the default icons of the forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('a new item', () => {
    function fillRequired(tab: GroupTab): void {
      fireEvent.change(screen.getByTestId('item-name-input'), {
        target: { value: 'New thing' },
      })
      if (tab === 'folders' || tab === 'apps') {
        fireEvent.change(screen.getByTestId('item-path-input'), {
          target: { value: 'C:\\New' },
        })
      } else if (tab === 'websites') {
        fireEvent.change(screen.getByTestId('item-url-input'), {
          target: { value: 'https://new.example.com' },
        })
      } else if (tab === 'commands') {
        fireEvent.change(screen.getByTestId('command-code-input'), {
          target: { value: 'Get-Date' },
        })
      }
    }

    it.each(TABS)('starts with the %s tile and saves it', async (tab) => {
      seed({ modal: { kind: 'item', tab, groupId: null, itemId: null } })
      render(<ItemForm />)

      expect(previewTile()).toBe(DEFAULT_ITEM_ICONS[tab].split(':')[1])
      fillRequired(tab)
      fireEvent.click(screen.getByTestId('item-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().loose[tab][0]?.icon).toBe(DEFAULT_ITEM_ICONS[tab])
    })

    it('saves the default tile when the icon was cleared, not an empty icon', async () => {
      seed({
        modal: { kind: 'item', tab: 'websites', groupId: null, itemId: null },
      })
      render(<ItemForm />)
      fireEvent.click(screen.getByTestId('icon-picker-trigger'))
      fireEvent.change(screen.getByTestId('icon-custom'), {
        target: { value: '🧪' },
      })
      fireEvent.change(screen.getByTestId('icon-custom'), {
        target: { value: '   ' },
      })
      fireEvent.keyDown(screen.getByTestId('icon-custom'), { key: 'Enter' })
      fillRequired('websites')
      fireEvent.click(screen.getByTestId('item-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().loose.websites[0]?.icon).toBe(DEFAULT_ITEM_ICONS.websites)
    })

    it('saves the glyph and colour picked in the form', async () => {
      seed({
        modal: { kind: 'item', tab: 'notes', groupId: null, itemId: null },
      })
      render(<ItemForm />)
      fireEvent.click(screen.getByTestId('icon-picker-trigger'))
      fireEvent.click(screen.getByTestId('icon-color-8'))
      fireEvent.click(
        document.querySelector('[data-glyph="lightbulb"]') as Element
      )
      fillRequired('notes')
      fireEvent.click(screen.getByTestId('item-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().loose.notes[0]?.icon).toBe('tile:lightbulb:8')
    })
  })

  describe('an existing item', () => {
    it('keeps its old emoji when edited without touching the icon', async () => {
      const data = createDefaultAppData()
      data.loose.websites = [
        {
          id: 'w1',
          kind: 'website',
          name: 'Old site',
          url: 'https://old.example.com',
          icon: '🔗',
        },
      ]
      data.topOrder.websites = [{ type: 'loose', id: 'w1' }]
      useAppStore.setState({
        data,
        loading: false,
        modal: { kind: 'item', tab: 'websites', groupId: null, itemId: 'w1' },
      })
      render(<ItemForm />)

      expect(
        screen
          .getByTestId('icon-picker-trigger')
          .querySelector('.emoji-picker-preview')
      ).toHaveTextContent('🔗')
      fireEvent.change(screen.getByTestId('item-name-input'), {
        target: { value: 'Renamed site' },
      })
      fireEvent.click(screen.getByTestId('item-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().loose.websites[0]).toMatchObject({
        name: 'Renamed site',
        icon: '🔗',
      })
    })
  })

  describe('a new group', () => {
    it.each(TABS)('starts with the %s group tile and saves it', async (tab) => {
      seed({ modal: { kind: 'group', tab, groupId: null } })
      render(<GroupForm />)

      expect(previewTile()).toBe(DEFAULT_GROUP_ICONS[tab].split(':')[1])
      fireEvent.change(screen.getByTestId('group-name-input'), {
        target: { value: 'New group' },
      })
      fireEvent.click(screen.getByTestId('group-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      const added = saved()[tab].find((group) => group.name === 'New group')
      expect(added?.icon).toBe(DEFAULT_GROUP_ICONS[tab])
    })

    it('keeps the emoji of an existing group when it is renamed', async () => {
      const data = createDefaultAppData()
      data.folders = [
        { id: 'g1', name: 'Old', icon: '💼', open: true, items: [] },
      ]
      useAppStore.setState({
        data,
        loading: false,
        modal: { kind: 'group', tab: 'folders', groupId: 'g1' },
      })
      render(<GroupForm />)
      fireEvent.change(screen.getByTestId('group-name-input'), {
        target: { value: 'Renamed' },
      })
      fireEvent.click(screen.getByTestId('group-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().folders[0]).toMatchObject({ name: 'Renamed', icon: '💼' })
    })
  })

  describe('a new task', () => {
    it('starts with the task tile and saves it', async () => {
      seed({ modal: { kind: 'task', date: '2026-03-10', taskId: null } })
      render(<TaskForm />)

      expect(previewTile()).toBe(DEFAULT_TASK_ICON.split(':')[1])
      fireEvent.change(screen.getByTestId('task-name-input'), {
        target: { value: 'Ship it' },
      })
      fireEvent.click(screen.getByTestId('task-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().tasks['2026-03-10']?.[0]?.icon).toBe(DEFAULT_TASK_ICON)
    })

    it('keeps the icon of an existing task when it is edited', async () => {
      const data = createDefaultAppData()
      data.tasks['2026-03-10'] = [
        {
          id: 't1',
          name: 'Old task',
          icon: '🎯',
          status: 'todo',
          open: true,
          subtasks: [],
        },
      ]
      useAppStore.setState({
        data,
        loading: false,
        modal: { kind: 'task', date: '2026-03-10', taskId: 't1' },
      })
      render(<TaskForm />)
      fireEvent.click(screen.getByTestId('task-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(saved().tasks['2026-03-10']?.[0]?.icon).toBe('🎯')
    })
  })
})

describe('the default icon values', () => {
  it('are valid tiles of the catalog, so the picker highlights them', () => {
    const values = [
      ...Object.values(DEFAULT_ITEM_ICONS),
      ...Object.values(DEFAULT_GROUP_ICONS),
      DEFAULT_TASK_ICON,
    ]

    for (const value of values) {
      expect(parseTileIcon(value), value).not.toBeNull()
    }
  })

  it('give every category a different colour', () => {
    const colours = TABS.map(
      (tab) => parseTileIcon(DEFAULT_ITEM_ICONS[tab])?.color
    )

    expect(new Set(colours).size).toBe(TABS.length)
  })

  it('make the sample data valid tiles too', () => {
    const data = createDefaultAppData()
    const icons = TABS.flatMap((tab) =>
      data[tab].flatMap((group) => [
        group.icon,
        ...group.items.map((item) => item.icon),
      ])
    )

    expect(icons.length).toBeGreaterThan(5)
    for (const icon of icons) {
      expect(parseTileIcon(icon), icon).not.toBeNull()
    }
  })
})
