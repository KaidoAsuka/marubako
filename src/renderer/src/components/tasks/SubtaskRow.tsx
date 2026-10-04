import { IconDelete, IconDragHandle, IconEdit } from '../common/icons'

import type { Subtask } from '../../../../shared/types'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useSortableTask } from '../../dnd/use-sortable-task'
import { useI18n } from '../../hooks/use-i18n'
import { changeSubtasks } from '../../store/task-actions'
import { useAppStore } from '../../store/use-app-store'
import { iconByStatus } from './task-status'

type Props = {
  date: string
  taskId: string
  subtask: Subtask
  sortableId?: string
}

type RowProps = Omit<Props, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function SubtaskRow(props: Props): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <SubtaskRowView {...rest} />
  }

  return <SortableSubtaskRow {...rest} sortableId={sortableId} />
}

function SortableSubtaskRow({
  sortableId,
  ...props
}: Props & { sortableId: string }): JSX.Element {
  const sortable = useSortableTask(sortableId)

  return <SubtaskRowView {...props} sortable={sortable} />
}

function SubtaskRowView({
  date,
  taskId,
  subtask,
  sortable,
}: RowProps): JSX.Element {
  const { t } = useI18n()
  const setModal = useAppStore((state) => state.setModal)
  // One click ticks the box and one more clears it. "Doing" and "skip" are set in the edit dialog:
  // the common case must not take three clicks through them.
  const nextStatus = subtask.status === 'done' ? 'todo' : 'done'
  const editSubtask = () =>
    setModal({ kind: 'subtask', date, taskId, subtaskId: subtask.id })

  return (
    <div
      ref={sortable?.setNodeRef}
      className={`subtask-row status-${subtask.status} ${sortable?.isDragging ? 'dnd-dragging' : ''}`}
      style={sortable?.style}
      data-testid={`subtask-row-${subtask.id}`}
    >
      {sortable && (
        <button
          className="icon-button drag-handle"
          type="button"
          aria-label={t('reorder_subtask')}
          title={t('reorder_subtask')}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <IconDragHandle size={12} />
        </button>
      )}
      <button
        className={`subtask-status status-${subtask.status}`}
        type="button"
        aria-label={`${subtask.name}: ${t(`s_${subtask.status}`)} → ${t(`s_${nextStatus}`)}`}
        title={`${t(`s_${subtask.status}`)} → ${t(`s_${nextStatus}`)}`}
        data-testid={`subtask-status-${subtask.id}`}
        onClick={() => {
          void changeSubtasks(
            date,
            taskId,
            (task) => {
              const target = task.subtasks.find(
                (entry) => entry.id === subtask.id
              )
              if (target) {
                target.status = target.status === 'done' ? 'todo' : 'done'
              }
            },
            t
          )
        }}
      >
        {iconByStatus[subtask.status]}
      </button>
      <button
        className="subtask-copy"
        type="button"
        title={subtask.name}
        onClick={editSubtask}
      >
        {subtask.name}
      </button>
      <div className="item-actions subtask-actions">
        <button
          className="icon-button"
          type="button"
          title={t('m_edit_subtask')}
          aria-label={t('m_edit_subtask')}
          data-testid={`edit-subtask-${subtask.id}`}
          onClick={editSubtask}
        >
          <IconEdit size={14} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          title={t('btn_delete')}
          aria-label={t('btn_delete')}
          data-testid={`delete-subtask-${subtask.id}`}
          onClick={() =>
            setModal({
              kind: 'confirm',
              title: t('confirm_del_subtask'),
              onConfirm: () => {
                void changeSubtasks(
                  date,
                  taskId,
                  (task) => {
                    task.subtasks = task.subtasks.filter(
                      (entry) => entry.id !== subtask.id
                    )
                  },
                  t
                )
                setModal(null)
              },
            })
          }
        >
          <IconDelete size={14} />
        </button>
      </div>
    </div>
  )
}
