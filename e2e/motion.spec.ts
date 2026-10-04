import { test, expect } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

test('keeps closing form content, releases focus, and resets a quickly reopened form', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--motion-fast', '400ms')
    })
    const trigger = page.getByTestId('add-loose-item-folders')
    await trigger.click()
    await page.getByTestId('item-name-input').fill('Unsaved draft')
    // A draft is not thrown away by one Esc: the dialog asks first (unsaved-changes.spec.ts).
    await page.keyboard.press('Escape')
    await page.getByTestId('discard-confirm').click()

    const modal = page.getByTestId('modal-item')
    await expect(modal).toHaveAttribute('data-exiting', 'true')
    await expect(modal).toHaveAttribute('inert', '')
    await expect(page.getByTestId('item-name-input')).toHaveValue(
      'Unsaved draft'
    )
    await expect(trigger).toBeFocused()

    await page.keyboard.press('Control+n')
    await expect(modal).not.toHaveAttribute('data-exiting')
    await expect(page.getByTestId('item-name-input')).toHaveValue('')
    // A folder starts with its path, so that is where the cursor goes.
    await expect(page.getByTestId('item-path-input')).toBeFocused()
    // Wait beyond the original exit deadline to catch a stale removal timer.
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 500))
    )
    await expect(modal).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('moves the active category marker into place and preserves search keyboard behavior', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    for (const tab of ['tasks', 'websites', 'notes']) {
      const button = page.getByTestId(`tab-${tab}`)
      await button.click()
      await expect(page.getByTestId(`section-${tab}`)).toBeVisible()
      await expect
        .poll(() =>
          button.evaluate((node) => {
            const nav = node.parentElement!
            const marker = getComputedStyle(nav, '::before')
            const x = new DOMMatrixReadOnly(marker.transform).m41
            return Math.abs(
              nav.getBoundingClientRect().x + x - node.getBoundingClientRect().x
            )
          })
        )
        .toBeLessThan(1)
    }
    await page.keyboard.press('Control+k')
    await page.getByTestId('command-input').fill('使用说明')
    // Enter would copy the note; Shift+Enter opens it for editing.
    await page.keyboard.press('Shift+Enter')
    await expect(page.getByTestId('item-name-input')).toHaveValue('使用说明')
    await expect(page.getByTestId('item-name-input')).toBeFocused()
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-input')).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    // The marker is measured from the active button, so it fits whatever the layout of the row: the
    // tabs side by side at different widths (760), stacked (320, 420). Icons only is covered by
    // layout-widths.spec.ts.
    for (const width of [760, 320, 420]) {
      await context.electronApp.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(width, 700),
        width
      )
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width)
      for (const tab of ['tasks', 'folders', 'notes']) {
        const button = page.getByTestId(`tab-${tab}`)
        await button.click()
        await expect
          .poll(() =>
            button.evaluate((node) => {
              const nav = node.parentElement!
              const marker = getComputedStyle(nav, '::before')
              const matrix = new DOMMatrixReadOnly(marker.transform)
              const navRect = nav.getBoundingClientRect()
              const buttonRect = node.getBoundingClientRect()
              const scale = navRect.width / nav.offsetWidth
              return Math.max(
                Math.abs(navRect.x + matrix.m41 * scale - buttonRect.x),
                Math.abs(navRect.y + matrix.m42 * scale - buttonRect.y),
                Math.abs(parseFloat(marker.width) * scale - buttonRect.width),
                Math.abs(parseFloat(marker.height) * scale - buttonRect.height)
              )
            })
          )
          .toBeLessThan(1)
      }
    }
    await page.screenshot({
      path: 'artifacts/motion-workspace.png',
      animations: 'disabled',
    })
  } finally {
    await closeApp(context)
  }
})

test('reduced motion disables movement while keeping category and dialog interactions available', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-websites').click()
    await expect(page.getByTestId('section-websites')).toBeVisible()
    await expect(page.getByTestId('section-websites')).toHaveCSS(
      'animation-name',
      'none'
    )
    const icon = page.getByTestId('tab-websites').locator('.tab-button-icon')
    await page.getByTestId('tab-websites').hover()
    await expect(icon).toHaveCSS('transform', 'none')
    await page.keyboard.press('Control+n')
    await expect(page.getByTestId('item-url-input')).toBeFocused()
    await expect(page.getByTestId('modal-card')).toHaveCSS(
      'animation-name',
      'none'
    )
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-input')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})
