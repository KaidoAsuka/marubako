import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { TaskItem } from '../../../../shared/types'
import { useAppStore } from '../../store/use-app-store'
import { addDays, todayKey } from '../../utils/date'
import TaskForm from '../modals/TaskForm'

const DATE = '2026-03-10'
const NEXT_DATE = '2026-03-11'

function makeTask(id: string, overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id,
    name: `Task ${id}`,
    icon: 'T',
    status: 'todo',
    open: true,
    subtasks: [],
    ...overrides,
  }
}

function openEditor(taskId: string, date = DATE): void {
  useAppStore.setState({ modal: { kind: 'task', date, taskId } })
}

// Clicks save and lets the async store update (and the modal close) settle inside act().
async function save(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('task-save'))
  })
  await vi.waitFor(() => expect(useAppStore.getState().modal).toBeNull())
}

function ids(date: string): string[] {
  return (useAppStore.getState().data?.tasks[date] ?? []).map((task) => task.id)
}

describe('TaskForm editing an existing task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.tasks[DATE] = [
      makeTask('a'),
      makeTask('b', {
        open: false,
        subtasks: [{ id: 'sub-1', name: 'Sub one', status: 'done' }],
      }),
      makeTask('c'),
    ]
    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'tasks',
      selectedDate: DATE,
      modal: null,
      toast: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('offers the task own date as the destination, not the next day', () => {
    openEditor('b')
    render(<TaskForm />)

    const dateInput =
      document.querySelector<HTMLInputElement>('input[type="date"]')
    expect(dateInput?.value).toBe(DATE)
  })

  it('keeps the date and the list position when only the name changes', async () => {
    openEditor('b')
    render(<TaskForm />)

    fireEvent.change(screen.getByTestId('task-name-input'), {
      target: { value: 'Renamed' },
    })
    await save()

    expect(ids(DATE)).toEqual(['a', 'b', 'c'])
    expect(ids(NEXT_DATE)).toEqual([])
    const saved = useAppStore.getState().data?.tasks[DATE]?.[1]
    expect(saved?.name).toBe('Renamed')
    expect(saved?.open).toBe(false)
    expect(saved?.subtasks).toHaveLength(1)
    // A save that changes nothing the user can lose sight of says nothing.
    expect(useAppStore.getState().toast).toBeNull()
  })

  it('keeps the task on its date when only the status becomes done', async () => {
    openEditor('a')
    render(<TaskForm />)

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'done' },
    })
    await save()

    expect(ids(DATE)).toEqual(['a', 'b', 'c'])
    expect(useAppStore.getState().data?.tasks[DATE]?.[0]?.status).toBe('done')
    expect(ids(NEXT_DATE)).toEqual([])
  })

  it('moves the task to the chosen day, keeping subtasks and open, and says so', async () => {
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            tasks: {
              ...state.data.tasks,
              [NEXT_DATE]: [makeTask('x')],
            },
          }
        : null,
    }))
    openEditor('b')
    render(<TaskForm />)

    fireEvent.change(
      document.querySelector('input[type="date"]') as HTMLInputElement,
      { target: { value: NEXT_DATE } }
    )
    await save()

    expect(ids(DATE)).toEqual(['a', 'c'])
    expect(ids(NEXT_DATE)).toEqual(['x', 'b'])
    const moved = useAppStore.getState().data?.tasks[NEXT_DATE]?.[1]
    expect(moved?.open).toBe(false)
    expect(moved?.subtasks).toEqual([
      { id: 'sub-1', name: 'Sub one', status: 'done' },
    ])
    // The success message names the new day, and the user is not carried away from the current one.
    expect(useAppStore.getState().toast?.message).toBe('已移至 3月11日')
    expect(useAppStore.getState().selectedDate).toBe(DATE)
  })

  it('keeps the task in place when the date field is cleared', async () => {
    openEditor('a')
    render(<TaskForm />)

    fireEvent.change(
      document.querySelector('input[type="date"]') as HTMLInputElement,
      { target: { value: '' } }
    )
    await save()

    expect(ids(DATE)).toEqual(['a', 'b', 'c'])
  })

  // Chromium lets a half-typed year through as "0026-10-05" or "20271-10-05"; neither is a day the
  // Tasks tab can show, so saving them would orphan the task.
  describe('with a mistyped destination date', () => {
    const dateField = () =>
      document.querySelector('input[type="date"]') as HTMLInputElement

    it.each(['0026-10-05', '20271-10-05', '1999-12-31', '2101-01-01'])(
      'rejects %s: Save is disabled, an error shows and nothing is written',
      async (typed) => {
        openEditor('a')
        render(<TaskForm />)

        fireEvent.change(dateField(), { target: { value: typed } })
        // jsdom keeps these strings; if it ever sanitised them the test would prove nothing.
        expect(dateField().value).toBe(typed)

        expect(screen.getByRole('alert')).toHaveTextContent('日期无效')
        expect(screen.getByTestId('task-save')).toBeDisabled()

        await act(async () => {
          fireEvent.click(screen.getByTestId('task-save'))
        })

        expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
        expect(useAppStore.getState().modal).not.toBeNull()
        expect(ids(DATE)).toEqual(['a', 'b', 'c'])
        expect(Object.keys(useAppStore.getState().data?.tasks ?? {})).toEqual([
          DATE,
        ])
      }
    )

    it('does not cry wrong for the task own date or a cleared field', () => {
      openEditor('a')
      render(<TaskForm />)

      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByTestId('task-save')).toBeEnabled()

      fireEvent.change(dateField(), { target: { value: '' } })
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByTestId('task-save')).toBeEnabled()
    })

    it('saves again once the date is corrected', async () => {
      openEditor('a')
      render(<TaskForm />)

      fireEvent.change(dateField(), { target: { value: '0026-10-05' } })
      expect(screen.getByTestId('task-save')).toBeDisabled()
      fireEvent.change(dateField(), { target: { value: NEXT_DATE } })
      expect(screen.queryByRole('alert')).toBeNull()
      await save()

      expect(ids(DATE)).toEqual(['b', 'c'])
      expect(ids(NEXT_DATE)).toEqual(['a'])
    })
  })
})

describe('TaskForm creating a task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      currentTab: 'tasks',
      selectedDate: todayKey(),
      modal: null,
      toast: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  const dateField = () =>
    document.querySelector('input[type="date"]') as HTMLInputElement

  it('offers the date, starting at the selected day, and appends there by default', async () => {
    const date = todayKey()
    useAppStore.setState({ modal: { kind: 'task', date, taskId: null } })
    render(<TaskForm />)

    expect(dateField().value).toBe(date)
    // It is a plain "Date", not "Move to date": there is nothing to move yet.
    expect(screen.getByLabelText('日期')).toBe(dateField())
    fireEvent.change(screen.getByTestId('task-name-input'), {
      target: { value: 'Fresh' },
    })
    await save()

    expect(
      useAppStore.getState().data?.tasks[date]?.map((task) => task.name)
    ).toEqual(['Fresh'])
    // The task is where the user is looking: nothing to announce.
    expect(useAppStore.getState().toast).toBeNull()
  })

  it('puts the new task on the chosen day and says where it went', async () => {
    const date = todayKey()
    const later = addDays(date, 2)
    useAppStore.setState({ modal: { kind: 'task', date, taskId: null } })
    render(<TaskForm />)

    fireEvent.change(screen.getByTestId('task-name-input'), {
      target: { value: 'Later' },
    })
    fireEvent.change(dateField(), { target: { value: later } })
    await save()

    const tasks = useAppStore.getState().data?.tasks
    expect(tasks?.[later]?.map((task) => task.name)).toEqual(['Later'])
    expect(tasks?.[date] ?? []).toEqual([])
    expect(useAppStore.getState().toast?.message).toMatch(
      /^已添加到 \d+月\d+日$/
    )
    // The user is not carried away from the day they are on.
    expect(useAppStore.getState().selectedDate).toBe(date)
  })

  it('appends after the tasks the chosen day already has', async () => {
    const date = todayKey()
    const later = addDays(date, 1)
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            tasks: {
              ...state.data.tasks,
              [later]: [makeTask('existing')],
            },
          }
        : null,
      modal: { kind: 'task', date, taskId: null },
    }))
    render(<TaskForm />)

    fireEvent.change(screen.getByTestId('task-name-input'), {
      target: { value: 'Second' },
    })
    fireEvent.change(dateField(), { target: { value: later } })
    await save()

    expect(
      useAppStore.getState().data?.tasks[later]?.map((task) => task.name)
    ).toEqual(['Task existing', 'Second'])
  })

  it('keeps a cleared date on the selected day', async () => {
    const date = todayKey()
    useAppStore.setState({ modal: { kind: 'task', date, taskId: null } })
    render(<TaskForm />)

    fireEvent.change(screen.getByTestId('task-name-input'), {
      target: { value: 'Here' },
    })
    fireEvent.change(dateField(), { target: { value: '' } })
    await save()

    expect(
      useAppStore.getState().data?.tasks[date]?.map((task) => task.name)
    ).toEqual(['Here'])
  })

  it('refuses a half-typed date for a new task, as it does for an edited one', async () => {
    const date = todayKey()
    useAppStore.setState({ modal: { kind: 'task', date, taskId: null } })
    render(<TaskForm />)

    fireEvent.change(screen.getByTestId('task-name-input'), {
      target: { value: 'Orphan' },
    })
    fireEvent.change(dateField(), { target: { value: '0026-10-05' } })

    expect(screen.getByRole('alert')).toHaveTextContent('日期无效')
    expect(screen.getByTestId('task-save')).toBeDisabled()
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })
})
