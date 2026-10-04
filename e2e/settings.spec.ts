import { test, expect } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

test('persists a theme change from settings', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('theme-light').click()
    await context.page.getByTestId('settings-save').click()

    await expect(context.page.getByTestId('app-root')).toHaveClass(
      /theme-light/
    )
  } finally {
    await closeApp(context)
  }
})

test('applies the selected accent colour to the accent tokens and leaves the dialog surface alone', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('open-settings').click()

    const read = () =>
      context.page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement)

        return {
          accent: styles.getPropertyValue('--accent').trim(),
          solid: styles.getPropertyValue('--accent-solid').trim(),
          card: styles.getPropertyValue('--card-bg').trim(),
        }
      })
    const before = await read()
    const beforeModalColor = await context.page
      .getByTestId('modal-card')
      .evaluate((element) => getComputedStyle(element).backgroundColor)

    await context.page.getByTestId('background-sunset').click()
    await context.page.getByTestId('settings-save').click()

    await expect(context.page.getByTestId('app-root')).toHaveAttribute(
      'data-background',
      'sunset'
    )

    await context.page.getByTestId('open-settings').click()

    const after = await read()
    const afterModalColor = await context.page
      .getByTestId('modal-card')
      .evaluate((element) => getComputedStyle(element).backgroundColor)

    // The choice is an accent: the colour and its solid fill change, the surfaces do not.
    expect(after.accent).not.toBe(before.accent)
    expect(after.solid).not.toBe(before.solid)
    expect(after.card).toBe(before.card)
    expect(afterModalColor).toBe(beforeModalColor)
    expect(afterModalColor).toBe('rgb(29, 32, 41)')
  } finally {
    await closeApp(context)
  }
})
