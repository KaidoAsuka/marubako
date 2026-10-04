import { test, expect } from '@playwright/test'
import { closeApp, launchApp } from './test-utils'

test('copies username and password independently and preserves editing, reveal and deletion', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-passwords').click()
    await page.getByTestId('add-loose-item-passwords').click()
    await page.getByTestId('item-name-input').fill('开发平台')
    await page.getByTestId('item-username-input').fill('developer@example.com')
    const password = '  Demo+Secret/123  '
    await page.getByTestId('item-password-input').fill(password)
    await page.getByTestId('item-note-input').fill('用于开发环境\n保留登录说明')
    await page.screenshot({
      path: 'artifacts/editor-password-filled.png',
      animations: 'disabled',
    })
    await page.getByTestId('item-note-input').press('Control+s')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    const card = page.locator('.password-item').filter({ hasText: '开发平台' })
    const id = (await card.getAttribute('data-top-entry-id'))!
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            ;(
              globalThis as typeof globalThis & { copiedCredential: string }
            ).copiedCredential = value
          },
        },
      })
    })
    const clipboard = () =>
      page.evaluate(
        () =>
          (globalThis as typeof globalThis & { copiedCredential: string })
            .copiedCredential
      )
    await page.getByTestId(`copy-username-${id}`).click()
    expect(await clipboard()).toBe('developer@example.com')
    await expect(card).not.toContainText(password.trim())
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    await page.getByTestId(`copy-item-${id}`).click()
    expect(await clipboard()).toBe(password)
    await expect(card).not.toContainText(password.trim())
    await page.getByTestId(`toggle-password-${id}`).click()
    await expect(card).toContainText(password.trim())
    await page.getByTestId(`toggle-password-${id}`).click()
    await expect(card).not.toContainText(password.trim())
    await page.screenshot({
      path: 'artifacts/credentials-dark.png',
      animations: 'disabled',
    })
    await page.getByTestId(`edit-item-${id}`).click()
    await expect(page.getByTestId('item-password-input')).toHaveValue(password)
    await expect(page.getByTestId('item-note-input')).toHaveValue(
      '用于开发环境\n保留登录说明'
    )
    await page.getByTestId('item-username-input').fill('updated@example.com')
    await page.getByTestId('item-save').click()
    await page.getByTestId(`copy-username-${id}`).click()
    expect(await clipboard()).toBe('updated@example.com')
    const saved = await page.evaluate(() => globalThis.quickLaunch.loadData())
    expect(
      saved.ok &&
        saved.data.loose.passwords.find((item) => item.id === id)?.password
    ).toBe(password)
    await page.getByTestId(`delete-item-${id}`).click()
    await expect(card).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('keeps redesigned item editors usable in dark and light themes at compact sizes', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const theme of ['dark', 'light'] as const) {
      if (theme === 'light') {
        await page.getByTestId('open-settings').click()
        await page.getByTestId('theme-light').click()
        await page.getByTestId('settings-save').click()
      }
      for (const tab of [
        'folders',
        'websites',
        'apps',
        'passwords',
        'notes',
        'commands',
      ] as const) {
        await context.electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(760, 720)
        )
        await page.getByTestId(`tab-${tab}`).click()
        await page.getByTestId(`add-loose-item-${tab}`).click()
        // Folders, programs and websites start with their target; the others with the name.
        await expect(
          page.getByTestId(
            tab === 'websites'
              ? 'item-url-input'
              : tab === 'folders' || tab === 'apps'
                ? 'item-path-input'
                : 'item-name-input'
          )
        ).toBeFocused()
        await page.getByTestId('item-name-input').fill('我的常用条目')
        if (tab === 'notes')
          await page
            .getByTestId('item-content-input')
            .fill('保留想法与记录\n查看全文，按需编辑。')
        if (tab === 'commands')
          await page
            .getByTestId('command-code-input')
            .fill('# 项目检查\ngit status --short\ngit branch --show-current')
        if (tab === 'passwords')
          await page
            .getByTestId('item-username-input')
            .fill('account@example.com')
        await page.screenshot({
          path: `artifacts/editor-${tab}-${theme}.png`,
          animations: 'disabled',
        })
        await context.electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(320, 420)
        )
        await expect
          .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
          .toEqual([320, 420])
        await page.screenshot({
          path: `artifacts/editor-${tab}-compact-${theme}.png`,
          animations: 'disabled',
        })
        const footer = await page
          .locator('.item-modal-card .modal-actions')
          .boundingBox()
        expect(footer!.y).toBeGreaterThanOrEqual(0)
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(420)
        await expect(page.getByTestId('item-save')).toBeVisible()
        expect(
          await page
            .getByTestId('modal-card')
            .evaluate((element) => element.scrollWidth <= element.clientWidth)
        ).toBe(true)
        // The body scrolls independently; the final field remains editable above the footer.
        if (tab === 'passwords') {
          const note = page.getByTestId('item-note-input')
          await note.fill('窄窗口中也能编辑说明')
          await expect(note).toBeFocused()
        }
        if (tab === 'commands' || tab === 'passwords')
          await page.screenshot({
            path: `artifacts/editor-${tab}-compact-${theme}.png`,
            animations: 'disabled',
          })
        // The name was typed, so closing asks first.
        await page.keyboard.press('Escape')
        await page.getByTestId('discard-confirm').click()
        await expect(page.getByTestId('modal-item')).toHaveCount(0)
      }
    }
  } finally {
    await closeApp(context)
  }
})
