import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconClose,
  IconCopy,
  IconEdit,
  IconEnter,
  IconOpen,
  IconSearch,
} from './icons'
import EntryIcon from './EntryIcon'
import { createPortal } from 'react-dom'

import { useDialogFocus } from '../../hooks/use-dialog-focus'
import { usePresenceSnapshot } from '../../hooks/use-presence-snapshot'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'
import { openEntry } from '../../utils/open-entry'
import { readRecent, recordUse } from '../../utils/recent'
import {
  emptyQueryResults,
  searchEntries,
  type SearchResult,
} from '../../utils/search'
import {
  copyTextOf,
  primaryAction,
  type ResultAction,
} from '../../utils/search-actions'

// The words on the row's right edge and in the footer for what Enter will do.
const ACTION_LABELS: Record<ResultAction, string> = {
  open: 'search_open',
  copy: 'search_copy',
  copyPassword: 'search_copy_password',
  edit: 'search_edit',
  view: 'search_view',
}

// What an empty query lists, as the caption above the results says it.
const EMPTY_CAPTIONS = {
  recent: 'search_recent',
  current: 'search_current_tab',
  all: 'search_suggestions',
} as const

const DIRECT_KEYS = /^[1-9]$/

function ActionIcon({ action }: { action: ResultAction }): JSX.Element {
  return action === 'copy' || action === 'copyPassword' ? (
    <IconCopy size={14} />
  ) : action === 'edit' ? (
    <IconEdit size={14} />
  ) : (
    <IconOpen size={14} />
  )
}

export default function CommandPalette(): JSX.Element | null {
  const open = useAppStore((state) => state.commandOpen)
  const { snapshot, revision } = usePresenceSnapshot(open ? true : null)
  return snapshot ? <PaletteDialog key={revision} open={open} /> : null
}

function PaletteDialog({ open }: { open: boolean }): JSX.Element {
  const { t } = useI18n()
  const data = useAppStore((state) => state.data)
  const setCommandOpen = useAppStore((state) => state.setCommandOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  // Alt held down: the first nine rows show the digit that jumps to them.
  const [altHeld, setAltHeld] = useState(false)
  // Read once when the search opens: what was used lately, and the category it was opened from.
  const [recent] = useState(readRecent)
  const [startTab] = useState(() => useAppStore.getState().currentTab)
  const close = useCallback(() => setCommandOpen(false), [setCommandOpen])
  const dialogRef = useDialogFocus(open, close)
  const resultList = useRef<HTMLDivElement>(null)
  const blank = !query.trim()
  const listing = useMemo(() => {
    if (!data) return { kind: null, results: [] as SearchResult[] }
    if (blank) {
      return emptyQueryResults(data, { recent, currentTab: startTab })
    }

    return { kind: null, results: searchEntries(data, query) }
  }, [blank, data, query, recent, startTab])
  const results = listing.results
  const selected = Math.min(active, Math.max(0, results.length - 1))
  const selectedAction = results[selected]
    ? primaryAction(results[selected])
    : null

  useEffect(() => {
    resultList.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const edit = (result: SearchResult) => {
    if (result.type !== 'item') return
    const store = useAppStore.getState()
    close()
    store.setCurrentTab(result.tab)
    store.setModal({
      kind: 'item',
      tab: result.tab,
      groupId: result.groupId,
      itemId: result.item.id,
    })
  }

  const copy = async (result: SearchResult, action: ResultAction) => {
    if (result.type !== 'item') return
    const store = useAppStore.getState()
    setBusy(true)
    try {
      await navigator.clipboard.writeText(copyTextOf(result))
      recordUse(result.tab, result.item.id)
      // The strip below the search says it; the search itself has done its job and goes.
      store.showToast(
        t(action === 'copyPassword' ? 'password_copied' : 'copied'),
        'success'
      )
      close()
    } catch (error) {
      store.showToast(
        error instanceof Error ? error.message : String(error),
        'danger'
      )
    } finally {
      setBusy(false)
    }
  }

  /** `edit` is Shift+Enter or the pencil: the editor, whatever Enter would have done. */
  const activate = async (
    result: SearchResult,
    mode: 'primary' | 'edit' = 'primary'
  ) => {
    if (busy || !data) return
    const store = useAppStore.getState()
    if (mode === 'edit' && result.type === 'item') {
      edit(result)
      return
    }
    const action = primaryAction(result)
    if (action === 'open' && result.type === 'item') {
      setBusy(true)
      // openEntry also folds the panel away when the "hide after launch" setting asks for it.
      const opened = await openEntry(
        result.tab,
        result.item,
        data.prefs.browser,
        result.groupId
      )
      setBusy(false)
      if (opened) close()
      return
    }
    if (action === 'copy' || action === 'copyPassword') {
      await copy(result, action)
      return
    }
    if (action === 'edit') {
      edit(result)
      return
    }
    close()
    store.setCurrentTab(result.tab)
    if (result.type === 'task') {
      store.setSelectedDate(result.date)
      store.setModal({
        kind: 'task',
        date: result.date,
        taskId: result.task.id,
      })
    } else if (result.type === 'group') {
      if (
        ['folders', 'websites', 'apps'].includes(result.tab) &&
        data.prefs.viewMode === 'grid'
      ) {
        store.openWidgetPopup(
          result.tab as 'folders' | 'websites' | 'apps',
          result.groupId
        )
      } else {
        await store.updateData((draft) => {
          const group = draft[result.tab].find(
            (entry) => entry.id === result.groupId
          )
          if (group) group.open = true
        })
      }
    }
  }

  return createPortal(
    <div
      className="command-overlay"
      data-exiting={!open || undefined}
      aria-hidden={!open || undefined}
      {...(!open ? { inert: '' } : {})}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialogRef}
        className="command-dialog"
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label={t('global_search')}
        data-testid="command-palette"
        tabIndex={-1}
      >
        <div className="command-input-row">
          <IconSearch size={21} />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-autocomplete="list"
            aria-activedescendant={
              results[selected] ? `command-result-${selected}` : undefined
            }
            aria-label={t('global_search')}
            data-testid="command-input"
            placeholder={t('global_search_placeholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyUp={(event) => {
              if (event.key === 'Alt') setAltHeld(false)
            }}
            onBlur={() => setAltHeld(false)}
            onKeyDown={(event) => {
              if (event.key === 'Alt') setAltHeld(true)
              if (event.nativeEvent.isComposing) return
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (results.length)
                  setActive(
                    (selected +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      results.length) %
                      results.length
                  )
              } else if (event.key === 'Enter' && results[selected]) {
                event.preventDefault()
                void activate(
                  results[selected],
                  event.shiftKey ? 'edit' : 'primary'
                )
              } else if (
                event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                DIRECT_KEYS.test(event.key)
              ) {
                // Alt+1..9 does what Enter would on that row, without moving to it first.
                event.preventDefault()
                const target = results[Number(event.key) - 1]
                if (target) void activate(target)
              }
            }}
          />
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label={t('close')}
            title="Esc"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="command-caption" data-testid="command-caption">
          {query.trim()
            ? `${results.length} ${t('search_results')}`
            : listing.kind
              ? t(EMPTY_CAPTIONS[listing.kind])
              : t('search_suggestions')}
        </div>
        <div
          id="command-results"
          ref={resultList}
          className="command-results"
          role="listbox"
          aria-label={t('search_results')}
          aria-busy={busy}
        >
          {results.map((result, index) => {
            const action = primaryAction(result)

            return (
              <div
                key={result.key}
                className={`command-row ${index === selected ? 'selected' : ''}`}
              >
                <button
                  id={`command-result-${index}`}
                  className={`command-result ${index === selected ? 'selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  data-action={action}
                  disabled={busy}
                  onMouseMove={() => setActive(index)}
                  onClick={() => void activate(result)}
                >
                  <span className="command-result-icon">
                    <EntryIcon icon={result.icon} />
                  </span>
                  <span className="command-result-copy">
                    <strong>{result.name}</strong>
                    <span>
                      {t(`tab_${result.tab}`)}
                      {result.type === 'item' && result.groupName
                        ? ` / ${result.groupName}`
                        : ''}{' '}
                      ·{' '}
                      {result.type === 'group'
                        ? `${result.detail} ${t('items_count')}`
                        : result.detail || t('search_view')}
                    </span>
                  </span>
                  <span className="command-result-action">
                    {altHeld && index < 9 && (
                      <kbd data-testid="command-digit">{index + 1}</kbd>
                    )}
                    {t(ACTION_LABELS[action])}
                    <ActionIcon action={action} />
                  </span>
                </button>
                {result.type === 'item' && (
                  <button
                    className="icon-button command-result-edit"
                    type="button"
                    tabIndex={-1}
                    data-testid={`command-edit-${index}`}
                    aria-label={`${t('search_edit')}: ${result.name}`}
                    title={`${t('search_edit')} (Shift+Enter)`}
                    disabled={busy}
                    onClick={() => void activate(result, 'edit')}
                  >
                    <IconEdit size={14} />
                  </button>
                )}
              </div>
            )
          })}
          {!results.length && (
            <div className="command-empty">
              <IconSearch size={28} />
              <strong>{t('no_results')}</strong>
              <span>{t('search_empty_hint')}</span>
            </div>
          )}
        </div>
        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t('search_navigate')}
          </span>
          <span data-testid="command-footer-enter">
            <IconEnter size={14} />{' '}
            {selectedAction ? t(ACTION_LABELS[selectedAction]) : ''}
          </span>
          <span>
            <kbd>Shift</kbd>
            <IconEnter size={14} /> {t('search_edit')}
          </span>
          <span>
            <kbd>Alt</kbd>
            <kbd>1–9</kbd> {t('search_jump')}
          </span>
          <span>
            <kbd>Esc</kbd> {t('close')}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
