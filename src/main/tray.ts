import path from 'node:path'
import fs from 'node:fs'

import { app, Tray, nativeImage } from 'electron'
import log from 'electron-log/main'

import { loadAppData, updateWindowData } from './data-store'
import { getLaunchSettings, onLaunchShortcutChange } from './launch-settings'
import { createLauncherMenu } from './launcher-menu'
import { getTrayHintText } from './tray-hint'
import { setLauncherMenuOpen, showMainWindow } from './window-manager'

let tray: Tray | null = null

function loadTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createEmpty()
  for (const size of [16, 20, 24, 32, 40, 48]) {
    const filePath = path.join(
      app.getAppPath(),
      'resources',
      'icons',
      `marubako-${size}.png`
    )
    if (fs.existsSync(filePath))
      icon.addRepresentation({
        scaleFactor: size / 16,
        dataURL: `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`,
      })
  }
  return icon.isEmpty()
    ? nativeImage.createFromPath(
        path.join(app.getAppPath(), 'resources', 'icons', 'icon.ico')
      )
    : icon
}

/** The launch shortcut's label, or null when no shortcut could be registered and it does nothing. */
function getAvailableShortcut(): string | null {
  const { shortcut, shortcutAvailable } = getLaunchSettings()
  return shortcutAvailable ? shortcut : null
}

function trayTooltip(): string {
  const shortcut = getAvailableShortcut()

  return shortcut ? `Marubako · ${shortcut}` : 'Marubako'
}

export async function createTray(): Promise<Tray> {
  const icon = loadTrayIcon()
  log.info('Tray icon loaded', {
    size: icon.getSize(),
    scales: icon.getScaleFactors(),
  })
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip(trayTooltip())
  // The tooltip names the shortcut that works: it follows a change in the settings.
  onLaunchShortcutChange(() => {
    if (tray && !tray.isDestroyed()) tray.setToolTip(trayTooltip())
  })
  tray.on('click', () => void showMainWindow())
  tray.setContextMenu(
    await createLauncherMenu(showMainWindow, setLauncherMenuOpen)
  )
  return tray
}

export function getTray(): Tray | null {
  return tray
}

/**
 * Gives the tray icon the menu in the language that is saved now. The tray keeps the menu it was
 * handed, so after a change of language (a save in the settings, an import) it has to be given the
 * new one. Without a tray (the e2e runs have none) there is nothing to do.
 */
export async function refreshTrayMenu(): Promise<void> {
  if (!tray) return
  const menu = await createLauncherMenu(showMainWindow, setLauncherMenuOpen)
  if (tray && !tray.isDestroyed()) tray.setContextMenu(menu)
}

/** Tells the user, once, that the launcher went to the tray and how to bring it back. */
export async function showTrayHint(): Promise<void> {
  if (!tray) return
  const { prefs, window } = await loadAppData()
  if (window.trayHintShown) return
  tray.displayBalloon({
    title: 'Marubako',
    content: getTrayHintText(prefs.lang, getAvailableShortcut()),
  })
  await updateWindowData((state) => ({ ...state, trayHintShown: true }))
}
