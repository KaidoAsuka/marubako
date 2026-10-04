import { IconDelete, IconEdit } from '../common/icons'
import EntryIcon from '../common/EntryIcon'

import type { GridTab, GroupItemMap } from '../../../../shared/types'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useSortableItem } from '../../dnd/use-sortable-item'
import { useDeleteEntity } from '../../hooks/use-delete-entity'
import { useI18n } from '../../hooks/use-i18n'
import { useLaunchFeedback } from '../../hooks/use-launch-feedback'
import { useAppStore } from '../../store/use-app-store'
import { openEntry } from '../../utils/open-entry'
import { getEntryTarget, getTileLabels } from '../../utils/entry-details'

type Props<K extends GridTab> = {
  tab: K
  item: GroupItemMap[K]
  dropClassName?: string
  hideWhileDragging?: boolean
  sortableId?: string
}

type WidgetProps<K extends GridTab> = Omit<Props<K>, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function LooseWidget<K extends GridTab>(
  props: Props<K>
): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <LooseWidgetView {...rest} />
  }

  return <SortableLooseWidget {...rest} sortableId={sortableId} />
}

function SortableLooseWidget<K extends GridTab>({
  sortableId,
  ...props
}: Props<K> & { sortableId: string }): JSX.Element {
  const sortable = useSortableItem(sortableId)

  return <LooseWidgetView {...props} sortable={sortable} />
}

function LooseWidgetView<K extends GridTab>({
  tab,
  item,
  dropClassName,
  hideWhileDragging,
  sortable,
}: WidgetProps<K>): JSX.Element {
  const { t } = useI18n()
  const browser = useAppStore((state) => state.data?.prefs.browser ?? 'default')
  const appIcons = useAppStore((state) => state.appIcons)
  const setModal = useAppStore((state) => state.setModal)
  const deleteEntity = useDeleteEntity()
  const { state: launchState, launch } = useLaunchFeedback()
  const dragBindings = sortable
    ? {
        ...sortable.attributes,
        ...sortable.listeners,
      }
    : {}

  const appIcon = 'path' in item ? appIcons[item.path] : null
  // One line (icon and name): the path or address is in the tooltip and the accessible name.
  const labels = getTileLabels(item.name, getEntryTarget(item))

  return (
    <article
      ref={sortable?.setNodeRef}
      className={`widget-loose desktop-entry ${dropClassName ?? ''} ${
        sortable?.isDragging && hideWhileDragging ? 'dnd-source-hidden' : ''
      } ${sortable?.isDragging ? 'dnd-dragging' : ''}`.trim()}
      style={sortable?.style}
      data-top-entry-id={item.id}
      data-top-entry-type="loose"
      data-launch={launchState === 'idle' ? undefined : launchState}
      data-testid={`loose-widget-${item.id}`}
      title={labels.title}
      aria-label={labels.ariaLabel}
      {...dragBindings}
      onClick={() => void launch(() => openEntry(tab, item, browser, null))}
    >
      <div
        className="widget-actions"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          className="icon-button widget-action-button"
          type="button"
          title={t('m_edit_item')}
          aria-label={t('m_edit_item')}
          onClick={() => {
            setModal({
              kind: 'item',
              tab,
              groupId: null,
              itemId: item.id,
            })
          }}
        >
          <IconEdit size={10} />
        </button>
        <button
          className="icon-button widget-action-button danger"
          type="button"
          title={t('btn_delete')}
          aria-label={t('btn_delete')}
          onClick={() => deleteEntity({ kind: 'loose', tab, itemId: item.id })}
        >
          <IconDelete size={10} />
        </button>
      </div>
      <button className="widget-loose-box" type="button" aria-label={item.name}>
        <span className="loose-icon-source">
          <EntryIcon icon={item.icon} imageSrc={appIcon} />
        </span>
      </button>
      <div className="widget-label">
        <div className="widget-name">{item.name}</div>
      </div>
    </article>
  )
}
