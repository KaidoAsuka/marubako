import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron'

import type { Lang } from '../shared/types'
import { getCachedLang } from './data-store'

type EditLabels = {
  cut: string
  copy: string
  paste: string
  selectAll: string
}

// The wording of the system's own edit menu, in the three languages of the interface.
const LABELS: Record<Lang, EditLabels> = {
  zh: { cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选' },
  en: { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all' },
  ja: {
    cut: '切り取り',
    copy: 'コピー',
    paste: '貼り付け',
    selectAll: 'すべて選択',
  },
}

/** The part of Electron's context-menu parameters the menu is built from. */
export type EditMenuParams = {
  isEditable: boolean
  selectionText: string
  editFlags: {
    canCut: boolean
    canCopy: boolean
    canPaste: boolean
    canSelectAll: boolean
  }
}

/** The language of the interface, or of the system until the data has been read. */
function menuLanguage(): Lang {
  const known = getCachedLang()
  if (known) return known
  const locale = app.getLocale().toLowerCase()
  return locale.startsWith('zh') ? 'zh' : locale.startsWith('ja') ? 'ja' : 'en'
}

/**
 * What a right click on text offers. In a field that can be edited: cut, copy, paste and select
 * all, each enabled only when the field can do it right now (a password field cannot be copied
 * from, an empty clipboard cannot be pasted). On text that cannot be edited: a plain Copy, and
 * only while some of it is selected. Anywhere else: nothing, so no empty menu appears.
 */
export function buildEditMenuTemplate(
  params: EditMenuParams,
  lang: Lang
): MenuItemConstructorOptions[] {
  const labels = LABELS[lang]
  const { editFlags } = params

  if (params.isEditable) {
    return [
      { role: 'cut', label: labels.cut, enabled: editFlags.canCut },
      { role: 'copy', label: labels.copy, enabled: editFlags.canCopy },
      { role: 'paste', label: labels.paste, enabled: editFlags.canPaste },
      { type: 'separator' },
      {
        role: 'selectAll',
        label: labels.selectAll,
        enabled: editFlags.canSelectAll,
      },
    ]
  }

  if (params.selectionText.trim() && editFlags.canCopy) {
    return [{ role: 'copy', label: labels.copy }]
  }

  return []
}

/**
 * Gives a window the right-click menu its text fields lack (Electron has none by default). While
 * the menu is open `menuVisible` is told, so a panel that folds away when the pointer leaves it
 * does not do so under a menu that reaches past its edge.
 */
export function attachEditMenu(
  webContents: WebContents,
  menuVisible: (visible: boolean) => void
): void {
  webContents.on('context-menu', (_event, params) => {
    const template = buildEditMenuTemplate(params, menuLanguage())
    if (template.length === 0) return

    const menu = Menu.buildFromTemplate(template)
    menu.on('menu-will-show', () => menuVisible(true))
    menu.on('menu-will-close', () => menuVisible(false))
    const window = BrowserWindow.fromWebContents(webContents)
    // With a window given, popup() takes coordinates relative to its content, which is what the
    // context-menu parameters carry.
    menu.popup({
      ...(window ? { window } : {}),
      x: params.x,
      y: params.y,
      sourceType: params.menuSourceType,
    })
  })
}
