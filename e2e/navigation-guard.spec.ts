import { test, expect, type Page } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

async function reloadsItself(page: Page): Promise<boolean> {
  await page.evaluate(() => {
    ;(
      window as typeof window & { navigationMarker?: number }
    ).navigationMarker = 1
  })
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => location.reload()),
  ])
  return page.evaluate(
    () =>
      (window as typeof window & { navigationMarker?: number })
        .navigationMarker === undefined
  )
}

async function staysOnTheApp(page: Page): Promise<boolean> {
  const before = page.url()
  await page.evaluate(() => {
    location.href = 'https://example.invalid/'
  })
  await page.waitForTimeout(500)
  return page.url() === before
}

test('a window can reload itself but cannot be navigated away from the app', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    expect(await staysOnTheApp(page)).toBe(true)
    expect(await reloadsItself(page)).toBe(true)
    await expect(page.getByTestId('app-root')).toBeVisible()

    await page.getByTestId('dock-panel').click()
    await expect.poll(() => context.electronApp.windows().length).toBe(2)
    const bubble = context.electronApp
      .windows()
      .find((candidate) => candidate !== page)!
    await expect(bubble.getByTestId('dock-bubble')).toBeVisible()
    expect(await staysOnTheApp(bubble)).toBe(true)
    expect(await reloadsItself(bubble)).toBe(true)
    await expect(bubble.getByTestId('dock-bubble')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})
