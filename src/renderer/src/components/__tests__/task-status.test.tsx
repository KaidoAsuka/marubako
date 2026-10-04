import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { TaskItem } from '../../../../shared/types'
import { useAppStore } from '../../store/use-app-store'
import { todayKey } from '../../utils/date'
import FeedbackStrip from '../layout/FeedbackStrip'
import SubtaskForm from '../modals/SubtaskForm'
import TaskSection from '../sections/TaskSection'

const DATE = todayKey()

function seed(tasks: TaskItem[]): void {
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  data.tasks[DATE] = tasks
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    toast: null,
    currentTab: 'tasks',
    selectedDate: DATE,
    modal: null,
  })
}

const statusOf = (id: string) =>
  useAppStore.getState().data?.tasks[DATE]?.find((entry) => entry.id === id)
    ?.status
const subtaskStatus = (taskId: string, id: string) =>
  useAppStore
    .getState()
    .data?.tasks[DATE]?.find((entry) => entry.id === taskId)
    ?.subtasks.find((entry) => entry.id === id)?.status

async function click(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId))
  })
}

describe('the status of a task and its subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia; the feedback strip and the cards ask for it.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    seed([
      {
        id: 'plain',
        name: 'Plain task',
        icon: 'P',
        status: 'todo',
        open: true,
        subtasks: [],
      },
      {
        id: 'steps',
        name: 'Steps task',
        icon: 'S',
        status: 'doing',
        open: true,
        subtasks: [
          { id: 'one', name: 'One', status: 'done' },
          { id: 'two', name: 'Two', status: 'todo' },
        ],
      },
    ])
  })

  afterEach(() => {
    cleanup()
  })

  describe('the button on the task card', () => {
    it('is there on every card, before the title, as a real button with a name that says what a click does', () => {
      render(<TaskSection />)

      const button = screen.getByTestId('task-status-plain')
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('aria-label', 'Plain task: Todo → Done')
      expect(button).toHaveAttribute('title', 'Todo → Done')
      // A sibling of the expand button, not inside it: one click must not also fold the card.
      const header = button.closest('.task-card-header')!
      expect(button.parentElement).toBe(header)
      expect(screen.getByTestId('task-toggle-plain').parentElement).toBe(header)
      expect(
        button.compareDocumentPosition(
          screen.getByTestId('task-toggle-plain')
        ) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('completes a task with one click, and the summary follows', async () => {
      render(<TaskSection />)
      expect(screen.getByText('2 tasks · 0 done')).toBeInTheDocument()

      await click('task-status-plain')

      expect(statusOf('plain')).toBe('done')
      expect(screen.getByText('2 tasks · 1 done')).toBeInTheDocument()
      expect(screen.getByTestId('task-card-plain')).toHaveClass('status-done')
      expect(screen.getByTestId('task-status-plain')).toHaveAttribute(
        'aria-label',
        'Plain task: Done → Todo'
      )
    })

    it('takes a finished task back to todo with the next click', async () => {
      render(<TaskSection />)

      await click('task-status-plain')
      await click('task-status-plain')

      expect(statusOf('plain')).toBe('todo')
    })

    it('does not fold or unfold the card', async () => {
      render(<TaskSection />)

      await click('task-status-steps')

      expect(screen.getByTestId('task-toggle-steps')).toHaveAttribute(
        'aria-expanded',
        'true'
      )
    })

    it('completes the task only: its subtasks keep their own state', async () => {
      render(<TaskSection />)

      await click('task-status-steps')

      expect(statusOf('steps')).toBe('done')
      expect(subtaskStatus('steps', 'one')).toBe('done')
      expect(subtaskStatus('steps', 'two')).toBe('todo')
    })

    it('shows a finished task as finished: dimmed title, line through for done', async () => {
      render(<TaskSection />)

      await click('task-status-plain')

      expect(screen.getByTestId('task-status-plain')).toHaveClass('status-done')
      expect(screen.getByTestId('task-card-plain')).toHaveClass('status-done')
    })
  })

  describe('the box in front of a subtask', () => {
    it('ticks with one click, and clears with the next', async () => {
      render(<TaskSection />)

      await click('subtask-status-two')
      expect(subtaskStatus('steps', 'two')).toBe('done')
      await click('subtask-status-two')
      expect(subtaskStatus('steps', 'two')).toBe('todo')
    })

    it.each(['doing', 'skip'] as const)(
      'ticks a %s subtask in one click too, and never walks through the others',
      async (status) => {
        seed([
          {
            id: 'steps',
            name: 'Steps task',
            icon: 'S',
            status: 'todo',
            open: true,
            subtasks: [
              { id: 'one', name: 'One', status },
              { id: 'two', name: 'Two', status: 'todo' },
            ],
          },
        ])
        render(<TaskSection />)

        await click('subtask-status-one')

        expect(subtaskStatus('steps', 'one')).toBe('done')
      }
    )

    it('names the next state in its label', () => {
      render(<TaskSection />)

      expect(screen.getByTestId('subtask-status-one')).toHaveAttribute(
        'aria-label',
        'One: Done → Todo'
      )
      expect(screen.getByTestId('subtask-status-two')).toHaveAttribute(
        'aria-label',
        'Two: Todo → Done'
      )
      expect(screen.getByTestId('subtask-status-two')).toHaveAttribute(
        'title',
        'Todo → Done'
      )
    })

    it('counts toward the progress shown on the card', async () => {
      render(<TaskSection />)
      const card = within(screen.getByTestId('task-card-steps'))
      expect(card.getByText('1/2')).toBeInTheDocument()

      await click('subtask-status-two')

      expect(card.getByText('2/2')).toBeInTheDocument()
    })
  })

  describe('finishing the last subtask', () => {
    it('does not change the task by itself, and offers to in the feedback strip', async () => {
      render(
        <>
          <TaskSection />
          <FeedbackStrip />
        </>
      )

      await click('subtask-status-two')

      expect(statusOf('steps')).toBe('doing')
      const strip = screen.getByTestId('feedback-strip')
      expect(strip).toHaveTextContent('All subtasks are done')
      expect(within(strip).getByTestId('feedback-action')).toHaveTextContent(
        'Mark task done'
      )
    })

    it('completes the task when the offer is taken', async () => {
      render(
        <>
          <TaskSection />
          <FeedbackStrip />
        </>
      )
      await click('subtask-status-two')

      await click('feedback-action')

      await waitFor(() => expect(statusOf('steps')).toBe('done'))
      expect(screen.getByText('2 tasks · 1 done')).toBeInTheDocument()
    })

    it('leaves the task as it is when the offer is ignored', async () => {
      render(
        <>
          <TaskSection />
          <FeedbackStrip />
        </>
      )
      await click('subtask-status-two')
      act(() => useAppStore.getState().clearToast())

      expect(statusOf('steps')).toBe('doing')
    })
  })

  describe('opening a subtask again under a finished task', () => {
    it('offers to reopen the task, and the click makes it "doing"', async () => {
      seed([
        {
          id: 'steps',
          name: 'Steps task',
          icon: 'S',
          status: 'done',
          open: true,
          subtasks: [
            { id: 'one', name: 'One', status: 'done' },
            { id: 'two', name: 'Two', status: 'done' },
          ],
        },
      ])
      render(
        <>
          <TaskSection />
          <FeedbackStrip />
        </>
      )

      await click('subtask-status-two')

      expect(statusOf('steps')).toBe('done')
      expect(screen.getByTestId('feedback-strip')).toHaveTextContent(
        'The task is done, but a subtask is not'
      )
      await click('feedback-action')
      await waitFor(() => expect(statusOf('steps')).toBe('doing'))
    })
  })

  describe('from the subtask dialog', () => {
    it('offers to complete the task when a status set there finishes the last subtask', async () => {
      useAppStore.setState({
        modal: {
          kind: 'subtask',
          date: DATE,
          taskId: 'steps',
          subtaskId: 'two',
        },
      })
      render(
        <>
          <SubtaskForm />
          <FeedbackStrip />
        </>
      )

      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'skip' },
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('subtask-save'))
      })

      expect(subtaskStatus('steps', 'two')).toBe('skip')
      expect(statusOf('steps')).toBe('doing')
      expect(screen.getByTestId('feedback-strip')).toHaveTextContent(
        'All subtasks are done'
      )
    })

    it('offers to reopen a done task when a new subtask is added to it', async () => {
      seed([
        {
          id: 'steps',
          name: 'Steps task',
          icon: 'S',
          status: 'done',
          open: true,
          subtasks: [{ id: 'one', name: 'One', status: 'done' }],
        },
      ])
      useAppStore.setState({
        modal: {
          kind: 'subtask',
          date: DATE,
          taskId: 'steps',
          subtaskId: null,
        },
      })
      render(
        <>
          <SubtaskForm />
          <FeedbackStrip />
        </>
      )

      fireEvent.change(screen.getByTestId('subtask-name-input'), {
        target: { value: 'One more' },
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('subtask-save'))
      })

      expect(statusOf('steps')).toBe('done')
      expect(screen.getByTestId('feedback-strip')).toHaveTextContent(
        'The task is done, but a subtask is not'
      )
    })

    it('says nothing for a rename', async () => {
      useAppStore.setState({
        modal: {
          kind: 'subtask',
          date: DATE,
          taskId: 'steps',
          subtaskId: 'two',
        },
      })
      render(<SubtaskForm />)

      fireEvent.change(screen.getByTestId('subtask-name-input'), {
        target: { value: 'Two, renamed' },
      })
      await act(async () => {
        fireEvent.click(screen.getByTestId('subtask-save'))
      })

      expect(useAppStore.getState().toast).toBeNull()
    })
  })
})
