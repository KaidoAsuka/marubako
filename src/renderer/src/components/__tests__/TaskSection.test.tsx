import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import TaskSection from '../sections/TaskSection'
import ConfirmDialog from '../modals/ConfirmDialog'
import { useAppStore } from '../../store/use-app-store'
import { addDays, todayKey } from '../../utils/date'

describe('TaskSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const date = todayKey()
    const data = createDefaultAppData()
    data.tasks[date] = [
      {
        id: 'task-test',
        name: 'Ship release',
        icon: 'R',
        status: 'doing',
        open: true,
        subtasks: [
          {
            id: 'subtask-test',
            name: 'Run checks',
            status: 'todo',
          },
        ],
      },
    ]

    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'tasks',
      selectedDate: date,
      modal: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders tasks for the selected date', () => {
    render(<TaskSection />)

    expect(screen.getByTestId('task-list')).toBeInTheDocument()
    expect(screen.getByText('Ship release')).toBeInTheDocument()
    expect(screen.getByText('Run checks')).toBeInTheDocument()
  })

  it('carries no title row or add button of its own, only a heading for screen readers', () => {
    const { container } = render(<TaskSection />)

    expect(container.querySelector('.section-toolbar')).toBeNull()
    // "Add task" is in the bar above the content (SectionActions).
    expect(screen.queryByTestId('add-task')).toBeNull()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('任务')
    expect(heading).toHaveClass('sr-only')
  })

  it.each(['forward', 'backward'] as const)(
    'carries the side it comes in from (%s) for the stylesheet, and nothing when it is simply there',
    (enter) => {
      const slid = render(<TaskSection enter={enter} />)
      expect(screen.getByTestId('section-tasks')).toHaveAttribute(
        'data-enter',
        enter
      )
      expect(screen.getByTestId('section-tasks')).toHaveClass('section-content')
      slid.unmount()

      const there = render(<TaskSection enter={null} />)
      expect(screen.getByTestId('section-tasks')).not.toHaveAttribute(
        'data-enter'
      )
      there.unmount()

      render(<TaskSection />)
      expect(screen.getByTestId('section-tasks')).not.toHaveAttribute(
        'data-enter'
      )
    }
  )

  it('does not unfold a task that is open when the page appears, and unfolds one the user opens', async () => {
    render(<TaskSection />)
    const body = () =>
      screen.getByTestId('task-card-task-test').querySelector('.task-card-body')

    expect(body()).not.toBeNull()
    expect(body()).not.toHaveAttribute('data-unfold')

    fireEvent.click(screen.getByTestId('task-toggle-task-test'))
    await waitFor(() => expect(body()).toBeNull())
    fireEvent.click(screen.getByTestId('task-toggle-task-test'))

    await waitFor(() => expect(body()).not.toBeNull())
    expect(body()).toHaveAttribute('data-unfold')
  })

  it('renders the empty state when there are no tasks on the selected date', () => {
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            tasks: {},
          }
        : null,
    }))

    render(<TaskSection />)

    expect(screen.getByText('今天还没有任务')).toBeInTheDocument()
    expect(screen.getByTestId('empty-add-task')).toBeInTheDocument()
  })

  it('opens the task modal from the empty-state action', () => {
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            tasks: {},
          }
        : null,
    }))

    render(<TaskSection />)

    fireEvent.click(screen.getByTestId('empty-add-task'))

    expect(useAppStore.getState().modal).toEqual({
      kind: 'task',
      date: todayKey(),
      taskId: null,
    })
  })

  it('cancels subtask deletion without changing or saving data', () => {
    render(
      <>
        <TaskSection />
        <ConfirmDialog />
      </>
    )

    fireEvent.click(screen.getByTestId('delete-subtask-subtask-test'))

    expect(screen.getByText('确认删除此子任务？')).toBeInTheDocument()
    expect(screen.getByText('Run checks')).toBeInTheDocument()
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('confirm-cancel'))

    expect(useAppStore.getState().modal).toBeNull()
    expect(screen.getByText('Run checks')).toBeInTheDocument()
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('deletes and persists only the chosen subtask and updates progress', async () => {
    const date = todayKey()
    const nextDate = addDays(date, 1)
    const data = structuredClone(useAppStore.getState().data!)
    const tasks = data.tasks[date]!
    const task = tasks[0]!
    const otherTask = {
      ...structuredClone(task),
      id: 'other-task',
      name: 'Other task',
    }
    data.tasks[nextDate] = [structuredClone(task)]
    task.subtasks.push({
      id: 'keep-subtask',
      name: 'Keep this check',
      status: 'done',
    })
    tasks.push(otherTask)
    useAppStore.setState({ data })

    render(
      <>
        <TaskSection />
        <ConfirmDialog />
      </>
    )
    const card = within(screen.getByTestId('task-card-task-test'))
    expect(card.getByText('1/2')).toBeInTheDocument()

    fireEvent.click(card.getByTestId('delete-subtask-subtask-test'))
    fireEvent.click(screen.getByTestId('confirm-submit'))

    await waitFor(() => {
      expect(useAppStore.getState().saving).toBe(false)
      expect(card.queryByText('Run checks')).not.toBeInTheDocument()
    })
    const saved = useAppStore.getState().data!
    expect(saved.tasks[date]![0]!.subtasks).toEqual([task.subtasks[1]])
    expect(saved.tasks[date]![1]).toEqual(otherTask)
    expect(saved.tasks[nextDate]).toEqual(data.tasks[nextDate])
    expect(window.quickLaunch.saveData).toHaveBeenCalledWith(saved)
    expect(card.getByText('1/1')).toBeInTheDocument()
    expect(useAppStore.getState().modal).toBeNull()
  })

  it('keeps task expansion unchanged when using an action with the keyboard', () => {
    render(<TaskSection />)
    const editButton = screen.getByTestId('edit-task-task-test')

    fireEvent.keyDown(editButton, { key: 'Enter' })
    fireEvent.click(editButton)

    expect(useAppStore.getState().modal).toEqual({
      kind: 'task',
      date: todayKey(),
      taskId: 'task-test',
    })
    expect(screen.getByTestId('task-toggle-task-test')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('Run checks')).toBeInTheDocument()
  })
})
