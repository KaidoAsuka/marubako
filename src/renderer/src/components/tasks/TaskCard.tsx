import {
  IconAdd,
  IconDelete,
  IconDragHandle,
  IconEdit,
  IconExpandGroup,
} from '../common/icons'
import EntryIcon from '../common/EntryIcon'

import type { TaskItem } from '../../../../shared/types'
import DndProvider from '../../dnd/DndProvider'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useSortableTask } from '../../dnd/use-sortable-task'
import { useI18n } from '../../hooks/use-i18n'
import { useOpenedByUser } from '../../hooks/use-opened-by-user'
import { getTaskProgress, isFinished } from '../../store/data-helpers'
import { toggleTaskDone } from '../../store/task-actions'
import { useAppStore } from '../../store/use-app-store'
import SubtaskRow from './SubtaskRow'
import { iconByStatus } from './task-status'

type Props = {
  date: string
  task: TaskItem
  sortableId?: string
}

type CardProps = Omit<Props, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function TaskCard(props: Props): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <TaskCardView {...rest} />
  }

  return <SortableTaskCard {...rest} sortableId={sortableId} />
}

function SortableTaskCard({
  sortableId,
  ...props
}: Omit<Props, 'sortableId'> & { sortableId: string }): JSX.Element {
  const sortable = useSortableTask(sortableId)

  return <TaskCardView {...props} sortable={sortable} />
}

function TaskCardView({ date, task, sortable }: CardProps): JSX.Element {
  const { t } = useI18n()
  const setModal = useAppStore((state) => state.setModal)
  const updateData = useAppStore((state) => state.updateData)
  const reorderSubtasks = useAppStore((state) => state.reorderSubtasks)
  const progress = getTaskProgress(task)
  // One click completes the task, and one more takes it back to "todo". It changes the task only:
  // its subtasks keep their own state.
  const nextStatus = isFinished(task.status) ? 'todo' : 'done'

  const unfold = useOpenedByUser(task.open)

  const toggleTask = () => {
    void updateData((draft) => {
      const entry = (draft.tasks[date] ?? []).find(
        (item) => item.id === task.id
      )
      if (entry) {
        entry.open = !entry.open
      }
    })
  }

  return (
    <section
      ref={sortable?.setNodeRef}
      className={`task-card status-${task.status} ${task.open ? 'open' : ''} ${sortable?.isDragging ? 'dnd-dragging' : ''}`}
      style={sortable?.style}
      data-testid={`task-card-${task.id}`}
    >
      <div className="task-card-header">
        {sortable && (
          <button
            className="icon-button drag-handle"
            type="button"
            aria-label={t('reorder_task')}
            title={t('reorder_task')}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <IconDragHandle size={12} />
          </button>
        )}
        <button
          className={`subtask-status task-status status-${task.status}`}
          type="button"
          aria-label={`${task.name}: ${t(`s_${task.status}`)} → ${t(`s_${nextStatus}`)}`}
          title={`${t(`s_${task.status}`)} → ${t(`s_${nextStatus}`)}`}
          data-testid={`task-status-${task.id}`}
          onClick={() => void toggleTaskDone(date, task.id)}
        >
          {iconByStatus[task.status]}
        </button>
        <button
          className="task-card-toggle"
          type="button"
          data-testid={`task-toggle-${task.id}`}
          aria-expanded={task.open}
          aria-controls={`task-body-${task.id}`}
          onClick={toggleTask}
        >
          <span className="task-card-icon">
            <EntryIcon icon={task.icon} />
          </span>
          <span className="task-card-copy">
            <span className="task-card-title" title={task.name}>
              {task.name}
            </span>
            <span className="task-card-meta">
              <span className="task-card-status">{t(`s_${task.status}`)}</span>
              {task.subtasks.length > 0 && (
                <span title={t('completed')}>
                  {progress.done}/{progress.total}
                </span>
              )}
            </span>
          </span>
          <IconExpandGroup size={14} className="group-card-chevron" />
        </button>
        <span className="task-card-actions item-actions">
          <button
            className="icon-button"
            type="button"
            title={t('m_edit_task')}
            aria-label={t('m_edit_task')}
            data-testid={`edit-task-${task.id}`}
            onClick={() => setModal({ kind: 'task', date, taskId: task.id })}
          >
            <IconEdit size={12} />
          </button>
          <button
            className="icon-button danger"
            type="button"
            title={t('btn_delete')}
            aria-label={t('btn_delete')}
            data-testid={`delete-task-${task.id}`}
            onClick={() =>
              setModal({
                kind: 'confirm',
                title: t('confirm_del_task'),
                onConfirm: () => {
                  void updateData((draft) => {
                    draft.tasks[date] = (draft.tasks[date] ?? []).filter(
                      (entry) => entry.id !== task.id
                    )
                  })
                  setModal(null)
                },
              })
            }
          >
            <IconDelete size={12} />
          </button>
        </span>
      </div>
      {task.open && (
        <div
          className="task-card-body"
          id={`task-body-${task.id}`}
          data-unfold={unfold ? '' : undefined}
        >
          <DndProvider
            ids={task.subtasks.map((subtask) => subtask.id)}
            onDragEnd={(activeId, overId) => {
              if (!overId || activeId === overId) {
                return
              }

              void reorderSubtasks(date, task.id, activeId, overId)
            }}
          >
            <div className="subtask-list">
              {task.subtasks.map((subtask) => (
                <SubtaskRow
                  key={subtask.id}
                  date={date}
                  taskId={task.id}
                  subtask={subtask}
                  sortableId={subtask.id}
                />
              ))}
            </div>
          </DndProvider>
          <button
            className="group-add-button"
            type="button"
            data-testid={`add-subtask-${task.id}`}
            onClick={() =>
              setModal({
                kind: 'subtask',
                date,
                taskId: task.id,
                subtaskId: null,
              })
            }
          >
            <IconAdd size={14} />
            <span>{t('btn_add_subtask')}</span>
          </button>
        </div>
      )}
    </section>
  )
}
