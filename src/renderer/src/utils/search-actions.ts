import type { SearchResult } from './search'

/**
 * What Enter does with a search result. Folders, websites and apps are launched; a command or a note
 * is copied; a password entry copies its password (the search never shows or indexes it); a group or
 * a task is shown. An entry with nothing to copy is opened for editing instead, which is also what
 * Shift+Enter does for any entry.
 */
export type ResultAction = 'open' | 'copy' | 'copyPassword' | 'edit' | 'view'

export function primaryAction(result: SearchResult): ResultAction {
  if (result.type !== 'item') return 'view'

  switch (result.item.kind) {
    case 'folder':
    case 'website':
    case 'app':
      return 'open'
    case 'password':
      return result.item.password ? 'copyPassword' : 'edit'
    case 'command':
    case 'note':
      return result.item.content ? 'copy' : 'edit'
  }
}

/** What a copy action puts on the clipboard; an empty string when the result has nothing to copy. */
export function copyTextOf(result: SearchResult): string {
  if (result.type !== 'item') return ''

  switch (result.item.kind) {
    case 'password':
      return result.item.password
    case 'command':
    case 'note':
      return result.item.content
    default:
      return ''
  }
}
