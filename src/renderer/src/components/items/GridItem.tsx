import type { GridTab, GroupItemMap } from '../../../../shared/types'
import EntryIcon from '../common/EntryIcon'
import { useSortableItem } from '../../dnd/use-sortable-item'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useDeleteEntity } from '../../hooks/use-delete-entity'
import { useLaunchFeedback } from '../../hooks/use-launch-feedback'
import { useAppStore } from '../../store/use-app-store'
import { openEntry } from '../../utils/open-entry'
import { getEntryTarget, getTileLabels } from '../../utils/entry-details'
import ItemActions from './ItemActions'

type Props = {
  tab: GridTab
  groupId: string
  item: GroupItemMap[GridTab]
  dropClassName?: string
  hideWhileDragging?: boolean
  sortableId?: string
}

type CardProps = Omit<Props, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function GridItem(props: Props): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <GridItemView {...rest} />
  }

  return <SortableGridItem {...rest} sortableId={sortableId} />
}

function SortableGridItem({
  sortableId,
  ...props
}: Omit<Props, 'sortableId'> & { sortableId: string }): JSX.Element {
  const sortable = useSortableItem(sortableId)

  return <GridItemView {...props} sortable={sortable} />
}

function GridItemView({
  tab,
  groupId,
  item,
  dropClassName,
  hideWhileDragging,
  sortable,
}: CardProps): JSX.Element {
  const browser = useAppStore((state) => state.data?.prefs.browser ?? 'default')
  const appIcons = useAppStore((state) => state.appIcons)
  const setModal = useAppStore((state) => state.setModal)
  const showToast = useAppStore((state) => state.showToast)
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
    <div
      ref={sortable?.setNodeRef}
      className={`grid-item desktop-entry ${dropClassName ?? ''} ${
        sortable?.isDragging && hideWhileDragging ? 'dnd-source-hidden' : ''
      } ${sortable?.isDragging ? 'dnd-dragging' : ''}`.trim()}
      style={sortable?.style}
      data-popup-item-id={item.id}
      data-launch={launchState === 'idle' ? undefined : launchState}
      data-testid={`grid-item-${item.id}`}
      title={labels.title}
      {...dragBindings}
    >
      <button
        className="grid-main"
        type="button"
        aria-label={labels.ariaLabel}
        onClick={() => {
          void launch(() => openEntry(tab, item as never, browser, groupId))
        }}
      >
        <span className="grid-ico">
          <EntryIcon icon={item.icon} imageSrc={appIcon} />
        </span>
        <span className="grid-copy">
          <span className="grid-name">{item.name}</span>
        </span>
      </button>
      <div className="grid-actions">
        <ItemActions
          testIdPrefix={item.id}
          {...(tab === 'folders' || tab === 'websites'
            ? {
                onCopy: async () => {
                  const value =
                    tab === 'folders'
                      ? 'path' in item
                        ? item.path
                        : ''
                      : 'url' in item
                        ? item.url
                        : ''

                  if (!value) {
                    return false
                  }

                  try {
                    await navigator.clipboard.writeText(value)
                    return true
                  } catch (error) {
                    showToast(
                      error instanceof Error ? error.message : String(error),
                      'danger'
                    )
                    return false
                  }
                },
              }
            : {})}
          onEdit={() =>
            setModal({
              kind: 'item',
              tab,
              groupId,
              itemId: item.id,
            })
          }
          onDelete={() =>
            deleteEntity({ kind: 'groupItem', tab, groupId, itemId: item.id })
          }
        />
      </div>
    </div>
  )
}
