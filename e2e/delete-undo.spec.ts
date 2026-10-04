import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createDefaultAppData } from '../src/shared/default-data'
import type { FolderItem } from '../src/shared/types'
import { closeApp, launchApp } from './test-utils'

function folder(id: string, name: string): FolderItem {
  return { id, kind: 'folder', name, icon: '📁', path: `C:\\Work\\${name}` }
}

/** Folders tab: loose Alpha, group Docs (3 items), loose Bravo, loose Charlie, empty group. */
async function launchWithFolders() {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-delete-undo-')
  )
  const data = createDefaultAppData()
  data.folders = [
    {
      id: 'grp-docs',
      name: 'Docs',
      icon: '📚',
      open: true,
      items: [
        folder('doc-1', 'Doc one'),
        folder('doc-2', 'Doc two'),
        folder('doc-3', 'Doc three'),
      ],
    },
    { id: 'grp-empty', name: 'Nothing', icon: '📂', open: true, items: [] },
  ]
  data.loose.folders = [
    folder('loose-a', 'Alpha'),
    folder('loose-b', 'Bravo'),
    folder('loose-c', 'Charlie'),
  ]
  data.topOrder.folders = [
    { type: 'loose', id: 'loose-a' },
    { type: 'group', id: 'grp-docs' },
    { type: 'loose', id: 'loose-b' },
    { type: 'loose', id: 'loose-c' },
    { type: 'group', id: 'grp-empty' },
  ]
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  return launchApp(userDataDir)
}

const topIds = (page: Page) =>
  page
    .locator('[data-top-entry-id]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-top-entry-id'))
    )

const savedFolders = (page: Page) =>
  page.evaluate(async () => {
    const result = await globalThis.quickLaunch.loadData()
    if (!result.ok) throw new Error(result.error)
    return {
      loose: result.data.loose.folders.map((item) => item.id),
      groups: result.data.folders.map((group) => group.id),
      docs: result.data.folders
        .find((group) => group.id === 'grp-docs')
        ?.items.map((item) => item.id),
      order: result.data.topOrder.folders.map(
        (entry) => `${entry.type}:${entry.id}`
      ),
    }
  })

const ORIGINAL_ORDER = [
  'loose-a',
  'grp-docs',
  'loose-b',
  'loose-c',
  'grp-empty',
]
const ORIGINAL_SAVED_ORDER = [
  'loose:loose-a',
  'group:grp-docs',
  'loose:loose-b',
  'loose:loose-c',
  'group:grp-empty',
]

test('a deleted grid item is gone at once and the strip button puts it back in place', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await topIds(page)).toEqual(ORIGINAL_ORDER)

    const bravo = page.getByTestId('loose-widget-loose-b')
    await bravo.hover()
    await bravo.getByRole('button', { name: '删除' }).click()

    // One click: no confirmation, the data is changed and saved straight away.
    await expect(page.getByTestId('confirm-submit')).toHaveCount(0)
    await expect(bravo).toHaveCount(0)
    expect(await topIds(page)).toEqual([
      'loose-a',
      'grp-docs',
      'loose-c',
      'grp-empty',
    ])
    const strip = page.locator('.feedback-strip[data-open]')
    await expect(strip).toContainText('已删除「Bravo」')
    expect((await savedFolders(page)).loose).toEqual(['loose-a', 'loose-c'])

    // A real click on the button in the strip at the bottom of the window.
    await strip.getByRole('button', { name: '撤销' }).click()

    await expect(bravo).toBeVisible()
    expect(await topIds(page)).toEqual(ORIGINAL_ORDER)
    const saved = await savedFolders(page)
    expect(saved.loose).toEqual(['loose-a', 'loose-b', 'loose-c'])
    expect(saved.order).toEqual(ORIGINAL_SAVED_ORDER)
    await expect(page.locator('.feedback-strip[data-open]')).toContainText(
      '已恢复「Bravo」'
    )
  } finally {
    await closeApp(context)
  }
})

test('a folder with items asks once, naming it, and Ctrl+Z brings it back with its items', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const docs = page.getByTestId('folder-widget-grp-docs')

    await docs.hover()
    await docs.getByRole('button', { name: '删除' }).click()
    await expect(page.locator('.modal-confirm p')).toHaveText(
      '删除分组「Docs」及其中 3 个条目？'
    )
    await page.getByTestId('confirm-cancel').click()
    await expect(docs).toBeVisible()
    expect((await savedFolders(page)).groups).toEqual(['grp-docs', 'grp-empty'])

    await docs.hover()
    await docs.getByRole('button', { name: '删除' }).click()
    await page.getByTestId('confirm-submit').click()
    await expect(docs).toHaveCount(0)
    await expect(page.locator('.feedback-strip[data-open]')).toContainText(
      '已删除「Docs」'
    )
    expect((await savedFolders(page)).groups).toEqual(['grp-empty'])

    // Focus is on the page, not in a field, and nothing is open: Ctrl+Z is the undo.
    await page.keyboard.press('Control+z')

    await expect(docs).toBeVisible()
    expect(await topIds(page)).toEqual(ORIGINAL_ORDER)
    const saved = await savedFolders(page)
    expect(saved.groups).toEqual(['grp-docs', 'grp-empty'])
    expect(saved.docs).toEqual(['doc-1', 'doc-2', 'doc-3'])

    // Nothing is left to undo.
    await page.keyboard.press('Control+z')
    expect(await topIds(page)).toEqual(ORIGINAL_ORDER)
  } finally {
    await closeApp(context)
  }
})

test('an empty folder is deleted without asking', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const empty = page.getByTestId('folder-widget-grp-empty')

    await empty.hover()
    await empty.getByRole('button', { name: '删除' }).click()

    await expect(page.getByTestId('confirm-submit')).toHaveCount(0)
    await expect(empty).toHaveCount(0)
    await page
      .locator('.feedback-strip[data-open]')
      .getByRole('button', { name: '撤销' })
      .click()
    await expect(empty).toBeVisible()
    expect(await topIds(page)).toEqual(ORIGINAL_ORDER)
  } finally {
    await closeApp(context)
  }
})

test('an item deleted inside an opened folder returns to the same index', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('folder-widget-grp-docs').click()
    await expect(page.getByTestId('grid-item-doc-2')).toBeVisible()

    // The buttons on a card answer once the pointer rests on it.
    await page.getByTestId('grid-item-doc-2').hover()
    await page.getByTestId('delete-item-doc-2').click()

    await expect(page.getByTestId('confirm-submit')).toHaveCount(0)
    await expect(page.getByTestId('grid-item-doc-2')).toHaveCount(0)
    expect((await savedFolders(page)).docs).toEqual(['doc-1', 'doc-3'])

    await page
      .locator('.feedback-strip[data-open]')
      .getByRole('button', { name: '撤销' })
      .click()

    await expect(page.getByTestId('grid-item-doc-2')).toBeVisible()
    expect((await savedFolders(page)).docs).toEqual(['doc-1', 'doc-2', 'doc-3'])
    const order = await page
      .locator('[data-popup-item-id]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-popup-item-id'))
      )
    expect(order).toEqual(['doc-1', 'doc-2', 'doc-3'])
  } finally {
    await closeApp(context)
  }
})

test('the undo strip waits while the pointer is on it and goes two seconds after it leaves', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('loose-widget-loose-a').hover()
    await page
      .getByTestId('loose-widget-loose-a')
      .getByRole('button', { name: '删除' })
      .click()
    const strip = page.locator('.feedback-strip[data-open]')
    await expect(strip).toBeVisible()

    await strip.hover()
    // Longer than the six seconds an untouched undo message lives.
    await page.waitForTimeout(7000)
    await expect(strip).toBeVisible()

    await page.mouse.move(10, 10)
    await page.waitForTimeout(800)
    await expect(strip).toBeVisible()
    await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0, {
      timeout: 4000,
    })
    // The record outlives the message: Ctrl+Z still restores it.
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('loose-widget-loose-a')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})
