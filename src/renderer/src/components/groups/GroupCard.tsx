import { IconAdd, IconDelete, IconEdit, IconExpandGroup } from '../common/icons'
import EntryIcon from '../common/EntryIcon'
import { rectSortingStrategy } from '@dnd-kit/sortable'

import type { GroupItemMap, GroupTab } from '../../../../shared/types'
import DndProvider, { SortableZone } from '../../dnd/DndProvider'
import { getGroupItemSortableId } from '../../dnd/move-operations'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useSortableGroup } from '../../dnd/use-sortable-group'
import { useDeleteEntity } from '../../hooks/use-delete-entity'
import { useI18n } from '../../hooks/use-i18n'
import { useOpenedByUser } from '../../hooks/use-opened-by-user'
import { useAppStore } from '../../store/use-app-store'
import ItemRow from '../items/ItemRow'

type Props = {
  tab: GroupTab
  group: {
    id: string
    name: string
    icon: string
    open: boolean
    items: Array<GroupItemMap[GroupTab]>
  }
  dropClassName?: string
  hideWhileDragging?: boolean
  useExternalItemDnd?: boolean
  sortableId?: string
}

type CardProps = Omit<Props, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function GroupCard(props: Props): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <GroupCardView {...rest} />
  }

  return <SortableGroupCard {...rest} sortableId={sortableId} />
}

function SortableGroupCard({
  sortableId,
  ...props
}: Omit<Props, 'sortableId'> & { sortableId: string }): JSX.Element {
  const sortable = useSortableGroup(sortableId)

  return <GroupCardView {...props} sortable={sortable} />
}

function GroupCardView({
  tab,
  group,
  dropClassName,
  hideWhileDragging,
  sortable,
  useExternalItemDnd = false,
}: CardProps): JSX.Element {
  const { t } = useI18n()
  const setModal = useAppStore((state) => state.setModal)
  const updateData = useAppStore((state) => state.updateData)
  const deleteEntity = useDeleteEntity()
  const reorderItems = useAppStore((state) => state.reorderItems)
  const unfold = useOpenedByUser(group.open)
  const dragBindings = sortable
    ? {
        ...sortable.listeners,
      }
    : {}

  const toggleGroup = () => {
    void updateData((draft) => {
      const target = (draft[tab] as Array<any>).find(
        (entry) => entry.id === group.id
      )
      if (target) {
        target.open = !target.open
      }
    })
  }

  return (
    <section
      ref={sortable?.setNodeRef}
      className={`group-card desktop-entry ${dropClassName ?? ''} ${group.open ? 'open' : ''} ${
        sortable?.isDragging && hideWhileDragging ? 'dnd-source-hidden' : ''
      } ${sortable?.isDragging ? 'dnd-dragging' : ''}`.trim()}
      style={sortable?.style}
      data-top-entry-id={group.id}
      data-top-entry-type="group"
      data-testid={`group-card-${group.id}`}
    >
      <div
        className="group-card-header"
        role="button"
        tabIndex={0}
        data-testid={`group-toggle-${group.id}`}
        {...dragBindings}
        onClick={toggleGroup}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleGroup()
          }
        }}
      >
        <span className="group-card-icon">
          <EntryIcon icon={group.icon} />
        </span>
        <span className="group-card-copy">
          <span className="group-card-title">{group.name}</span>
          <span className="group-card-meta">
            {group.items.length} {t('items_count')}
          </span>
        </span>
        <span
          className="group-card-actions"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="icon-button"
            type="button"
            data-testid={`add-item-${group.id}`}
            onClick={() =>
              setModal({ kind: 'item', tab, groupId: group.id, itemId: null })
            }
          >
            <IconAdd size={12} />
          </button>
          <button
            className="icon-button"
            type="button"
            data-testid={`edit-group-${group.id}`}
            onClick={() => setModal({ kind: 'group', tab, groupId: group.id })}
          >
            <IconEdit size={12} />
          </button>
          <button
            className="icon-button danger"
            type="button"
            data-testid={`delete-group-${group.id}`}
            onClick={() =>
              deleteEntity({ kind: 'group', tab, groupId: group.id })
            }
          >
            <IconDelete size={12} />
          </button>
        </span>
        <IconExpandGroup size={14} className="group-card-chevron" />
      </div>
      {group.open && (
        <div className="group-card-body" data-unfold={unfold ? '' : undefined}>
          {sortable && !useExternalItemDnd ? (
            <DndProvider
              strategy={rectSortingStrategy}
              ids={group.items.map((item) => item.id)}
              onDragEnd={(activeId, overId) => {
                if (!overId || activeId === overId) {
                  return
                }

                void reorderItems(tab, group.id, activeId, overId)
              }}
            >
              <div className="group-item-list">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    tab={tab}
                    item={item}
                    groupId={group.id}
                    sortableId={item.id}
                  />
                ))}
              </div>
            </DndProvider>
          ) : useExternalItemDnd ? (
            <SortableZone
              strategy={rectSortingStrategy}
              ids={group.items.map((item) =>
                getGroupItemSortableId(group.id, item.id)
              )}
            >
              <div className="group-item-list">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    tab={tab}
                    item={item}
                    groupId={group.id}
                    hideWhileDragging
                    sortableId={getGroupItemSortableId(group.id, item.id)}
                  />
                ))}
              </div>
            </SortableZone>
          ) : (
            <div className="group-item-list">
              {group.items.map((item) => (
                <ItemRow
                  key={item.id}
                  tab={tab}
                  item={item}
                  groupId={group.id}
                />
              ))}
            </div>
          )}
          <button
            className="group-add-button"
            type="button"
            onClick={() =>
              setModal({ kind: 'item', tab, groupId: group.id, itemId: null })
            }
          >
            <IconAdd size={14} />
            <span>{t('btn_add_item')}</span>
          </button>
        </div>
      )}
    </section>
  )
}
