import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { createDefaultAppData } from '../src/shared/default-data'
import { closeApp, launchApp, type AppContext } from './test-utils'

type Shown = Array<{ role?: string; label: string; enabled: boolean }>

// A native menu cannot be seen from the page, so the popup is recorded in the main process instead
// of drawn: the right click, Chromium's own context-menu event and the menu we build are all real.
async function recordMenus(context: AppContext): Promise<void> {
  await context.electronApp.evaluate(({ Menu }) => {
    const shown: Shown[] = []
    ;(globalThis as { __menus?: Shown[] }).__menus = shown
    Menu.prototype.popup = function () {
      shown.push(
        this.items
          .filter((item) => item.type !== 'separator')
          .map((item) => ({
            role: item.role as string | undefined,
            label: item.label,
            enabled: item.enabled,
          })) as Shown
      )
      this.emit('menu-will-show', {})
      this.emit('menu-will-close', {})
    }
  })
}

const menus = (context: AppContext) =>
  context.electronApp.evaluate(
    () => (globalThis as { __menus?: Shown[] }).__menus ?? []
  )

async function setClipboard(context: AppContext, text: string): Promise<void> {
  await context.electronApp.evaluate(({ clipboard }, value) => {
    clipboard.writeText(value)
  }, text)
}

async function launchIn(lang: 'zh' | 'en' | 'ja') {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-menu-'))
  const data = createDefaultAppData()
  data.prefs.lang = lang
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  return launchApp(userDataDir)
}

test('right-clicking text in a field offers cut, copy, paste and select all in the interface language', async () => {
  for (const [lang, words] of [
    ['zh', ['剪切', '复制', '粘贴', '全选']],
    ['en', ['Cut', 'Copy', 'Paste', 'Select all']],
    ['ja', ['切り取り', 'コピー', '貼り付け', 'すべて選択']],
  ] as const) {
    const context = await launchIn(lang)
    try {
      const { page } = context
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await recordMenus(context)
      await setClipboard(context, 'from the clipboard')
      await page.getByTestId('tab-notes').click()
      await page.getByTestId('add-loose-item-notes').click()
      const field = page.getByTestId('item-name-input')
      await field.fill('A name to select')
      await field.selectText()

      await field.click({ button: 'right' })

      await expect.poll(async () => (await menus(context)).length).toBe(1)
      const [menu] = await menus(context)
      expect(menu!.map((item) => item.label)).toEqual(words)
      expect(menu!.map((item) => item.role)).toEqual([
        'cut',
        'copy',
        'paste',
        'selectall',
      ])
      // Something is selected and the clipboard holds text: all four work.
      expect(menu!.every((item) => item.enabled)).toBe(true)
    } finally {
      await closeApp(context)
    }
  }
})

test('the entries follow what the field can do right now', async () => {
  const context = await launchIn('en')
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await recordMenus(context)
    await setClipboard(context, '')
    await page.getByTestId('tab-notes').click()
    await page.getByTestId('add-loose-item-notes').click()

    // Empty field, empty clipboard: nothing to cut, copy or paste.
    await page.getByTestId('item-name-input').click({ button: 'right' })
    await expect.poll(async () => (await menus(context)).length).toBe(1)
    const enabled = (await menus(context))[0]!.map((item) => [
      item.label,
      item.enabled,
    ])
    expect(enabled).toEqual([
      ['Cut', false],
      ['Copy', false],
      ['Paste', false],
      ['Select all', false],
    ])

    // A password field never lets its contents be cut or copied out.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    await page.getByTestId('tab-passwords').click()
    await page.getByTestId('add-loose-item-passwords').click()
    const secret = page.getByTestId('item-password-input')
    await secret.fill('hunter2')
    await secret.selectText()
    await secret.click({ button: 'right' })
    await expect.poll(async () => (await menus(context)).length).toBe(2)
    const [cut, copy] = (await menus(context))[1]!
    expect(cut!.enabled).toBe(false)
    expect(copy!.enabled).toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('on text that cannot be edited there is no menu, except Copy while some is selected', async () => {
  const context = await launchIn('en')
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await recordMenus(context)
    // Most of the window is not selectable text; the message strip is. Paste a link to get one.
    await setClipboard(context, 'https://example.org')
    await page.keyboard.press('Control+v')
    const message = page.locator('.feedback-text')
    await expect(message).toContainText('Added')

    // Nothing selected, and a place with no text at all: nothing appears.
    await page.getByTestId('tab-tasks').click({ button: 'right' })
    await page.waitForTimeout(400)
    expect(await menus(context)).toHaveLength(0)

    // Some text selected: a plain Copy.
    await message.selectText()
    await message.click({ button: 'right' })
    await expect.poll(async () => (await menus(context)).length).toBe(1)
    expect((await menus(context))[0]!.map((item) => item.label)).toEqual([
      'Copy',
    ])
  } finally {
    await closeApp(context)
  }
})
