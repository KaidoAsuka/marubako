// Iteration 5, package "safety" (i18n-copy-2, collection-ui-4, flow-3, extra-3): an entry that would
// not open is explained in the window's language, stays long enough to act on and offers "Edit",
// which lands in the broken field; a pasted path with quotes or variables saves clean and opens.
import os from 'node:os'
import path from 'node:path'

import { test, expect, type Page } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

const MISSING_DIR = path.join(
  os.tmpdir(),
  `marubako-e2e-missing-${process.pid}`
)
const MISSING_FOLDER = path.join(MISSING_DIR, 'Designs')
const MISSING_APP = path.join(MISSING_DIR, 'editor.exe')

async function seedBrokenEntries(
  page: Page,
  lang: 'zh' | 'en' | 'ja'
): Promise<void> {
  const saved = await page.evaluate(
    async ({ lang, folder, app }) => {
      const loaded = await window.quickLaunch.loadData()
      if (!loaded.ok) return false
      const data = loaded.data
      data.prefs.lang = lang
      data.loose.folders = [
        {
          id: 'broken-folder',
          kind: 'folder',
          name: 'Designs',
          icon: '📁',
          path: folder,
        },
      ]
      data.loose.websites = [
        {
          id: 'broken-site',
          kind: 'website',
          name: 'Docs',
          icon: '🌐',
          url: 'ftp://docs.example.com',
        },
      ]
      data.loose.apps = [
        {
          id: 'broken-app',
          kind: 'app',
          name: 'Editor',
          icon: '🛠',
          path: app,
        },
      ]
      return (await window.quickLaunch.saveData(data)).ok
    },
    { lang, folder: MISSING_FOLDER, app: MISSING_APP }
  )
  expect(saved).toBe(true)
  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
}

const strip = (page: Page) => page.getByTestId('feedback-strip')

test('a folder that is gone is explained in Chinese, stays, and Edit lands on its path', async () => {
  const context = await launchApp()
  const { page } = context

  try {
    await seedBrokenEntries(page, 'zh')

    await page.getByTestId('loose-widget-broken-folder').click()

    await expect(strip(page)).toHaveAttribute('data-kind', 'danger')
    await expect(strip(page)).toHaveAttribute('data-open', 'true')
    await expect(strip(page)).toContainText('找不到「Designs」')
    // Not the raw English error of the main process, and not the path either.
    await expect(strip(page)).not.toContainText('ENOENT')
    await expect(strip(page)).not.toContainText('no such file')
    await expect(page.getByTestId('feedback-action')).toHaveText('编辑')

    // It outlasts the old two seconds, and the five of a plain error, by a good margin.
    await page.waitForTimeout(6500)
    await expect(strip(page)).toHaveAttribute('data-open', 'true')

    await page.getByTestId('feedback-action').click()
    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('item-path-input')).toBeFocused()
    await expect(page.getByTestId('item-path-input')).toHaveValue(
      MISSING_FOLDER
    )
    // The text is selected, so that typing or pasting replaces the broken path.
    expect(
      await page
        .getByTestId('item-path-input')
        .evaluate(
          (input: HTMLInputElement) =>
            input.selectionStart === 0 &&
            input.selectionEnd === input.value.length
        )
    ).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a website with an invalid address and a program that is gone each get their own words and field', async () => {
  const context = await launchApp()
  const { page } = context

  try {
    await seedBrokenEntries(page, 'zh')

    await page.getByTestId('tab-websites').click()
    await page.getByTestId('loose-widget-broken-site').click()
    await expect(strip(page)).toContainText('「Docs」的网址无效')
    await page.getByTestId('feedback-action').click()
    await expect(page.getByTestId('item-url-input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    await page.getByTestId('tab-apps').click()
    await page.getByTestId('loose-widget-broken-app').click()
    await expect(strip(page)).toContainText('找不到程序「Editor」')
    await page.getByTestId('feedback-action').click()
    await expect(page.getByTestId('item-path-input')).toBeFocused()
  } finally {
    await closeApp(context)
  }
})

for (const [lang, message, edit] of [
  ['en', 'Can’t find “Designs”', 'Edit'],
  ['ja', '「Designs」が見つかりません', '編集'],
] as const) {
  test(`the same failure is said in ${lang}`, async () => {
    const context = await launchApp()
    const { page } = context

    try {
      await seedBrokenEntries(page, lang)

      await page.getByTestId('loose-widget-broken-folder').click()

      await expect(strip(page)).toContainText(message)
      await expect(strip(page)).not.toContainText('ENOENT')
      await expect(page.getByTestId('feedback-action')).toHaveText(edit)
    } finally {
      await closeApp(context)
    }
  })
}

test('a pasted path with quotes, spaces and a variable is saved clean and opens expanded', async () => {
  const context = await launchApp()
  const { page, electronApp } = context

  try {
    // Do not start a real Explorer window: record what the main process would have opened.
    await electronApp.evaluate(({ shell }) => {
      const record: string[] = []
      ;(globalThis as unknown as { __opened: string[] }).__opened = record
      shell.openPath = async (target: string) => {
        record.push(target)
        return ''
      }
    })
    const systemRoot = await electronApp.evaluate(
      () => process.env['SystemRoot'] ?? ''
    )
    expect(systemRoot).not.toBe('')

    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('item-name-input').fill('System tools')
    const field = page.getByTestId('item-path-input')
    await field.fill('  "%SystemRoot%\\System32"  ')
    await expect(field).toHaveValue('  "%SystemRoot%\\System32"  ')

    // Leaving the field shows what will be saved.
    await page.getByTestId('item-name-input').click()
    await expect(field).toHaveValue('%SystemRoot%\\System32')

    await page.getByTestId('item-save').click()
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    const saved = await page.evaluate(() => window.quickLaunch.loadData())
    expect(
      saved.ok &&
        saved.data.loose.folders.find((item) => item.name === 'System tools')
          ?.path
    ).toBe('%SystemRoot%\\System32')

    await page
      .locator('[data-testid^="loose-widget-"]', { hasText: 'System tools' })
      .click()

    await expect
      .poll(() =>
        electronApp.evaluate(
          () => (globalThis as unknown as { __opened: string[] }).__opened
        )
      )
      .toEqual([`${systemRoot}\\System32`])
    // The strip may still show the "added" message with its Undo; what must not be there is a failure.
    await expect(strip(page)).not.toHaveAttribute('data-kind', 'danger')
    await expect(strip(page)).not.toHaveAttribute('data-kind', 'error')
  } finally {
    await closeApp(context)
  }
})
