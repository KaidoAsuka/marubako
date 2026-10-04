import type { AppData, GridTab, GroupItemMap, GroupTab } from '@shared/types'
import {
  parseGroupItemSortableId,
  parsePopupItemSortableId,
  parseTopEntrySortableId,
} from '@renderer/dnd/move-operations'
import type { OrderedEntry } from '@renderer/store/data-helpers'
import FolderWidget from '@renderer/components/groups/FolderWidget'
import GroupCard from '@renderer/components/groups/GroupCard'
import LooseWidget from '@renderer/components/groups/LooseWidget'
import GridItem from '@renderer/components/items/GridItem'
import ItemRow from '@renderer/components/items/ItemRow'
import { buildDragOverlayStyle, type ActiveDragOverlay } from './drag-overlay'

type OrderedGroup = Extract<OrderedEntry, { type: 'group' }>['group']

type Props = {
  tab: GroupTab
  data: AppData
  activeDragOverlay: ActiveDragOverlay | null
  popup: { tab: GridTab; groupId: string } | null
  popupGroup: OrderedGroup | null
  isGridMode: boolean
}

export default function DragOverlayPreview({
  tab,
  data,
  activeDragOverlay,
  popup,
  popupGroup,
  isGridMode,
}: Props): JSX.Element | null {
  if (!activeDragOverlay) {
    return null
  }

  const overlayStyle = buildDragOverlayStyle(activeDragOverlay)
  const popupItem = parsePopupItemSortableId(activeDragOverlay.id)
  if (popupItem && popup && popupGroup) {
    const item = popupGroup.items.find((entry) => entry.id === popupItem.id)
    if (!item) {
      return null
    }

    return (
      <div className="drag-overlay-shell" style={overlayStyle}>
        <GridItem
          tab={popup.tab}
          groupId={popupGroup.id}
          item={item as GroupItemMap[GridTab]}
        />
      </div>
    )
  }

  const groupItem = parseGroupItemSortableId(activeDragOverlay.id)
  if (groupItem) {
    const group = data[tab].find((entry) => entry.id === groupItem.groupId)
    const item = group?.items.find((entry) => entry.id === groupItem.itemId)
    if (!group || !item) {
      return null
    }

    return (
      <div className="drag-overlay-shell" style={overlayStyle}>
        <ItemRow tab={tab} item={item} groupId={group.id} />
      </div>
    )
  }

  const topEntry = parseTopEntrySortableId(activeDragOverlay.id)
  if (!topEntry) {
    return null
  }

  if (topEntry.type === 'group') {
    const group = data[tab].find((entry) => entry.id === topEntry.id)
    if (!group) {
      return null
    }

    if (isGridMode) {
      return (
        <div className="drag-overlay-shell" style={overlayStyle}>
          <FolderWidget
            tab={tab as GridTab}
            groupId={group.id}
            name={group.name}
            icon={group.icon}
            count={group.items.length}
            previewIcons={group.items.map((item) => item.icon)}
          />
        </div>
      )
    }

    return (
      <div className="drag-overlay-shell" style={overlayStyle}>
        <GroupCard
          tab={tab}
          group={{
            ...group,
            open: false,
          }}
        />
      </div>
    )
  }

  const looseItem = data.loose[tab].find((entry) => entry.id === topEntry.id)
  if (!looseItem) {
    return null
  }

  if (isGridMode) {
    return (
      <div className="drag-overlay-shell" style={overlayStyle}>
        <LooseWidget
          tab={tab as GridTab}
          item={looseItem as GroupItemMap[GridTab]}
        />
      </div>
    )
  }

  return (
    <div className="drag-overlay-shell" style={overlayStyle}>
      <ItemRow tab={tab} item={looseItem} groupId={null} />
    </div>
  )
}
