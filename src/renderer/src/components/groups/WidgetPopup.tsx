import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { IconAdd, IconClose } from '../common/icons'
import EntryIcon from '../common/EntryIcon'
import { rectSortingStrategy } from '@dnd-kit/sortable'

import { SortableZone } from '../../dnd/DndProvider'
import { getPopupItemSortableId } from '../../dnd/move-operations'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'
import { usePresenceSnapshot } from '../../hooks/use-presence-snapshot'
import GridItem from '../items/GridItem'

type Props = {
  popupItemId?: string | null
  popupItemClassName?: string
}

export default function WidgetPopup({
  popupItemId = null,
  popupItemClassName = '',
}: Props): JSX.Element | null {
  const { t } = useI18n()
  const activePopup = useAppStore((state) => state.widgetPopup)
  const { snapshot: popup, exiting } = usePresenceSnapshot(activePopup)
  const data = useAppStore((state) => state.data)
  const currentTab = useAppStore((state) => state.currentTab)
  const closeWidgetPopup = useAppStore((state) => state.closeWidgetPopup)
  const setModal = useAppStore((state) => state.setModal)
  // The mouse went down on the backdrop itself: a drag that began inside the popup and ended on the
  // backdrop is not a click on it (see Modal.tsx).
  const pressedOnOverlay = useRef(false)

  useEffect(() => {
    if (activePopup && activePopup.tab !== currentTab) {
      closeWidgetPopup()
    }
  }, [closeWidgetPopup, currentTab, activePopup])

  if (!popup || !data) {
    return null
  }

  const group = data[popup.tab].find((entry) => entry.id === popup.groupId)
  if (!group || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="widget-popup-overlay"
      data-exiting={exiting || undefined}
      aria-hidden={exiting || undefined}
      {...(exiting ? { inert: '' } : {})}
      role="presentation"
      onMouseDown={(event) => {
        pressedOnOverlay.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        const startedOnOverlay = pressedOnOverlay.current
        pressedOnOverlay.current = false
        if (startedOnOverlay && event.target === event.currentTarget) {
          closeWidgetPopup()
        }
      }}
    >
      <div className="widget-popup">
        <div className="widget-popup-header">
          <div className="widget-popup-icon">
            <EntryIcon icon={group.icon} />
          </div>
          <div className="widget-popup-title">{group.name}</div>
          <div className="widget-popup-actions">
            <button
              className="icon-button widget-popup-action"
              type="button"
              onClick={() =>
                setModal({
                  kind: 'item',
                  tab: popup.tab,
                  groupId: popup.groupId,
                  itemId: null,
                })
              }
            >
              <IconAdd size={14} />
            </button>
            <button
              className="icon-button widget-popup-close"
              type="button"
              onClick={closeWidgetPopup}
            >
              <IconClose size={14} />
            </button>
          </div>
        </div>
        <SortableZone
          ids={group.items.map((item) => getPopupItemSortableId(item.id))}
          strategy={rectSortingStrategy}
        >
          <div className="grid-view">
            {group.items.map((item) => (
              <GridItem
                key={item.id}
                tab={popup.tab}
                groupId={group.id}
                item={item}
                hideWhileDragging
                sortableId={getPopupItemSortableId(item.id)}
                dropClassName={
                  popupItemId === getPopupItemSortableId(item.id)
                    ? popupItemClassName
                    : ''
                }
              />
            ))}
            <button
              className="grid-add"
              type="button"
              onClick={() =>
                setModal({
                  kind: 'item',
                  tab: popup.tab,
                  groupId: popup.groupId,
                  itemId: null,
                })
              }
            >
              <IconAdd size={18} />
              <span className="grid-add-label">{t('btn_add_item')}</span>
            </button>
          </div>
        </SortableZone>
      </div>
    </div>,
    document.body
  )
}
