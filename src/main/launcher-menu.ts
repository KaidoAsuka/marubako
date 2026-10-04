import { app, Menu } from 'electron'
import log from 'electron-log/main'

import type { Lang } from '../shared/types'
import { loadAppData } from './data-store'
import { mainStrings } from './main-strings'

/** The menu that was built, and the language it was built in. */
let launcherMenu: { menu: Menu; lang: Lang } | null = null

/**
 * The menu of the tray icon and of the floating ball: "Open" and "Quit". Native menu items copy
 * their label when they are inserted and cannot be renamed afterwards, so a change of language is
 * answered with a new menu, not a new label. The ball asks for the menu each time it is right-
 * clicked, so it always gets the current one; the tray keeps hold of the one it was given, and has
 * to be handed the new one (refreshTrayMenu).
 */
export async function createLauncherMenu(
  open: () => Promise<void>,
  visibilityChanged: (visible: boolean) => void
): Promise<Menu> {
  const { prefs } = await loadAppData()
  if (launcherMenu && launcherMenu.lang === prefs.lang) return launcherMenu.menu

  const text = mainStrings[prefs.lang]
  const menu = Menu.buildFromTemplate([
    {
      id: 'open',
      label: text.launcherMenuOpen,
      click: () =>
        void open().catch((error) =>
          log.warn('Could not open launcher', error)
        ),
    },
    { type: 'separator' },
    { id: 'quit', label: text.launcherMenuQuit, click: () => app.quit() },
  ])
  menu.on('menu-will-show', () => visibilityChanged(true))
  menu.on('menu-will-close', () => visibilityChanged(false))
  launcherMenu = { menu, lang: prefs.lang }
  return menu
}
