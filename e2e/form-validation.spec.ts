import { expect, test, type Page } from '@playwright/test'

import { closeApp, launchApp, type AppContext } from './test-utils'

async function resize(
  context: AppContext,
  width: number,
  height: number
): Promise<void> {
  await context.electronApp.evaluate(
    ({ BrowserWindow }, [w, h]) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(w!, h!),
    [width, height]
  )
  await expect
    .poll(() => context.page.evaluate(() => [innerWidth, innerHeight]))
    .toEqual([width, height])
}

/** The box of an element, relative to the window, and the window height. */
async function boxOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom, height: innerHeight }
  })
}

test('an item form explains what is missing next to the field, in view even in a small window', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await resize(context, 320, 420)
    await page.getByTestId('tab-commands').click()
    await page.getByTestId('add-loose-item-commands').click()

    await page.getByTestId('item-save').click()
    const name = page.getByTestId('item-name-input')
    const nameAlert = page.getByRole('alert').filter({ hasText: '请填写名称' })
    await expect(nameAlert).toBeVisible()
    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    let box = await boxOf(page, '#item-form-name-error')
    const footer = await boxOf(page, '.item-modal-card .modal-actions')
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(footer.top)

    // Typing takes the message away at once.
    await name.fill('构建')
    await expect(nameAlert).toHaveCount(0)

    // The code editor is further down; its message is brought into view with the cursor in it.
    await page.getByTestId('item-save').click()
    const editor = page.getByTestId('command-code-input')
    await expect(editor).toBeFocused()
    await expect(editor).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#item-form-code-error')).toBeVisible()
    box = await boxOf(page, '#item-form-code-error')
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(footer.top)

    await editor.fill('npm run build')
    await expect(page.locator('#item-form-code-error')).toHaveCount(0)
    await page.getByTestId('item-save').click()
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('a pasted path loses its quotes, and something that is not a full path is refused', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('add-loose-item-folders').click()
    await page.getByTestId('item-name-input').fill('公共文件夹')
    await page.getByTestId('item-path-input').fill('"C:\\Users\\Public"')
    await page.getByTestId('item-save').click()
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    const saved = await page.evaluate(() => window.quickLaunch.loadData())
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(
      saved.data.loose.folders.find((entry) => entry.name === '公共文件夹')
        ?.path
    ).toBe('C:\\Users\\Public')

    await page.getByTestId('tab-apps').click()
    await page.getByTestId('add-loose-item-apps').click()
    await page.getByTestId('item-name-input').fill('记事本')
    await page.getByTestId('item-path-input').fill('notepad.exe')
    await page.getByTestId('item-save').click()
    await expect(page.getByRole('alert')).toContainText('完整路径')
    await expect(page.getByTestId('item-path-input')).toBeFocused()
    await expect(page.getByTestId('modal-item')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('Enter saves the group, task and subtask forms, and an empty name is explained', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.getByTestId('tab-notes').click()
    await page.getByTestId('add-group-notes').click()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('请填写名称')
    await expect(page.getByTestId('group-name-input')).toBeFocused()
    await expect(page.getByTestId('modal-group')).toBeVisible()
    await page.keyboard.type('日记')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-group')).toHaveCount(0)
    await expect(page.getByText('日记')).toBeVisible()

    await page.getByTestId('tab-tasks').click()
    await page.getByTestId('add-task').click()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('请填写名称')
    await expect(page.getByTestId('modal-task')).toBeVisible()
    await page.keyboard.type('写周报')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-task')).toHaveCount(0)
    const card = page.locator('.task-card').filter({ hasText: '写周报' })
    await expect(card).toBeVisible()

    await card.locator('[data-testid^="add-subtask-"]').click()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('请填写名称')
    await page.keyboard.type('列提纲')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-subtask')).toHaveCount(0)
    await expect(card.locator('.subtask-row')).toContainText('列提纲')
  } finally {
    await closeApp(context)
  }
})
