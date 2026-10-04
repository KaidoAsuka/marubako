import {
  IconAdd,
  IconNewGroup,
  IconViewGrid,
  IconViewList,
} from '../common/icons'

import { GRID_TABS, type Tab } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useLayoutMode } from '../../hooks/use-layout-mode'
import { useAppStore } from '../../store/use-app-store'

function hasItemLayout(tab: Tab): boolean {
  return (GRID_TABS as readonly Tab[]).includes(tab)
}

/**
 * The actions of the current category: "new group" and "add" for the collections, only "add task"
 * on the task page. The three categories that can show their items as a grid or as a list also
 * carry the switch between the two (the same setting as "item layout" in the settings dialog).
 * They sit in a bar of their own (which bar depends on the window width), so the visible words are
 * a label that the stylesheet hides when there is no room; the name and tooltip are always there.
 */
export default function SectionActions(): JSX.Element {
  const { t } = useI18n()
  const { viewToggle } = useLayoutMode()
  const currentTab = useAppStore((state) => state.currentTab)
  const selectedDate = useAppStore((state) => state.selectedDate)
  const setModal = useAppStore((state) => state.setModal)
  const viewMode = useAppStore((state) => state.data?.prefs.viewMode ?? 'list')
  const updateData = useAppStore((state) => state.updateData)

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
  // The button shows, and names, the layout a click changes to.
  const nextView = viewMode === 'grid' ? 'list' : 'grid'
  const viewLabel = t(`view_switch_${nextView}`)
  const ViewIcon = nextView === 'grid' ? IconViewGrid : IconViewList

  return (
    <div className="section-actions">
      {viewToggle && hasItemLayout(currentTab) && (
        <button
          className="secondary-button section-view-toggle"
          type="button"
          title={viewLabel}
          aria-label={viewLabel}
          data-testid="toggle-view-mode"
          data-view-mode={viewMode}
          onClick={() =>
            void updateData((draft) => {
              draft.prefs.viewMode = nextView
            })
          }
        >
          <ViewIcon size={14} />
        </button>
      )}
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
