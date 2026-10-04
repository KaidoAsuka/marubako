import { IconDelete, IconEdit } from '../common/icons'
import EntryIcon from '../common/EntryIcon'

import type { GridTab } from '../../../../shared/types'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useSortableItem } from '../../dnd/use-sortable-item'
import { useDeleteEntity } from '../../hooks/use-delete-entity'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'
import { getTileLabels } from '../../utils/entry-details'

type Props = {
  tab: GridTab
  groupId: string
  name: string
  icon: string
  count: number
  previewIcons: string[]
  dropClassName?: string
  hideWhileDragging?: boolean
  sortableId?: string
}

type WidgetProps = Omit<Props, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function FolderWidget(props: Props): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <FolderWidgetView {...rest} />
  }

  return <SortableFolderWidget {...rest} sortableId={sortableId} />
}

function SortableFolderWidget({
  sortableId,
  ...props
}: Omit<Props, 'sortableId'> & { sortableId: string }): JSX.Element {
  const sortable = useSortableItem(sortableId)

  return <FolderWidgetView {...props} sortable={sortable} />
}

function FolderWidgetView({
  tab,
  groupId,
  name,
  icon,
  count,
  dropClassName,
  hideWhileDragging,
  sortable,
}: WidgetProps): JSX.Element {
  const { t } = useI18n()
  const openWidgetPopup = useAppStore((state) => state.openWidgetPopup)
  const setModal = useAppStore((state) => state.setModal)
  const deleteEntity = useDeleteEntity()
  const dragBindings = sortable
    ? {
        ...sortable.attributes,
        ...sortable.listeners,
      }
    : {}

  const openGroup = () => {
    openWidgetPopup(tab, groupId)
  }

  // The tile is one line (icon, name, a faint count): the count in words lives in the tooltip and in
  // the accessible name.
  const labels = getTileLabels(name, `${count} ${t('items_count')}`)

  return (
    <article
      ref={sortable?.setNodeRef}
      className={`folder-widget desktop-entry ${dropClassName ?? ''} ${
        sortable?.isDragging && hideWhileDragging ? 'dnd-source-hidden' : ''
      } ${sortable?.isDragging ? 'dnd-dragging' : ''}`.trim()}
      style={sortable?.style}
      data-top-entry-id={groupId}
      data-top-entry-type="group"
      data-testid={`folder-widget-${groupId}`}
      title={labels.title}
      aria-label={labels.ariaLabel}
      {...dragBindings}
      onClick={openGroup}
    >
      <div
        className="widget-actions"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button widget-action-button"
          type="button"
          title={t('m_edit_group')}
          aria-label={t('m_edit_group')}
          onClick={() => setModal({ kind: 'group', tab, groupId })}
        >
          <IconEdit size={10} />
        </button>
        <button
          className="icon-button widget-action-button danger"
          type="button"
          title={t('btn_delete')}
          aria-label={t('btn_delete')}
          onClick={() => deleteEntity({ kind: 'group', tab, groupId })}
        >
          <IconDelete size={10} />
        </button>
      </div>
      <button className="widget-box" type="button" aria-label={name}>
        <span className="widget-folder-symbol">
          <EntryIcon icon={icon} />
        </span>
      </button>
      <div className="widget-label">
        <div className="widget-name">{name}</div>
      </div>
      <div className="widget-count" aria-hidden="true">
        {count}
      </div>
    </article>
  )
}
