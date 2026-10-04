import { app, globalShortcut } from 'electron'
import log from 'electron-log/main'

import {
  DEFAULT_SHORTCUT,
  formatAccelerator,
  normalizeAccelerator,
  validateAccelerator,
} from '../shared/accelerator'
import type { LaunchSettings, ShortcutCheckResult } from '../shared/types'
import { toggleMainWindow } from './window-manager'

export const LAUNCH_SHORTCUT = DEFAULT_SHORTCUT
// Windows stores the args in the Run entry and compares them when reading, so the read and the
// write must use exactly the same list or the switch can never report (or clear) the entry.
const LOGIN_ITEM_ARGS = ['--hidden']

/** What the user asked for (the prefs): a valid accelerator, and whether it is switched on. */
export interface ShortcutConfig {
  shortcut: string
  shortcutEnabled: boolean
}

let configured: { accelerator: string; enabled: boolean } = {
  accelerator: DEFAULT_SHORTCUT,
  enabled: true,
}
// The accelerator this app holds right now, or null. It is the configured one when it could be
// registered and nothing otherwise: there is no silent fallback to some other combination, because
// a combination the user did not choose would take that key away from every other program.
let registered: string | null = null
// Set by the start-up registration. Until then (and in the e2e runs, which never register) a
// change of the setting is only remembered, never given to the operating system.
let started = false
const listeners = new Set<() => void>()

function toggle(): void {
  void toggleMainWindow()
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** Called when the registration changes (the tray tooltip names the shortcut). Returns an unsubscribe. */
export function onLaunchShortcutChange(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function tryRegister(accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, toggle)
  } catch (error) {
    // Electron throws for an accelerator it cannot parse; the shared validation should have
    // caught that, so treat it as not available.
    log.warn('Launch shortcut could not be registered', accelerator, error)
    return false
  }
}

function release(accelerator: string): void {
  try {
    globalShortcut.unregister(accelerator)
  } catch (error) {
    log.warn('Launch shortcut could not be released', accelerator, error)
  }
}

function settle(config: ShortcutConfig): void {
  const accelerator = normalizeAccelerator(config.shortcut) ?? DEFAULT_SHORTCUT
  const enabled = config.shortcutEnabled !== false
  const wanted = enabled ? accelerator : null
  const before = registered
  configured = { accelerator, enabled }

  if (wanted === registered) return
  // Only this app's own previous registration is released, never everything.
  if (registered !== null) release(registered)
  registered = null
  if (wanted !== null) {
    if (tryRegister(wanted)) registered = wanted
    else log.warn('Launch shortcut is already in use', wanted)
  }
  if (registered !== before) notify()
}

/**
 * Registers the launch shortcut when the app starts, from the prefs. When another program holds the
 * combination the shortcut is simply unavailable: the settings say so and offer another one.
 */
export function registerLaunchShortcut(
  config: ShortcutConfig = {
    shortcut: DEFAULT_SHORTCUT,
    shortcutEnabled: true,
  }
): void {
  started = true
  settle(config)
}

/**
 * Follows a change of the setting (saved settings, an imported file): registers the new combination,
 * or lets go of the old one when the shortcut was switched off. The old registration is released
 * first and only that one, never everything the app registered. Does nothing before start-up.
 */
export function applyLaunchShortcut(config: ShortcutConfig): LaunchSettings {
  if (!started) {
    configured = {
      accelerator: normalizeAccelerator(config.shortcut) ?? DEFAULT_SHORTCUT,
      enabled: config.shortcutEnabled !== false,
    }
  } else {
    settle(config)
  }

  return getLaunchSettings()
}

/**
 * Tries again to register the configured shortcut when a program that had it has let go since. The
 * settings dialog asks when it opens, so closing the other program and looking at the settings is
 * enough.
 */
export function retryLaunchShortcut(): void {
  if (started && configured.enabled && registered === null) {
    settle({
      shortcut: configured.accelerator,
      shortcutEnabled: configured.enabled,
    })
  }
}

/**
 * Finds out whether a combination can be had right now: it is tried and let go at once. The one the
 * app holds already counts as available (it is the app's own).
 */
export function checkLaunchShortcut(input: unknown): ShortcutCheckResult {
  const check = validateAccelerator(input)
  if (!check.ok) return { status: 'invalid', problem: check.problem }
  if (check.accelerator === registered) return { status: 'current' }
  if (!tryRegister(check.accelerator)) return { status: 'taken' }
  release(check.accelerator)

  return { status: 'free' }
}

export function getLaunchSettings(): LaunchSettings {
  const canAutoStart = app.isPackaged && process.platform === 'win32'
  return {
    canAutoStart,
    openAtLogin: canAutoStart
      ? app.getLoginItemSettings({ args: LOGIN_ITEM_ARGS }).openAtLogin
      : false,
    shortcut: formatAccelerator(configured.accelerator),
    shortcutAvailable: registered !== null,
    shortcutAccelerator: configured.accelerator,
    shortcutEnabled: configured.enabled,
  }
}

export function setOpenAtLogin(enabled: boolean): LaunchSettings {
  if (typeof enabled !== 'boolean') throw new Error('Invalid login setting')
  if (!getLaunchSettings().canAutoStart) {
    throw new Error('Auto start is available in the installed Windows app')
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: LOGIN_ITEM_ARGS })
  return getLaunchSettings()
}
