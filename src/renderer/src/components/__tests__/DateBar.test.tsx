import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import { useAppShortcuts } from '../../hooks/use-app-shortcuts'
import DateBar from '../tasks/DateBar'
import { useAppStore } from '../../store/use-app-store'
import { addDays, todayKey } from '../../utils/date'

describe('DateBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const date = todayKey()
    const nextDate = addDays(date, 1)
    const data = createDefaultAppData()

    data.tasks[date] = [
      {
        id: 'task-datebar-today',
        name: 'Today task',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [],
      },
    ]
    data.tasks[nextDate] = [
      {
        id: 'task-datebar-next',
        name: 'Tomorrow task',
        icon: 'N',
        status: 'doing',
        open: true,
        subtasks: [],
      },
    ]

    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'tasks',
      selectedDate: date,
      modal: null,
      commandOpen: false,
      widgetPopup: null,
      windowState: { alwaysOnTop: false, collapsed: false, opacity: 1 },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('opens the in-app calendar and selects a day', () => {
    const nextDate = addDays(todayKey(), 1)

    render(<DateBar />)

    fireEvent.click(screen.getByTestId('date-display-toggle'))

    expect(screen.getByTestId('date-calendar')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId(`calendar-day-${nextDate}`))

    expect(useAppStore.getState().selectedDate).toBe(nextDate)
    expect(screen.queryByTestId('date-calendar')).not.toBeInTheDocument()
  })

  it.each(['0026-10-05', '20271-10-05', 'NaN-NaN-NaN'])(
    'falls back to today instead of crashing on the unusable selected day %s',
    (badKey) => {
      useAppStore.setState({ selectedDate: badKey })

      render(<DateBar />)

      expect(screen.getByTestId(`date-pill-${todayKey()}`)).toHaveClass(
        'active'
      )
      // The calendar shows the same fallback day and can still be opened.
      fireEvent.click(screen.getByTestId('date-display-toggle'))
      expect(screen.getByTestId('date-calendar')).toBeInTheDocument()
    }
  )

  describe('Escape with the calendar open', () => {
    it('closes only the calendar, keeps the panel open and refocuses the toggle', async () => {
      renderHook(useAppShortcuts)
      render(<DateBar />)
      const toggle = screen.getByTestId('date-display-toggle')
      fireEvent.click(toggle)
      expect(screen.getByTestId('date-calendar')).toBeInTheDocument()

      // Dispatch from a node inside the document so the event bubbles to the window listener.
      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'Escape' })
      })

      expect(screen.queryByTestId('date-calendar')).not.toBeInTheDocument()
      expect(window.quickLaunch.window.collapse).not.toHaveBeenCalled()
      expect(toggle).toHaveFocus()

      // With nothing left to close, the next Escape collapses the panel as before.
      await act(async () => {
        fireEvent.keyDown(document.body, { key: 'Escape' })
      })
      expect(window.quickLaunch.window.collapse).toHaveBeenCalledTimes(1)
    })

    it('leaves the key to a dialog that is open above the calendar', () => {
      render(<DateBar />)
      fireEvent.click(screen.getByTestId('date-display-toggle'))
      useAppStore.setState({
        modal: { kind: 'task', date: todayKey(), taskId: null },
      })

      const notPrevented = fireEvent.keyDown(document.body, { key: 'Escape' })

      // The dialog's own Escape handler ignores events that are already handled.
      expect(notPrevented).toBe(true)
    })
  })
})
