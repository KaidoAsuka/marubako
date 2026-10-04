/**
 * The right-click menu of entries and groups is a native menu shown by the main process (it can reach
 * past the edge of the narrow panel, and looks like the menu of the floating ball), but the words and
 * the meaning of each item belong to the window: it sends a description of the menu and gets the id of
 * the chosen item back. This is that description and the checks that make it safe to build from.
 */

export interface ContextMenuItem {
  /** What comes back when the item is chosen. Not needed for a separator or an item with a submenu. */
  id?: string
  label?: string
  type?: 'separator'
  enabled?: boolean
  /** Shown beside the label (the shortcut that does the same); it registers nothing. */
  accelerator?: string
  /** One level only: the items of a submenu have no submenu of their own. */
  submenu?: ContextMenuItem[]
}

/** Where to open the menu, in the window's own pixels. Left out, it opens at the mouse pointer. */
export interface ContextMenuPoint {
  x: number
  y: number
}

export const MAX_MENU_ITEMS = 40
export const MAX_MENU_LABEL = 80
export const MAX_MENU_ID = 100
/** The only accelerators a menu may show: the two keys the entries answer to. */
export const MENU_ACCELERATORS = ['F2', 'Delete'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readItem(
  value: unknown,
  inSubmenu: boolean,
  budget: { left: number }
): ContextMenuItem {
  if (!isRecord(value)) throw new Error('Invalid menu item')
  if (budget.left <= 0) throw new Error('Menu too large')
  budget.left -= 1
  if (value.type !== undefined && value.type !== 'separator') {
    throw new Error('Invalid menu item type')
  }
  if (value.type === 'separator') return { type: 'separator' }

  const { id, label, enabled, accelerator, submenu } = value
  if (
    typeof label !== 'string' ||
    label === '' ||
    label.length > MAX_MENU_LABEL
  ) {
    throw new Error('Invalid menu label')
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new Error('Invalid menu item')
  }
  if (
    accelerator !== undefined &&
    !(MENU_ACCELERATORS as readonly unknown[]).includes(accelerator)
  ) {
    throw new Error('Invalid menu accelerator')
  }
  const item: ContextMenuItem = { label }
  if (enabled !== undefined) item.enabled = enabled
  if (accelerator !== undefined) item.accelerator = accelerator as string

  if (submenu !== undefined) {
    if (inSubmenu) throw new Error('Menus nest one level only')
    if (!Array.isArray(submenu) || submenu.length > MAX_MENU_ITEMS) {
      throw new Error('Invalid submenu')
    }
    item.submenu = submenu.map((entry) => readItem(entry, true, budget))

    return item
  }
  if (typeof id !== 'string' || id === '' || id.length > MAX_MENU_ID) {
    throw new Error('Invalid menu id')
  }
  item.id = id

  return item
}

/**
 * Checks a menu sent by the window and returns a clean copy of it, or throws. At most 40 items on
 * the top level and 80 in all, labels of at most 80 characters, ids of at most 100, one submenu
 * level, and nothing but the known fields.
 */
export function validateContextMenu(input: unknown): ContextMenuItem[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAX_MENU_ITEMS
  ) {
    throw new Error('Invalid menu')
  }
  const budget = { left: MAX_MENU_ITEMS * 2 }

  return input.map((entry) => readItem(entry, false, budget))
}

/** The point to open the menu at, or undefined for "at the pointer". Throws for anything else. */
export function validateMenuPoint(
  input: unknown
): ContextMenuPoint | undefined {
  if (input === undefined || input === null) return undefined
  if (
    !isRecord(input) ||
    typeof input.x !== 'number' ||
    typeof input.y !== 'number' ||
    !Number.isFinite(input.x) ||
    !Number.isFinite(input.y)
  ) {
    throw new Error('Invalid menu position')
  }

  return { x: Math.round(input.x), y: Math.round(input.y) }
}
