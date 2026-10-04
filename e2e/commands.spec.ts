import { test, expect } from '@playwright/test'
import { closeApp, launchApp } from './test-utils'

const script =
  '# 列出工作目录\n$root = "C:\\Work"\nGet-ChildItem $root | ForEach-Object {\n  Write-Output $_.Name\n}\n# 保留 <tag> & 标点\nWrite-Output "完成"\n'

test('records, copies, searches and restores scripts with exact formatting', async () => {
  const first = await launchApp()
  const { page } = first
  await page.keyboard.press('Alt+5')
  await expect(page.getByTestId('tab-commands')).toHaveClass(/active/)
  await page.getByTestId('add-loose-item-commands').click()
  await page.getByTestId('item-name-input').fill('查看工作目录')
  await page
    .getByTestId('command-description')
    .fill('检查文件列表，复制到终端使用')
  await page.getByTestId('command-language').selectOption('powershell')
  const editor = page.getByTestId('command-code-input')
  await editor.fill(script)
  await editor.press('Control+Home')
  await editor.press('Tab')
  await expect(editor).toHaveValue('  ' + script)
  await editor.press('Shift+Tab')
  await expect(editor).toHaveValue(script)
  await page.screenshot({
    path: 'artifacts/command-editor.png',
    animations: 'disabled',
  })
  await editor.press('Control+s')
  await expect(page.getByTestId('modal-item')).toHaveCount(0)
  // The sample command of a new installation is on the page too.
  const row = page.locator('.command-item').filter({ hasText: '查看工作目录' })
  const id = (await row.getAttribute('data-top-entry-id'))!
  await expect(row.locator('.code-token-variable')).not.toHaveCount(0)
  await row.getByRole('button', { name: '展开全部代码' }).click()
  await expect(page.getByTestId(`command-code-${id}`)).toHaveText(script)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          ;(
            globalThis as typeof globalThis & { copiedCode: string }
          ).copiedCode = value
        },
      },
    })
  })
  await page.getByTestId(`copy-item-${id}`).click()
  expect(
    await page.evaluate(
      () =>
        (globalThis as typeof globalThis & { copiedCode: string }).copiedCode
    )
  ).toBe(script)
  await page.screenshot({
    path: 'artifacts/command-library.png',
    animations: 'disabled',
  })
  // The page has no filter box of its own; the global search finds a script by its purpose or its code.
  await expect(page.getByTestId('search-commands')).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await page.getByTestId('command-input').fill('检查文件列表')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByTestId('command-input').fill('missing-script')
  await expect(page.getByRole('option')).toHaveCount(0)
  await page.getByTestId('command-input').fill('ForEach-Object')
  // Enter copies the script (checked in search-palette.spec.ts); Shift+Enter opens it for editing.
  await page.keyboard.press('Shift+Enter')
  await expect(editor).toHaveValue(script)
  await expect(page.getByTestId('command-description')).toHaveValue(
    '检查文件列表，复制到终端使用'
  )
  await page.keyboard.press('Escape')
  const userDataDir = first.userDataDir
  await closeApp(first, { cleanup: false })
  const second = await launchApp(userDataDir)
  try {
    await second.page.getByTestId('tab-commands').click()
    await second.page.getByTestId(`edit-item-${id}`).click()
    await expect(second.page.getByTestId('command-code-input')).toHaveValue(
      script
    )
    await expect(second.page.getByTestId('command-language')).toHaveValue(
      'powershell'
    )
    await expect(second.page.getByTestId('command-description')).toHaveValue(
      '检查文件列表，复制到终端使用'
    )
  } finally {
    await closeApp(second)
  }
})

test('provides top navigation and usable code editing at narrow widths', async () => {
  const context = await launchApp()
  try {
    // The layout of the category row by width in Chinese (src/shared/layout-widths.ts).
    const layouts = { 760: 'row', 420: 'stacked', 320: 'stacked' } as const
    for (const width of [760, 420, 320] as const) {
      await context.electronApp.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(width, 720),
        width
      )
      await expect
        .poll(() => context.page.evaluate(() => innerWidth))
        .toBe(width)
      await expect(context.page.locator('.workspace-nav')).toHaveAttribute(
        'data-tab-mode',
        layouts[width]
      )
      const nav = await context.page.locator('.workspace-nav').boundingBox()
      const content = await context.page
        .locator('.workspace-content')
        .boundingBox()
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(content!.y + 1)
      // The shell border and the root padding are 2 px at a 100% display scale (a little less at 125%).
      expect(content!.x).toBeLessThanOrEqual(2)
      // The tabs stay one row, never wrapping: 44px high with the icon above the name (the default
      // window), 32px beside it (wide) or with only the icon (narrow).
      const mode = layouts[width]
      const tabs = await context.page.locator('.tab-button').all()
      expect(tabs).toHaveLength(7)
      const tops = new Set<number>()
      for (const button of tabs) {
        await expect(button).toBeVisible()
        const box = (await button.boundingBox())!
        tops.add(Math.round(box.y))
        expect(box.height).toBeGreaterThanOrEqual(mode === 'stacked' ? 44 : 32)
        expect(box.y + box.height).toBeLessThanOrEqual(nav!.y + nav!.height + 1)
      }
      expect(tops.size).toBe(1)
      expect(
        await context.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true)
    }
    await context.page.getByTestId('tab-commands').click()
    await context.page.getByTestId('add-loose-item-commands').click()
    await context.page.getByTestId('item-name-input').fill('Python 示例')
    await context.page.getByTestId('command-language').selectOption('python')
    const editor = context.page.getByTestId('command-code-input')
    await editor.fill('if True:\n  print("hello")')
    await editor.press('Control+End')
    await editor.press('Enter')
    await expect(editor).toHaveValue('if True:\n  print("hello")\n  ')
    await editor.press('Control+Tab')
    await expect(context.page.getByTestId('item-save')).toBeFocused()
    await context.page.screenshot({
      path: 'artifacts/command-compact.png',
      animations: 'disabled',
    })
    await context.page.getByTestId('item-save').click()
    await expect(context.page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('organizes scripts into groups and supports editing and deletion', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.getByTestId('tab-commands').click()
    await page.getByTestId('add-group-commands').click()
    await page.getByTestId('group-name-input').fill('开发脚本')
    await page.getByTestId('group-save').click()
    const group = page.locator('.group-card').filter({ hasText: '开发脚本' })
    const groupId = (await group.getAttribute('data-top-entry-id'))!
    await page.getByTestId(`add-item-${groupId}`).click()
    await page.getByTestId('item-name-input').fill('检查分支')
    await page.getByTestId('command-language').selectOption('bash')
    await page
      .getByTestId('command-code-input')
      .fill('git status\ngit branch -a')
    await page.getByTestId('item-save').click()
    const row = group.locator('.command-item')
    const id = (await row.getAttribute('data-list-item-id'))!
    await page.getByTestId(`edit-item-${id}`).click()
    await page.getByTestId('command-code-input').fill('git status --short')
    await page.getByTestId('item-save').click()
    await expect(page.getByTestId(`command-code-${id}`)).toHaveText(
      'git status --short'
    )
    await page.getByTestId(`delete-item-${id}`).click()
    await expect(group.locator('.command-item')).toHaveCount(0)
    await page.getByTestId('add-loose-item-commands').click()
    await page.getByTestId('item-name-input').fill('构建项目')
    await page.getByTestId('command-language').selectOption('bash')
    await page.getByTestId('command-code-input').fill('npm run build')
    await page.getByTestId('item-save').click()
    const loose = page.locator('.command-item[data-top-entry-type="loose"]')
    const source = await loose.locator('.snippet-header').boundingBox()
    const target = await group.locator('.group-card-header').boundingBox()
    await page.mouse.move(source!.x + 35, source!.y + source!.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      target!.x + target!.width / 2,
      target!.y + target!.height / 2,
      { steps: 20 }
    )
    await page.mouse.up()
    await expect(loose).toHaveCount(0)
    await expect(group).toContainText('构建项目')
    await expect(group.locator('.snippet-code code')).toHaveText(
      'npm run build'
    )
  } finally {
    await closeApp(context)
  }
})
