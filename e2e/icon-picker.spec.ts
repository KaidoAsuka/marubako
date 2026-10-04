import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { createDefaultAppData } from '../src/shared/default-data'
import { closeApp, launchApp } from './test-utils'

async function savedIcons(userDataDir: string): Promise<string[]> {
  const file = JSON.parse(
    await fs.readFile(path.join(userDataDir, 'quicklaunch-data.json'), 'utf8')
  )
  const data = file.data ?? file
  return [
    ...data.folders.map((group: { icon: string }) => group.icon),
    ...data.loose.folders.map((item: { icon: string }) => item.icon),
    ...data.folders.flatMap((group: { items: Array<{ icon: string }> }) =>
      group.items.map((item) => item.icon)
    ),
  ]
}

test('picks a colour and a glyph from the picker and shows it on the card', async () => {
  const context = await launchApp()

  try {
    const { page } = context
    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('item-name-input').fill('Tile folder')
    await page.getByTestId('item-path-input').fill('C:\\Tile')

    await page.getByTestId('icon-picker-trigger').click()
    const picker = page.getByTestId('icon-picker')
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('radio')).toHaveCount(12)
    await expect(picker.locator('[data-glyph]')).toHaveCount(150)

    // Searching 文件夹 narrows the list to the folder glyphs.
    await page.getByTestId('icon-search').fill('文件夹')
    await expect(picker.locator('[data-glyph="folder"]')).toBeVisible()
    await expect(picker.locator('[data-glyph="rocket-launch"]')).toHaveCount(0)

    await page.getByTestId('icon-color-3').click()
    await picker.locator('[data-glyph="folder"]').click()

    await expect(picker).toHaveCount(0)
    // The form is still open and the trigger previews the choice.
    await expect(page.getByTestId('item-name-input')).toHaveValue('Tile folder')
    await expect(
      page.getByTestId('icon-picker-trigger').locator('.entry-tile')
    ).toHaveAttribute('data-tile-glyph', 'folder')

    await page.getByTestId('item-save').click()
    const card = page.locator(
      '.loose-icon-source .entry-tile, .item-icon .entry-tile'
    )
    await expect(card.first()).toHaveAttribute('data-tile-glyph', 'folder')
    await expect(card.first()).toHaveAttribute('data-tile-color', '3')

    await expect
      .poll(async () =>
        (await savedIcons(context.userDataDir)).includes('tile:folder:3')
      )
      .toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('typing an emoji by hand still works and is stored as typed', async () => {
  const context = await launchApp()

  try {
    const { page } = context
    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('item-name-input').fill('Emoji folder')
    await page.getByTestId('item-path-input').fill('C:\\Emoji')

    await page.getByTestId('icon-picker-trigger').click()
    await page.getByTestId('icon-custom').fill('🧪')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('icon-picker')).toHaveCount(0)
    await expect(
      page.getByTestId('icon-picker-trigger').locator('.emoji-picker-preview')
    ).toHaveText('🧪')

    await page.getByTestId('item-save').click()
    await expect
      .poll(async () => (await savedIcons(context.userDataDir)).includes('🧪'))
      .toBe(true)
    await expect(
      page
        .locator('.loose-icon-source span, .item-icon span')
        .filter({ hasText: '🧪' })
        .first()
    ).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('works from the keyboard alone and keeps focus inside the picker', async () => {
  const context = await launchApp()

  try {
    const { page } = context
    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('item-name-input').fill('Keyboard folder')
    await page.getByTestId('item-path-input').fill('C:\\Keys')

    const trigger = page.getByTestId('icon-picker-trigger')
    await trigger.focus()
    await page.keyboard.press('Enter')
    // Opening moves focus into the picker, onto the search box.
    await expect(page.getByTestId('icon-search')).toBeFocused()

    // Tab never leaves the picker, in either direction.
    const insidePicker = () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-testid="icon-picker"]')
            ?.contains(document.activeElement) ?? false
      )
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab')
      expect(await insidePicker()).toBe(true)
    }
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await insidePicker()).toBe(true)
    }

    // Search, step into the list, move with the arrows and choose with Enter.
    await page.getByTestId('icon-search').fill('terminal')
    await page.getByTestId('icon-search').press('ArrowDown')
    await expect(page.locator('[data-glyph="terminal-window"]')).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('icon-picker')).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger.locator('.entry-tile')).toHaveAttribute(
      'data-tile-glyph',
      'terminal-window'
    )

    // Escape closes only the picker; the form behind it stays open.
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('icon-picker')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('icon-picker')).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId('item-name-input')).toHaveValue(
      'Keyboard folder'
    )
  } finally {
    await closeApp(context)
  }
})

test('the picker follows the interface language', async () => {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-picker-lang-')
  )
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data)
  )
  const context = await launchApp(userDataDir)

  try {
    const { page } = context
    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('icon-picker-trigger').click()

    const picker = page.getByRole('dialog', { name: 'Icon picker' })
    await expect(picker).toBeVisible()
    await expect(picker.getByLabel('Search icons')).toBeVisible()
    await expect(picker.getByLabel('Custom (any emoji or text)')).toBeVisible()
    await expect(
      picker.getByRole('heading', { name: 'Folders & Files' })
    ).toBeVisible()
    await expect(picker.getByText('自定义')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})
