import {
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron'

import type { ContextMenuItem, ContextMenuPoint } from '../shared/context-menu'
import { setLauncherMenuOpen } from './window-manager'

// A choice made in the menu runs its handler first and the menu's "closed" callback after; a short
// wait before answering "nothing was chosen" keeps that order from ever mattering.
const CLOSE_GRACE_MS = 50

function toTemplate(
  items: ContextMenuItem[],
  choose: (id: string) => void
): MenuItemConstructorOptions[] {
  return items.map((item): MenuItemConstructorOptions => {
    if (item.type === 'separator') return { type: 'separator' }
    // A native menu reads a single & as the mnemonic marker; a name with one must show as typed.
    const label = (item.label ?? '').replace(/&/g, '&&')
    if (item.submenu) {
      return {
        label,
        ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
        submenu: toTemplate(item.submenu, choose),
      }
    }

    return {
      label,
      ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
      // Only shown beside the label: F2 and Delete are handled by the page, not by the menu.
      ...(item.accelerator
        ? { accelerator: item.accelerator, registerAccelerator: false }
        : {}),
      click: () => choose(item.id ?? ''),
    }
  })
}

/**
 * Pops a native menu up over `window` and answers with the id of the item chosen, or null when it
 * was dismissed. The menu has already been checked (shared/context-menu.ts). While it is open the
 * temporary panel does not fold away, as with the menu of the ball.
 */
export function showContextMenu(
  window: BrowserWindow,
  items: ContextMenuItem[],
  point?: ContextMenuPoint
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (id: string | null) => {
      if (settled) return
      settled = true
      resolve(id)
    }
    const menu = Menu.buildFromTemplate(toTemplate(items, finish))
    menu.on('menu-will-show', () => setLauncherMenuOpen(true))
    menu.on('menu-will-close', () => setLauncherMenuOpen(false))
    menu.popup({
      window,
      ...(point ? { x: point.x, y: point.y } : {}),
      callback: () => {
        setTimeout(() => finish(null), CLOSE_GRACE_MS)
      },
    })
  })
}
