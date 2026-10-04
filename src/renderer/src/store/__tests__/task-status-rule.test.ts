import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { Subtask, TaskItem, TaskStatus } from '../../../../shared/types'
import { isFinished, taskStatusOffer } from '../data-helpers'
import { changeSubtasks, setTaskStatus, toggleTaskDone } from '../task-actions'
import { useAppStore } from '../use-app-store'

const DATE = '2026-03-10'

function task(
  status: TaskStatus,
  subtasks: TaskStatus[] = [],
  id = 'task-a'
): TaskItem {
  return {
    id,
    name: `Task ${id}`,
    icon: 'T',
    status,
    open: true,
    subtasks: subtasks.map(
      (value, index): Subtask => ({
        id: `s${index}`,
        name: `Sub ${index}`,
        status: value,
      })
    ),
  }
}

const t = (key: string) => key

describe('isFinished', () => {
  it.each([
    ['done', true],
    ['skip', true],
    ['todo', false],
    ['doing', false],
  ] as const)('is %s -> %s', (status, expected) => {
    expect(isFinished(status)).toBe(expected)
  })
})

describe('taskStatusOffer: the rule that links a task to its subtasks', () => {
  it('offers "complete" when the last open subtask is finished', () => {
    expect(
      taskStatusOffer(
        task('doing', ['done', 'todo']),
        task('doing', ['done', 'done'])
      )
    ).toBe('complete')
    expect(
      taskStatusOffer(task('todo', ['doing']), task('todo', ['skip']))
    ).toBe('complete')
  })

  it('offers it after the last open subtask was deleted, too', () => {
    expect(
      taskStatusOffer(task('todo', ['done', 'todo']), task('todo', ['done']))
    ).toBe('complete')
  })

  it('does not offer it when the task is finished already', () => {
    expect(
      taskStatusOffer(task('done', ['todo']), task('done', ['done']))
    ).toBeNull()
    expect(
      taskStatusOffer(task('skip', ['todo']), task('skip', ['done']))
    ).toBeNull()
  })

  it('does not offer it again for a change that finished nothing new', () => {
    // Everything was finished before, and the user left the task open: renaming does not nag.
    expect(
      taskStatusOffer(
        task('doing', ['done', 'done']),
        task('doing', ['done', 'done'])
      )
    ).toBeNull()
    expect(
      taskStatusOffer(
        task('doing', ['todo', 'todo']),
        task('doing', ['doing', 'todo'])
      )
    ).toBeNull()
  })

  it('offers "reopen" when a subtask is opened again under a task marked done', () => {
    expect(
      taskStatusOffer(
        task('done', ['done', 'done']),
        task('done', ['done', 'todo'])
      )
    ).toBe('reopen')
    // A new, unfinished subtask counts as one opened again.
    expect(
      taskStatusOffer(task('done', ['done']), task('done', ['done', 'todo']))
    ).toBe('reopen')
  })

  it('does not offer "reopen" for a task that is not done, or was not complete before', () => {
    expect(
      taskStatusOffer(
        task('doing', ['done', 'done']),
        task('doing', ['done', 'todo'])
      )
    ).toBeNull()
    expect(
      taskStatusOffer(task('skip', ['done']), task('skip', ['done', 'todo']))
    ).toBeNull()
    // Marked done on purpose with a subtask left open: ticking another one is no reason to ask.
    expect(
      taskStatusOffer(
        task('done', ['done', 'todo', 'todo']),
        task('done', ['done', 'done', 'todo'])
      )
    ).toBeNull()
  })

  it('offers nothing for a task without subtasks', () => {
    expect(taskStatusOffer(task('todo'), task('done'))).toBeNull()
    expect(taskStatusOffer(task('done', ['done']), task('done'))).toBeNull()
  })
})

describe('task actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.tasks[DATE] = [
      task('doing', ['done', 'todo'], 'a'),
      task('todo', [], 'b'),
      task('done', ['done', 'done'], 'c'),
      task('skip', [], 'd'),
    ]
    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      error: null,
      toast: null,
      selectedDate: DATE,
    })
  })

  const statusOf = (id: string) =>
    useAppStore.getState().data?.tasks[DATE]?.find((entry) => entry.id === id)
      ?.status

  describe('toggleTaskDone', () => {
    it('completes a task that is not finished', async () => {
      await toggleTaskDone(DATE, 'b')
      expect(statusOf('b')).toBe('done')
      await toggleTaskDone(DATE, 'a')
      expect(statusOf('a')).toBe('done')
    })

    it('takes a done or skipped task back to todo', async () => {
      await toggleTaskDone(DATE, 'c')
      expect(statusOf('c')).toBe('todo')
      await toggleTaskDone(DATE, 'd')
      expect(statusOf('d')).toBe('todo')
    })

    it('leaves the subtasks exactly as they are', async () => {
      const subtasksBefore = structuredClone(
        useAppStore.getState().data?.tasks[DATE]?.[0]?.subtasks
      )

      await toggleTaskDone(DATE, 'a')

      expect(useAppStore.getState().data?.tasks[DATE]?.[0]?.subtasks).toEqual(
        subtasksBefore
      )
    })

    it('does nothing for a task that is gone', async () => {
      await toggleTaskDone(DATE, 'missing')
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })
  })

  describe('changeSubtasks', () => {
    const finishSecond = (task: TaskItem) => {
      task.subtasks[1]!.status = 'done'
    }

    it('saves the change and does not touch the status of the task', async () => {
      await changeSubtasks(DATE, 'a', finishSecond, t)

      expect(statusOf('a')).toBe('doing')
      expect(
        useAppStore.getState().data?.tasks[DATE]?.[0]?.subtasks[1]?.status
      ).toBe('done')
    })

    it('offers to complete the task, and only the click does it', async () => {
      await changeSubtasks(DATE, 'a', finishSecond, t)

      const toast = useAppStore.getState().toast
      expect(toast).toMatchObject({
        message: 'task_all_done',
        tone: 'info',
        action: { label: 'task_mark_done' },
      })
      expect(statusOf('a')).toBe('doing')

      toast?.action?.run()
      await vi.waitFor(() => expect(statusOf('a')).toBe('done'))
    })

    it('offers to reopen a done task whose subtask is opened again, and the click sets it to doing', async () => {
      await changeSubtasks(
        DATE,
        'c',
        (entry) => {
          entry.subtasks[0]!.status = 'todo'
        },
        t
      )

      expect(statusOf('c')).toBe('done')
      const toast = useAppStore.getState().toast
      expect(toast).toMatchObject({
        message: 'task_subtask_reopened',
        action: { label: 'task_reopen' },
      })

      toast?.action?.run()
      await vi.waitFor(() => expect(statusOf('c')).toBe('doing'))
    })

    it('says nothing when the change makes no suggestion true', async () => {
      await changeSubtasks(
        DATE,
        'a',
        (entry) => {
          entry.subtasks[0]!.name = 'Renamed'
        },
        t
      )

      expect(useAppStore.getState().toast).toBeNull()
    })

    it('says nothing, and changes nothing, when the write fails', async () => {
      vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
        ok: false,
        error: 'disk full',
      })

      await changeSubtasks(DATE, 'a', finishSecond, t)

      expect(statusOf('a')).toBe('doing')
      expect(
        useAppStore.getState().data?.tasks[DATE]?.[0]?.subtasks[1]?.status
      ).toBe('todo')
      // Only the error is in the strip; no offer on top of it.
      expect(useAppStore.getState().toast?.message).toBe('disk full')
    })

    it('does nothing for a task that is gone', async () => {
      await changeSubtasks(DATE, 'missing', finishSecond, t)
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })
  })

  it('setTaskStatus sets exactly one task and nothing else', async () => {
    await setTaskStatus(DATE, 'b', 'doing')

    expect(statusOf('b')).toBe('doing')
    expect(statusOf('a')).toBe('doing')
    expect(statusOf('c')).toBe('done')
  })
})
