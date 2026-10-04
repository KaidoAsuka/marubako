import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { TaskItem } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import WidgetPopup from '../../groups/WidgetPopup'
import Modal from '../Modal'

const DATE = '2026-03-10'

function task(): TaskItem {
  return {
    id: 'task-a',
    name: 'Write report',
    icon: 'T',
    status: 'todo',
    open: true,
    subtasks: [{ id: 'sub-a', name: 'Outline', status: 'todo' }],
  }
}

function open(
  modal: NonNullable<ReturnType<typeof useAppStore.getState>['modal']>
) {
  act(() => useAppStore.getState().setModal(modal))
}

const overlay = () => document.querySelector('.modal-overlay') as HTMLElement
const modalOpen = () => useAppStore.getState().modal !== null

function pressEscape(): void {
  fireEvent.keyDown(document, { key: 'Escape' })
}

describe('closing a dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia; the presence snapshot asks it about reduced motion.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    const data = createDefaultAppData()
    data.tasks[DATE] = [task()]
    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      error: null,
      selectedDate: DATE,
      modal: null,
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null })
  })

  describe('by a click on the backdrop', () => {
    it('closes a clean dialog when the press and the release are both on the backdrop', () => {
      render(<Modal />)
      open({ kind: 'group', tab: 'folders', groupId: null })

      fireEvent.mouseDown(overlay())
      fireEvent.click(overlay())

      expect(modalOpen()).toBe(false)
    })

    it('stays open when the press started inside the card and ended on the backdrop', () => {
      render(<Modal />)
      open({ kind: 'group', tab: 'folders', groupId: null })

      // Dragging a text selection out of an input and letting go over the backdrop: the browser
      // reports a click on the backdrop, the nearest ancestor both ends share.
      fireEvent.mouseDown(screen.getByTestId('group-name-input'))
      fireEvent.mouseUp(overlay())
      fireEvent.click(overlay())

      expect(modalOpen()).toBe(true)
    })

    it('forgets the press, so a later plain click on the backdrop still closes', () => {
      render(<Modal />)
      open({ kind: 'group', tab: 'folders', groupId: null })

      fireEvent.mouseDown(screen.getByTestId('group-name-input'))
      fireEvent.click(overlay())
      expect(modalOpen()).toBe(true)

      fireEvent.mouseDown(overlay())
      fireEvent.click(overlay())
      expect(modalOpen()).toBe(false)
    })

    it('keeps the settings dialog open when a slider drag ends on the backdrop', async () => {
      render(<Modal />)
      open({ kind: 'settings' })
      // The settings page reads the launch settings when it opens.
      await act(async () => {})

      fireEvent.mouseDown(screen.getAllByRole('slider')[0]!)
      fireEvent.click(overlay())

      expect(modalOpen()).toBe(true)
    })
  })

  describe('with edits that are not saved', () => {
    function openDirtyGroup(): HTMLInputElement {
      render(<Modal />)
      open({ kind: 'group', tab: 'folders', groupId: null })
      const input = screen.getByTestId('group-name-input') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Work' } })
      return input
    }

    it('asks before Esc discards them, and Esc again means "keep editing"', () => {
      const input = openDirtyGroup()

      pressEscape()
      expect(modalOpen()).toBe(true)
      expect(screen.getByTestId('discard-bar')).toHaveTextContent(
        '放弃未保存的修改？'
      )
      expect(screen.getByTestId('discard-keep')).toHaveFocus()

      // Two quick Esc presses must not lose the draft.
      pressEscape()
      expect(modalOpen()).toBe(true)
      expect(screen.queryByTestId('discard-bar')).toBeNull()
      expect(input).toHaveValue('Work')
      expect(input).toHaveFocus()
    })

    it('discards them only after "Discard"', () => {
      openDirtyGroup()

      pressEscape()
      fireEvent.click(screen.getByTestId('discard-confirm'))

      expect(modalOpen()).toBe(false)
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })

    it('asks for the X button, the Cancel button and a click on the backdrop too', () => {
      openDirtyGroup()

      fireEvent.click(screen.getByRole('button', { name: '关闭' }))
      expect(screen.getByTestId('discard-bar')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('discard-keep'))
      expect(screen.queryByTestId('discard-bar')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: '取消' }))
      expect(screen.getByTestId('discard-bar')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('discard-keep'))

      fireEvent.mouseDown(overlay())
      fireEvent.click(overlay())
      expect(screen.getByTestId('discard-bar')).toBeInTheDocument()
      expect(modalOpen()).toBe(true)
    })

    it('puts the cursor back in the field the user was typing in, not the first one', () => {
      render(<Modal />)
      open({ kind: 'item', tab: 'notes', groupId: null, itemId: null })
      const body = screen.getByTestId('item-content-input')
      body.focus()
      fireEvent.change(body, { target: { value: 'a long thought' } })

      // Clicking the X moves focus to the X itself.
      const close = screen.getByRole('button', { name: '关闭' })
      close.focus()
      fireEvent.click(close)
      expect(screen.getByTestId('discard-keep')).toHaveFocus()
      fireEvent.click(screen.getByTestId('discard-keep'))

      expect(body).toHaveFocus()
    })

    it('does not take the X button as an answer while the question is showing', () => {
      openDirtyGroup()

      fireEvent.click(screen.getByRole('button', { name: '关闭' }))
      fireEvent.click(screen.getByRole('button', { name: '关闭' }))

      expect(modalOpen()).toBe(true)
      expect(screen.getByTestId('discard-bar')).toBeInTheDocument()
    })

    it('closes without asking after a successful save', async () => {
      openDirtyGroup()

      await act(async () => {
        fireEvent.click(screen.getByTestId('group-save'))
      })

      expect(window.quickLaunch.saveData).toHaveBeenCalled()
      expect(modalOpen()).toBe(false)
    })

    it('does not carry the question over to the next dialog', () => {
      openDirtyGroup()
      pressEscape()
      fireEvent.click(screen.getByTestId('discard-confirm'))
      expect(modalOpen()).toBe(false)

      open({ kind: 'group', tab: 'websites', groupId: null })
      expect(screen.queryByTestId('discard-bar')).toBeNull()
      pressEscape()
      expect(modalOpen()).toBe(false)
    })

    it('stops asking once the edit is undone by hand', () => {
      const input = openDirtyGroup()

      fireEvent.change(input, { target: { value: '' } })
      pressEscape()

      expect(modalOpen()).toBe(false)
    })
  })

  describe('with nothing changed', () => {
    it.each([
      ['group', { kind: 'group', tab: 'folders', groupId: null } as const],
      [
        'item',
        { kind: 'item', tab: 'notes', groupId: null, itemId: null } as const,
      ],
      ['task', { kind: 'task', date: DATE, taskId: null } as const],
      ['task (edit)', { kind: 'task', date: DATE, taskId: 'task-a' } as const],
      [
        'subtask',
        {
          kind: 'subtask',
          date: DATE,
          taskId: 'task-a',
          subtaskId: null,
        } as const,
      ],
      [
        'subtask (edit)',
        {
          kind: 'subtask',
          date: DATE,
          taskId: 'task-a',
          subtaskId: 'sub-a',
        } as const,
      ],
      ['settings', { kind: 'settings' } as const],
    ])('closes the %s dialog on Esc at once', async (_name, modal) => {
      render(<Modal />)
      open(modal)
      await act(async () => {})

      pressEscape()

      expect(modalOpen()).toBe(false)
    })

    it('closes at once from the Cancel button', () => {
      render(<Modal />)
      open({ kind: 'item', tab: 'notes', groupId: null, itemId: null })

      fireEvent.click(screen.getByRole('button', { name: '取消' }))

      expect(modalOpen()).toBe(false)
    })
  })

  // Every form that holds something worth keeping reports it.
  describe.each([
    [
      'item',
      { kind: 'item', tab: 'websites', groupId: null, itemId: null } as const,
      () =>
        fireEvent.change(screen.getByTestId('item-url-input'), {
          target: { value: 'example.com' },
        }),
    ],
    [
      'item (note body)',
      { kind: 'item', tab: 'notes', groupId: null, itemId: null } as const,
      () =>
        fireEvent.change(screen.getByTestId('item-content-input'), {
          target: { value: 'a long thought' },
        }),
    ],
    [
      'task',
      { kind: 'task', date: DATE, taskId: null } as const,
      () =>
        fireEvent.change(screen.getByTestId('task-name-input'), {
          target: { value: 'Plan' },
        }),
    ],
    [
      'task (only the status)',
      { kind: 'task', date: DATE, taskId: 'task-a' } as const,
      () =>
        fireEvent.change(screen.getByRole('combobox'), {
          target: { value: 'done' },
        }),
    ],
    [
      'subtask',
      {
        kind: 'subtask',
        date: DATE,
        taskId: 'task-a',
        subtaskId: null,
      } as const,
      () =>
        fireEvent.change(screen.getByTestId('subtask-name-input'), {
          target: { value: 'Draft' },
        }),
    ],
    [
      'subtask (rename)',
      {
        kind: 'subtask',
        date: DATE,
        taskId: 'task-a',
        subtaskId: 'sub-a',
      } as const,
      () =>
        fireEvent.change(screen.getByTestId('subtask-name-input'), {
          target: { value: 'Outline v2' },
        }),
    ],
  ])('the %s form', (_name, modal, edit) => {
    it('is asked about on Esc once edited, and keeps the edit on "Keep editing"', () => {
      render(<Modal />)
      open(modal)
      edit()

      pressEscape()
      expect(screen.getByTestId('discard-bar')).toBeInTheDocument()
      expect(modalOpen()).toBe(true)

      fireEvent.click(screen.getByTestId('discard-keep'))
      expect(modalOpen()).toBe(true)
      pressEscape()
      fireEvent.click(screen.getByTestId('discard-confirm'))
      expect(modalOpen()).toBe(false)
    })
  })
})

describe('the backdrop of the group popup', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    const data = createDefaultAppData()
    data.folders = [
      { id: 'g1', name: 'Popup group', icon: 'F', open: true, items: [] },
    ]
    data.topOrder.folders = [{ type: 'group', id: 'g1' }]
    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'folders',
      modal: null,
      widgetPopup: { tab: 'folders', groupId: 'g1' },
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ widgetPopup: null })
  })

  const backdrop = () =>
    document.querySelector('.widget-popup-overlay') as HTMLElement

  it('closes the popup on a click that started and ended on it', () => {
    render(<WidgetPopup />)

    fireEvent.mouseDown(backdrop())
    fireEvent.click(backdrop())

    expect(useAppStore.getState().widgetPopup).toBeNull()
  })

  it('keeps the popup when a press inside it ended on the backdrop', () => {
    render(<WidgetPopup />)

    fireEvent.mouseDown(document.querySelector('.widget-popup-title')!)
    fireEvent.click(backdrop())

    expect(useAppStore.getState().widgetPopup).not.toBeNull()
  })
})
