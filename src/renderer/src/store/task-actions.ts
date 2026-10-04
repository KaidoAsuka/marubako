import type { AppData, TaskItem, TaskStatus } from '../../../shared/types'
import { isFinished, taskStatusOffer } from './data-helpers'
import type { Translate } from './delete-actions'
import { useAppStore } from './use-app-store'

function findTask(
  data: AppData | null,
  date: string,
  taskId: string
): TaskItem | undefined {
  return data?.tasks[date]?.find((entry) => entry.id === taskId)
}

/** Set the status of a task itself. Its subtasks are not touched. */
export async function setTaskStatus(
  date: string,
  taskId: string,
  status: TaskStatus
): Promise<void> {
  await useAppStore.getState().updateData((draft) => {
    const task = findTask(draft, date, taskId)
    if (task) task.status = status
  })
}

/**
 * The one-click button on a task card: a finished task (done or skipped) goes back to "todo",
 * anything else becomes "done". The subtasks keep whatever state they are in.
 */
export async function toggleTaskDone(
  date: string,
  taskId: string
): Promise<void> {
  const task = findTask(useAppStore.getState().data, date, taskId)
  if (!task) return

  await setTaskStatus(date, taskId, isFinished(task.status) ? 'todo' : 'done')
}

/**
 * Changes the subtasks of one task and saves. When the change makes it true (see
 * `taskStatusOffer`), the feedback strip then offers to mark the task done, or to reopen it. The
 * status of the task is never changed without that click.
 */
export async function changeSubtasks(
  date: string,
  taskId: string,
  mutate: (task: TaskItem) => void,
  t: Translate
): Promise<void> {
  const current = findTask(useAppStore.getState().data, date, taskId)
  if (!current) return

  const before = structuredClone(current)
  await useAppStore.getState().updateData((draft) => {
    const task = findTask(draft, date, taskId)
    if (task) mutate(task)
  })

  const store = useAppStore.getState()
  // A failed write has put everything back and said so; there is nothing to suggest.
  if (store.error) return
  const after = findTask(store.data, date, taskId)
  const offer = after ? taskStatusOffer(before, after) : null
  if (!offer) return

  const complete = offer === 'complete'
  store.showToast(
    t(complete ? 'task_all_done' : 'task_subtask_reopened'),
    'info',
    {
      action: {
        label: t(complete ? 'task_mark_done' : 'task_reopen'),
        run: () =>
          void setTaskStatus(date, taskId, complete ? 'done' : 'doing'),
      },
    }
  )
}
