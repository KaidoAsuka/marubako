import { IconCaretDown, IconCaretUp } from '../common/icons'
import EntryIcon from '../common/EntryIcon'

import type { GroupItemMap, GroupTab } from '../../../../shared/types'
import { useSortableItem } from '../../dnd/use-sortable-item'
import type { SortableBindings } from '../../dnd/use-sortable-base'
import { useDeleteEntity } from '../../hooks/use-delete-entity'
import { useI18n } from '../../hooks/use-i18n'
import { useLaunchFeedback } from '../../hooks/use-launch-feedback'
import { useAppStore } from '../../store/use-app-store'
import ItemActions from './ItemActions'
import CommandSnippet from './CommandSnippet'
import PasswordCard from './PasswordCard'
import { openEntry } from '../../utils/open-entry'

type Props = {
  tab: GroupTab
  item: GroupItemMap[GroupTab]
  groupId: string | null
  dropClassName?: string
  hideWhileDragging?: boolean
  sortableId?: string
}

type RowProps = Omit<Props, 'sortableId'> & {
  sortable?: SortableBindings
}

export default function ItemRow(props: Props): JSX.Element {
  const { sortableId, ...rest } = props

  if (!sortableId) {
    return <ItemRowView {...rest} />
  }

  return <SortableItemRow {...rest} sortableId={sortableId} />
}

function SortableItemRow({
  sortableId,
  ...props
}: Omit<Props, 'sortableId'> & { sortableId: string }): JSX.Element {
  const sortable = useSortableItem(sortableId)

  return <ItemRowView {...props} sortable={sortable} />
}

function ItemRowView({
  tab,
  item,
  groupId,
  hideWhileDragging,
  sortable,
}: RowProps): JSX.Element {
  const { t } = useI18n()
  const data = useAppStore((state) => state.data)
  const browser = useAppStore((state) => state.data?.prefs.browser ?? 'default')
  const revealedPasswordIds = useAppStore((state) => state.revealedPasswordIds)
  const expandedNoteIds = useAppStore((state) => state.expandedNoteIds)
  const togglePasswordReveal = useAppStore(
    (state) => state.togglePasswordReveal
  )
  const toggleNoteExpanded = useAppStore((state) => state.toggleNoteExpanded)
  const setModal = useAppStore((state) => state.setModal)
  const showToast = useAppStore((state) => state.showToast)
  const deleteEntity = useDeleteEntity()
  const { state: launchState, launch } = useLaunchFeedback()
  const appIcons = useAppStore((state) => state.appIcons)
  const dragBindings = sortable
    ? {
        ...sortable.attributes,
        ...sortable.listeners,
      }
    : {}

  const appIcon =
    (tab === 'folders' || tab === 'apps') && 'path' in item
      ? appIcons[item.path]
      : null
  const revealed = tab === 'passwords' && revealedPasswordIds.includes(item.id)
  const expanded = tab === 'notes' && expandedNoteIds.includes(item.id)

  const subtext =
    tab === 'folders' || tab === 'apps'
      ? 'path' in item
        ? item.path
        : ''
      : tab === 'websites'
        ? 'url' in item
          ? item.url
          : ''
        : tab === 'passwords'
          ? 'username' in item
            ? item.username
            : ''
          : ''

  const handleDelete = () =>
    deleteEntity(
      groupId === null
        ? { kind: 'loose', tab, itemId: item.id }
        : { kind: 'groupItem', tab, groupId, itemId: item.id }
    )

  // The button that was pressed confirms the copy itself; only a failure still gets a toast.
  const copyValue = async (value: string): Promise<boolean> => {
    if (!value) return false
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
  }

  const handleCopy = async (): Promise<boolean> => {
    const value =
      tab === 'folders' || tab === 'apps'
        ? 'path' in item
          ? item.path
          : ''
        : tab === 'websites'
          ? 'url' in item
            ? item.url
            : ''
          : tab === 'passwords'
            ? 'password' in item
              ? item.password
              : ''
            : tab === 'notes' || tab === 'commands'
              ? 'content' in item
                ? item.content
                : ''
              : ''

    return copyValue(value)
  }

  const launchable =
    tab !== 'passwords' && tab !== 'notes' && tab !== 'commands'

  const handleOpen = async () => {
    if (!data || !launchable) {
      return
    }

    await launch(() => openEntry(tab, item as never, browser, groupId))
  }

  return (
    <div
      ref={sortable?.setNodeRef}
      className={`item-row ${tab === 'commands' ? 'command-item' : ''} ${groupId === null ? 'desktop-entry' : ''} ${tab === 'passwords' ? 'password-item' : ''} ${
        sortable?.isDragging && hideWhileDragging ? 'dnd-source-hidden' : ''
      } ${sortable?.isDragging ? 'dnd-dragging' : ''}`.trim()}
      style={sortable?.style}
      data-top-entry-id={groupId === null ? item.id : undefined}
      data-top-entry-type={groupId === null ? 'loose' : undefined}
      data-list-group-id={groupId ?? undefined}
      data-list-item-id={groupId !== null ? item.id : undefined}
      data-launchable={launchable ? '' : undefined}
      data-launch={launchState === 'idle' ? undefined : launchState}
      data-testid={`item-row-${item.id}`}
      onClick={() => void handleOpen()}
      {...dragBindings}
    >
      {item.kind === 'command' ? (
        <CommandSnippet
          item={item}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onEdit={() =>
            setModal({ kind: 'item', tab, groupId, itemId: item.id })
          }
        />
      ) : item.kind === 'password' ? (
        <PasswordCard
          item={item}
          revealed={revealed}
          onToggleReveal={() => togglePasswordReveal(item.id)}
          onCopyUsername={() => copyValue(item.username)}
          onCopyPassword={handleCopy}
          onEdit={() =>
            setModal({ kind: 'item', tab, groupId, itemId: item.id })
          }
          onDelete={handleDelete}
        />
      ) : (
        <>
          <div className="item-icon">
            <EntryIcon icon={item.icon} imageSrc={appIcon} />
          </div>
          <div className="item-copy">
            <div className="item-name" title={item.name}>
              {item.name}
            </div>
            {subtext ? (
              <div className="item-subtext" title={subtext}>
                {subtext}
              </div>
            ) : null}
            {tab === 'notes' && 'content' in item && (
              <div className={`note-preview ${expanded ? 'expanded' : ''}`}>
                {item.content}
              </div>
            )}
            {tab === 'notes' && 'content' in item && item.content && (
              <button
                className="note-toggle"
                type="button"
                aria-label={t('note_toggle')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleNoteExpanded(item.id)
                }}
              >
                {expanded ? (
                  <IconCaretUp size={12} />
                ) : (
                  <IconCaretDown size={12} />
                )}
              </button>
            )}
          </div>
          <ItemActions
            testIdPrefix={item.id}
            onEdit={() =>
              setModal({
                kind: 'item',
                tab,
                groupId,
                itemId: item.id,
              })
            }
            onDelete={handleDelete}
            {...(tab === 'folders' ||
            tab === 'websites' ||
            tab === 'passwords' ||
            tab === 'notes'
              ? { onCopy: handleCopy }
              : {})}
          />
        </>
      )}
    </div>
  )
}
