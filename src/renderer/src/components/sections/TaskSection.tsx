import { IconTabTask } from '../common/icons'
import { rectSortingStrategy } from '@dnd-kit/sortable'

import DndProvider from '../../dnd/DndProvider'
import { useI18n } from '../../hooks/use-i18n'
import { tasksOnDate } from '../../store/data-helpers'
import { useAppStore } from '../../store/use-app-store'
import { todayKey } from '../../utils/date'
import EmptyState from '../common/EmptyState'
import DateBar from '../tasks/DateBar'
import TaskCard from '../tasks/TaskCard'

export default function TaskSection(): JSX.Element {
  const { t } = useI18n()
  const data = useAppStore((state) => state.data)
  const selectedDate = useAppStore((state) => state.selectedDate)
  const setModal = useAppStore((state) => state.setModal)
  const reorderTasks = useAppStore((state) => state.reorderTasks)

  if (!data) {
    return <section className="section-content" />
  }

  const tasks = tasksOnDate(data, selectedDate)
  const done = tasks.filter(
    (task) => task.status === 'done' || task.status === 'skip'
  ).length

  return (
    <section
      className="section-content task-section"
      data-testid="section-tasks"
    >
      {/* The tab says where the user is; "add task" lives in the bar above. */}
      <h1 className="sr-only">{t('tab_tasks')}</h1>
      <DateBar />
      <div className="task-summary">
        {tasks.length} {t('tasks_count')} · {done} {t('completed')}
      </div>
      {tasks.length ? (
        <DndProvider
          strategy={rectSortingStrategy}
          ids={tasks.map((task) => task.id)}
          onDragEnd={(activeId, overId) => {
            if (!overId || activeId === overId) {
              return
            }

            void reorderTasks(selectedDate, activeId, overId)
          }}
        >
          <div className="task-list" data-testid="task-list">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                date={selectedDate}
                task={task}
                sortableId={task.id}
              />
            ))}
          </div>
        </DndProvider>
      ) : (
        <EmptyState
          icon={<IconTabTask size={28} />}
          title={
            selectedDate === todayKey() ? t('task_no_today') : t('task_no')
          }
          description={t('empty_tasks')}
          actionLabel={t('btn_add_task')}
          actionTestId="empty-add-task"
          onAction={() =>
            setModal({ kind: 'task', date: selectedDate, taskId: null })
          }
        />
      )}
    </section>
  )
}
