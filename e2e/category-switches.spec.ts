// Iteration 5 (package "settings"): every category can be shown or hidden in the settings. Hiding only
// hides: the tab, the global search, Alt+number and the add targets follow, the data is never touched,
// and showing the category again brings everything back.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

import { closeApp, launchApp, type AppContext } from './test-utils'

const TABS = [
  'folders',
  'websites',
  'apps',
  'passwords',
  'commands',
  'notes',
  'tasks',
] as const

async function openCategories(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click()
  await page.getByTestId('settings-tab-appearance').click()
}

/** Switches categories on or off in the settings dialog and saves. */
async function setShown(
  page: Page,
  changes: Partial<Record<(typeof TABS)[number], boolean>>
): Promise<void> {
  await openCategories(page)
  for (const [tab, shown] of Object.entries(changes)) {
    const toggle = page.getByTestId(`show-tab-${tab}`)
    if (shown) await toggle.check()
    else await toggle.uncheck()
  }
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('modal-card')).toHaveCount(0)
}

const searchHits = async (page: Page, query: string): Promise<number> => {
  await page.keyboard.press('Control+k')
  await page.getByTestId('command-input').fill(query)
  // The result list settles on the next frame; read it after a beat rather than mid-filter.
  await page.waitForTimeout(150)
  const count = await page.getByRole('option').count()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)

  return count
}

const currentTab = (page: Page) =>
  page.getByTestId('app-root').getAttribute('data-current-tab')

async function savedData(context: AppContext) {
  const raw = JSON.parse(
    await fs.readFile(
      path.join(context.userDataDir, 'quicklaunch-data.json'),
      'utf8'
    )
  )

  return raw.data ?? raw
}

test('shows all seven categories by default, with a switch for each in the settings', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    for (const tab of TABS)
      await expect(page.getByTestId(`tab-${tab}`)).toBeVisible()

    await openCategories(page)
    for (const tab of TABS)
      await expect(page.getByTestId(`show-tab-${tab}`)).toBeChecked()
    // The explanation travels with the switches.
    await expect(page.getByTestId('modal-card')).toContainText(
      '隐藏不会删除数据'
    )
  } finally {
    await closeApp(context)
  }
})

test('hides a category from the tabs, the search and Alt+number, keeps its data across a restart, and shows it again with everything in place', async () => {
  const first = await launchApp()
  const { userDataDir } = first
  try {
    const { page } = first
    // The starter note is found by its name before anything is hidden.
    expect(await searchHits(page, '使用说明')).toBe(1)

    await setShown(page, { notes: false })

    await expect(page.getByTestId('tab-notes')).toHaveCount(0)
    await expect(page.locator('.tab-button')).toHaveCount(6)
    expect(await searchHits(page, '使用说明')).toBe(0)
    // Even the group that holds it is gone from the search.
    expect(await searchHits(page, '备忘')).toBe(0)

    // Alt+number counts the categories that are shown: the sixth is now the task page.
    await page.getByTestId('tab-folders').click()
    await page.keyboard.press('Alt+6')
    await expect(page.getByTestId('app-root')).toHaveAttribute(
      'data-current-tab',
      'tasks'
    )
    await expect(page.getByTestId('tab-tasks')).toHaveAttribute(
      'aria-label',
      /Alt\+6/
    )
    // There is no seventh any more: the key does nothing.
    await page.keyboard.press('Alt+7')
    await expect(page.getByTestId('app-root')).toHaveAttribute(
      'data-current-tab',
      'tasks'
    )
  } finally {
    await closeApp(first, { cleanup: false })
  }

  // The data is on disk, untouched, and the setting too.
  const stored = await savedData(first)
  expect(stored.prefs.hiddenTabs).toEqual(['notes'])
  expect(stored.notes[0].items[0].id).toBe('note-usage')

  const second = await launchApp(userDataDir)
  try {
    const { page } = second
    await expect(page.getByTestId('tab-notes')).toHaveCount(0)
    await expect(page.locator('.tab-button')).toHaveCount(6)
    expect(await searchHits(page, '使用说明')).toBe(0)

    await setShown(page, { notes: true })

    await expect(page.getByTestId('tab-notes')).toBeVisible()
    expect(await searchHits(page, '使用说明')).toBe(1)
    await page.getByTestId('tab-notes').click()
    await expect(page.getByTestId('section-notes')).toContainText('使用说明')
    // Back in its old place: the sixth tab again.
    await page.getByTestId('tab-folders').click()
    await page.keyboard.press('Alt+6')
    await expect(page.getByTestId('app-root')).toHaveAttribute(
      'data-current-tab',
      'notes'
    )
  } finally {
    await closeApp(second)
  }
})

test('hiding the category being looked at moves to the first one that is shown', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.getByTestId('tab-notes').click()
    expect(await currentTab(page)).toBe('notes')

    await setShown(page, { notes: false })

    expect(await currentTab(page)).toBe('folders')
    await expect(page.getByTestId('section-folders')).toBeVisible()

    // Hiding the first category too: the next one that is shown takes over at the start.
    await setShown(page, { folders: false })
    expect(await currentTab(page)).toBe('websites')
    await expect(page.getByTestId('tab-folders')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('starts on the first category that is shown after a restart', async () => {
  const first = await launchApp()
  const { userDataDir } = first
  try {
    await setShown(first.page, { folders: false, websites: false })
    expect(await currentTab(first.page)).toBe('apps')
  } finally {
    await closeApp(first, { cleanup: false })
  }

  const second = await launchApp(userDataDir)
  try {
    expect(await currentTab(second.page)).toBe('apps')
    await expect(second.page.getByTestId('section-apps')).toBeVisible()
  } finally {
    await closeApp(second)
  }
})

test('adds to the category being shown, and never offers a hidden one', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await setShown(page, { folders: false })
    await expect(page.getByTestId('add-loose-item-folders')).toHaveCount(0)

    await page.keyboard.press('Control+n')
    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('modal-card')).toContainText('网站')
  } finally {
    await closeApp(context)
  }
})

test('keeps one category on: the last switch cannot be turned off', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await openCategories(page)
    for (const tab of TABS.slice(0, 6))
      await page.getByTestId(`show-tab-${tab}`).uncheck()

    await expect(page.getByTestId('show-tab-tasks')).toBeChecked()
    await expect(page.getByTestId('show-tab-tasks')).toBeDisabled()
    await expect(page.getByTestId('modal-card')).toContainText(
      '至少保留一个分类'
    )
    await page.getByTestId('settings-save').click()

    await expect(page.locator('.tab-button')).toHaveCount(1)
    await expect(page.getByTestId('tab-tasks')).toBeVisible()
    expect(await currentTab(page)).toBe('tasks')
  } finally {
    await closeApp(context)
  }
})

test('shows the setting in English and Japanese', async () => {
  for (const [lang, heading] of [
    ['en', 'Categories shown'],
    ['ja', '表示するカテゴリ'],
  ] as const) {
    const context = await launchApp()
    try {
      const { page } = context
      await page.getByTestId('open-settings').click()
      await page.getByTestId('settings-tab-data').click()
      await page.locator('#settings-language').selectOption(lang)
      await page.getByTestId('settings-save').click()
      await page.getByTestId('open-settings').click()
      await page.getByTestId('settings-tab-appearance').click()
      await expect(page.getByRole('group', { name: heading })).toBeVisible()
    } finally {
      await closeApp(context)
    }
  }
})
