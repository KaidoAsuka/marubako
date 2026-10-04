import { expect, test, type Page } from '@playwright/test'

import { closeApp, launchApp, type AppContext } from './test-utils'

async function setClipboard(context: AppContext, text: string): Promise<void> {
  await context.electronApp.evaluate(({ clipboard }, value) => {
    clipboard.writeText(value)
  }, text)
}

async function loadLoose(page: Page, tab: 'folders' | 'websites' | 'apps') {
  const result = await page.evaluate(() => window.quickLaunch.loadData())
  if (!result.ok) throw new Error(result.error)
  return result.data.loose[tab] as Array<
    { name: string } & Record<string, string>
  >
}

test('adds a website from the clipboard in three steps: new, paste, Enter', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-websites').click()
    await setClipboard(context, 'https://www.github.com/anthropics')

    await page.keyboard.press('Control+n')
    // The cursor is already in the address field.
    await expect(page.getByTestId('item-url-input')).toBeFocused()
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('item-url-input')).toHaveValue(
      'https://www.github.com/anthropics'
    )
    // The name is made from it, and ready to be replaced.
    await expect(page.getByTestId('item-name-input')).toHaveValue('github.com')
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    expect(await loadLoose(page, 'websites')).toMatchObject([
      { name: 'github.com', url: 'https://www.github.com/anthropics' },
    ])
    // The strip says it, and its undo takes it out again.
    await expect(page.getByTestId('feedback-strip')).toContainText(
      '已添加「github.com」'
    )
    await page.getByTestId('feedback-action').click()
    await expect
      .poll(async () => (await loadLoose(page, 'websites')).length)
      .toBe(0)
  } finally {
    await closeApp(context)
  }
})

test('a pasted path loses its quotes and names the folder', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await setClipboard(context, '"C:\\Windows\\System32"')

    await page.getByTestId('add-loose-item-folders').click()
    await expect(page.getByTestId('item-path-input')).toBeFocused()
    await page.keyboard.press('Control+v')

    await expect(page.getByTestId('item-path-input')).toHaveValue(
      'C:\\Windows\\System32'
    )
    await expect(page.getByTestId('item-name-input')).toHaveValue('System32')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    expect(await loadLoose(page, 'folders')).toMatchObject([
      { name: 'System32', path: 'C:\\Windows\\System32' },
    ])
  } finally {
    await closeApp(context)
  }
})

test('Ctrl+Enter saves and keeps going: the form empties and waits for the next target', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('add-loose-item-folders').click()
    await expect(page.locator('.item-save-hint')).toContainText(
      'Ctrl+Enter 保存并继续'
    )

    for (const folder of ['C:\\Windows', 'C:\\Users', 'C:\\Program Files']) {
      await page.getByTestId('item-path-input').fill(folder)
      await page.keyboard.press('Control+Enter')
      await expect(page.getByTestId('item-path-input')).toHaveValue('')
      await expect(page.getByTestId('item-path-input')).toBeFocused()
      await expect(page.getByTestId('modal-item')).toBeVisible()
    }
    await expect(page.getByTestId('feedback-strip')).toContainText('已添加')

    // Nothing is typed any more, so Esc closes without asking.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    expect(
      (await loadLoose(page, 'folders')).map((entry) => entry.name)
    ).toEqual(['Windows', 'Users', 'Program Files'])
    await expect(
      page.locator('.widget-name', { hasText: 'Program Files' })
    ).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('the place is chosen in the form, and a group opened for adding is the default', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-websites').click()

    // From the toolbar: standalone by default, any group of the category on offer.
    await page.getByTestId('add-loose-item-websites').click()
    const place = page.getByTestId('item-destination')
    await expect(place).toHaveValue('')
    await expect(place.locator('option')).toHaveText([
      '独立条目',
      'Everyday tools',
      'Fun',
    ])
    await page.getByTestId('item-url-input').fill('example.org')
    await place.selectOption('grp-sites-fun')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    const saved = await page.evaluate(() => window.quickLaunch.loadData())
    if (!saved.ok) throw new Error(saved.error)
    expect(
      saved.data.websites
        .find((group) => group.id === 'grp-sites-fun')!
        .items.map((item) => item.name)
    ).toEqual(['YouTube', 'example.org'])
    expect(saved.data.loose.websites).toHaveLength(0)

    // Editing it from there moves it, in the same save, and the strip can put it back.
    await page.getByTestId('folder-widget-grp-sites-fun').click()
    // The buttons on a tile appear when the pointer rests on it.
    await page
      .getByTestId('grid-item-' + saved.data.websites[1]!.items[1]!.id)
      .hover()
    await page
      .getByTestId('edit-item-' + saved.data.websites[1]!.items[1]!.id)
      .click()
    await page.getByTestId('item-destination').selectOption('')
    await page.getByTestId('item-save').click()
    await expect(page.getByTestId('feedback-strip')).toContainText(
      '已把「example.org」移到「独立条目」'
    )
    expect(await loadLoose(page, 'websites')).toMatchObject([
      { name: 'example.org' },
    ])
    await page.getByTestId('feedback-action').click()
    await expect
      .poll(async () => (await loadLoose(page, 'websites')).length)
      .toBe(0)
  } finally {
    await closeApp(context)
  }
})

test('a folder, a program or a website can be saved without a name', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('item-path-input').fill('C:\\Windows\\Fonts')
    // Left empty on purpose: typed text would have been kept.
    await page.getByTestId('item-name-input').fill('')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    expect(await loadLoose(page, 'folders')).toMatchObject([{ name: 'Fonts' }])
  } finally {
    await closeApp(context)
  }
})
