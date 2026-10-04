import { IconAdd, IconNewGroup } from '../common/icons'

import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'

/**
 * The actions of the current category: "new group" and "add" for the collections, only "add task"
 * on the task page. They sit in a bar of their own (which bar depends on the window width), so the
 * visible words are a label that the stylesheet hides when there is no room; the name and tooltip
 * are always there.
 */
export default function SectionActions(): JSX.Element {
  const { t } = useI18n()
  const currentTab = useAppStore((state) => state.currentTab)
  const selectedDate = useAppStore((state) => state.selectedDate)
  const setModal = useAppStore((state) => state.setModal)

  if (currentTab === 'tasks') {
    const label = t('btn_add_task')

    return (
      <div className="section-actions">
        <button
          className="primary-button section-add"
          type="button"
          title={label}
          aria-label={label}
          data-testid="add-task"
          onClick={() =>
            setModal({ kind: 'task', date: selectedDate, taskId: null })
          }
        >
          <IconAdd size={14} />
          <span className="section-action-label">{label}</span>
        </button>
      </div>
    )
  }

  const addLabel = t(currentTab === 'commands' ? 'cmd_new' : 'btn_add_item')
  const groupLabel = t('btn_new_group')

  return (
    <div className="section-actions">
      <button
        className="secondary-button section-group-add"
        type="button"
        title={groupLabel}
        aria-label={groupLabel}
        data-testid={`add-group-${currentTab}`}
        onClick={() =>
          setModal({ kind: 'group', tab: currentTab, groupId: null })
        }
      >
        <IconNewGroup size={14} />
      </button>
      <button
        className="primary-button section-add"
        type="button"
        title={addLabel}
        aria-label={addLabel}
        data-testid={`add-loose-item-${currentTab}`}
        onClick={() =>
          setModal({
            kind: 'item',
            tab: currentTab,
            groupId: null,
            itemId: null,
          })
        }
      >
        <IconAdd size={14} />
        <span className="section-action-label">{addLabel}</span>
      </button>
    </div>
  )
}
