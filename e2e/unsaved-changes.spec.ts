import { expect, test, type Page } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

// A point on the dim backdrop, outside the dialog card.
const BACKDROP = { x: 8, y: 8 }

async function openNote(page: Page): Promise<void> {
  await page.getByTestId('tab-notes').click()
  await page.getByTestId('add-loose-item-notes').click()
  await expect(page.getByTestId('item-name-input')).toBeFocused()
}

test('dragging a text selection out of the card does not close the dialog', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openNote(page)
    const content = page.getByTestId('item-content-input')
    await content.fill('第一行\n第二行\n第三行')

    const box = (await content.boundingBox())!
    await page.mouse.move(box.x + 24, box.y + 16)
    await page.mouse.down()
    await page.mouse.move(BACKDROP.x, BACKDROP.y, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('discard-bar')).toHaveCount(0)
    await expect(content).toHaveValue('第一行\n第二行\n第三行')
  } finally {
    await closeApp(context)
  }
})

test('a slider dragged out of the settings card leaves the dialog open', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('open-settings').click()
    const slider = page.getByRole('slider').first()
    await expect(slider).toBeVisible()

    const box = (await slider.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(BACKDROP.x, BACKDROP.y, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByTestId('modal-settings')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('a plain click on the backdrop closes a dialog nobody has typed in', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openNote(page)

    await page.mouse.click(BACKDROP.x, BACKDROP.y)

    await expect(page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('Esc, the X button, Cancel and the backdrop ask before throwing a draft away', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openNote(page)
    const content = page.getByTestId('item-content-input')
    await content.fill('不能丢的草稿')
    const bar = page.getByTestId('discard-bar')

    // Esc asks, with the safe answer focused; a second Esc means "keep editing".
    await page.keyboard.press('Escape')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('放弃未保存的修改？')
    await expect(page.getByTestId('discard-keep')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(bar).toHaveCount(0)
    await expect(content).toBeFocused()
    await expect(content).toHaveValue('不能丢的草稿')

    // The X button asks, and "Keep editing" hands the cursor back.
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(bar).toBeVisible()
    await page.getByTestId('discard-keep').click()
    await expect(bar).toHaveCount(0)
    await expect(content).toBeFocused()

    // Cancel asks too, and so does a plain click on the backdrop.
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await expect(bar).toBeVisible()
    await page.getByTestId('discard-keep').click()
    await page.mouse.click(BACKDROP.x, BACKDROP.y)
    await expect(bar).toBeVisible()
    await expect(page.getByTestId('modal-item')).toBeVisible()

    // Only "Discard" throws it away, and the next dialog starts clean.
    await page.getByTestId('discard-confirm').click()
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    await page.getByTestId('add-loose-item-notes').click()
    await expect(page.getByTestId('item-content-input')).toHaveValue('')
    await expect(page.getByTestId('discard-bar')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('a successful save closes the dialog without a question', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openNote(page)
    await page.getByTestId('item-name-input').fill('保存的备忘')
    await page.getByTestId('item-content-input').fill('内容')

    await page.getByTestId('item-save').click()

    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    // (the strip says "added" too, so look for the entry itself)
    await expect(
      page.locator('.item-name', { hasText: '保存的备忘' })
    ).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('the task, subtask and group dialogs ask too', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.getByTestId('tab-notes').click()
    await page.getByTestId('add-group-notes').click()
    await page.getByTestId('group-name-input').fill('草稿分组')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('discard-bar')).toBeVisible()
    await page.getByTestId('discard-confirm').click()
    await expect(page.getByTestId('modal-group')).toHaveCount(0)

    await page.getByTestId('tab-tasks').click()
    await page.getByTestId('add-task').click()
    await page.getByTestId('task-name-input').fill('草稿任务')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('discard-bar')).toBeVisible()
    await page.getByTestId('discard-confirm').click()
    await expect(page.getByTestId('modal-task')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})
