import type { GroupItemMap, GridTab } from '../../../shared/types'

/** The path or address an entry opens: the line a one-line tile leaves out. */
export function getEntryTarget(item: GroupItemMap[GridTab]): string {
  return item.kind === 'website' ? item.url : item.path
}

/**
 * What a one-line tile says about itself without drawing it. The tooltip (`title`) is the name and
 * the detail on two lines; the accessible name is the same on one line. A tile that has no detail
 * (a group with no path, say) is just its name.
 */
export function getTileLabels(
  name: string,
  detail: string
): { title: string; ariaLabel: string } {
  if (!detail) return { title: name, ariaLabel: name }

  return { title: `${name}\n${detail}`, ariaLabel: `${name}, ${detail}` }
}
