import { useEffect, useRef, useState } from 'react'

import { type DragStartEvent } from '@dnd-kit/core'
import {
  IconTabApp,
  IconTabCommand,
  IconTabFolder,
  IconTabNote,
  IconTabPassword,
  IconTabWebsite,
} from '@renderer/components/common/icons'

import type { GridTab, GroupTab } from '@shared/types'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { getTopEntrySortableId } from '@renderer/dnd/move-operations'
import { useEntryContextMenu } from '@renderer/hooks/use-entry-context-menu'
import { useI18n } from '@renderer/hooks/use-i18n'
import { getTopEntries, type OrderedEntry } from '@renderer/store/data-helpers'
import { useAppStore } from '@renderer/store/use-app-store'
import DragOverlayPreview from './group-section/DragOverlayPreview'
import GridView from './group-section/GridView'
import ListView from './group-section/ListView'
import PasswordSafetyNote from './PasswordSafetyNote'
import {
  createActiveDragOverlay,
  type ActiveDragOverlay,
} from './group-section/drag-overlay'
import {
  getPointerCoordinates,
  type DragPosition,
} from './group-section/geometry'

type Props = {
  tab: GroupTab
}

const tabIcons = {
  folders: <IconTabFolder size={28} />,
  websites: <IconTabWebsite size={28} />,
  apps: <IconTabApp size={28} />,
  passwords: <IconTabPassword size={28} />,
  notes: <IconTabNote size={28} />,
  commands: <IconTabCommand size={28} />,
}

export default function GroupSection({ tab }: Props): JSX.Element {
  const { t } = useI18n()
  const data = useAppStore((state) => state.data)
  const setModal = useAppStore((state) => state.setModal)
  const hydrateIcons = useAppStore((state) => state.hydrateIcons)
  const popup = useAppStore((state) => state.widgetPopup)
  const closeWidgetPopup = useAppStore((state) => state.closeWidgetPopup)
  // Right-click, the menu key, F2 and Delete on any tile, row or card of the page and of the popup.
  const entryMenu = useEntryContextMenu(tab)
  const [activeDragOverlay, setActiveDragOverlay] =
    useState<ActiveDragOverlay | null>(null)
  const latestPointerPosition = useRef<DragPosition | null>(null)
  const activeDragId = useRef<string | null>(null)

  const isGridTab = tab === 'folders' || tab === 'websites' || tab === 'apps'

  useEffect(() => {
    if (!data || tab !== 'apps') {
      return
    }

    const paths = [
      ...data.apps.flatMap((group) => group.items.map((item) => item.path)),
      ...data.loose.apps.map((item) => item.path),
    ]

    void hydrateIcons(paths)
  }, [data, hydrateIcons, tab])

  const currentView = data?.prefs.viewMode ?? 'grid'
  const effectiveView = currentView
  const isGridMode = isGridTab && effectiveView === 'grid'

  useEffect(() => {
    if (popup && popup.tab === tab && !isGridMode) {
      closeWidgetPopup()
    }
  }, [closeWidgetPopup, isGridMode, popup, tab])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      latestPointerPosition.current = {
        x: event.clientX,
        y: event.clientY,
      }
    }

    window.addEventListener('pointermove', handlePointerMove, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
    }
  }, [])

  if (!data) {
    return <div className="section-content" />
  }

  const topEntries: OrderedEntry[] = getTopEntries(data, tab)
  const topEntryIds = topEntries.map((entry) =>
    entry.type === 'group'
      ? getTopEntrySortableId({ type: 'group', id: entry.group.id })
      : getTopEntrySortableId({ type: 'loose', id: entry.item.id })
  )
  const hasAnyContent = topEntries.length > 0
  const popupGroup =
    popup && popup.tab === tab
      ? (data[popup.tab].find((entry) => entry.id === popup.groupId) ?? null)
      : null

  const dragOverlayNode = (
    <DragOverlayPreview
      tab={tab}
      data={data}
      activeDragOverlay={activeDragOverlay}
      popup={popup}
      popupGroup={popupGroup}
      isGridMode={isGridMode}
    />
  )

  const startDragging = (event: DragStartEvent, alignGridOverlay: boolean) => {
    activeDragId.current = String(event.active.id)
    latestPointerPosition.current = getPointerCoordinates(event.activatorEvent)
    setActiveDragOverlay(createActiveDragOverlay(event, alignGridOverlay))
  }

  const stopDragging = () => {
    activeDragId.current = null
    latestPointerPosition.current = null
    setActiveDragOverlay(null)
  }

  return (
    <section
      className="section-content"
      data-testid={`section-${tab}`}
      {...entryMenu}
    >
      {/* The tab says where the user is; the heading is for screen readers. The page-level actions
          live in the bar above, and the global search replaces the filter box. */}
      <h1 className="sr-only">{t(`sec_${tab}`)}</h1>
      {tab === 'passwords' && <PasswordSafetyNote />}
      {!hasAnyContent && (
        <EmptyState
          icon={tabIcons[tab]}
          title={t(`sec_${tab}`)}
          description={t(`empty_${tab}`)}
          actionLabel={t(tab === 'commands' ? 'cmd_new' : 'btn_add_item')}
          onAction={() =>
            setModal({ kind: 'item', tab, groupId: null, itemId: null })
          }
        />
      )}
      {hasAnyContent && isGridMode && (
        <GridView
          tab={tab as GridTab}
          topEntries={topEntries}
          topEntryIds={topEntryIds}
          popup={popup}
          popupGroup={popupGroup}
          activeDragOverlay={activeDragOverlay}
          dragOverlayNode={dragOverlayNode}
          latestPointerPosition={latestPointerPosition}
          activeDragId={activeDragId}
          onDragStart={(event) => startDragging(event, true)}
          onDragStop={stopDragging}
        />
      )}
      {hasAnyContent && !isGridMode && (
        <ListView
          tab={tab}
          topEntries={topEntries}
          topEntryIds={topEntryIds}
          dragOverlayNode={dragOverlayNode}
          latestPointerPosition={latestPointerPosition}
          activeDragId={activeDragId}
          onDragStart={(event) => startDragging(event, false)}
          onDragStop={stopDragging}
        />
      )}
    </section>
  )
}
