import { test, expect } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

const tabs = [
  'folders',
  'websites',
  'apps',
  'passwords',
  'notes',
  'commands',
  'tasks',
] as const

test('switches across all tabs', async () => {
  const context = await launchApp()

  try {
    for (const tab of tabs) {
      await context.page.getByTestId(`tab-${tab}`).click()
      await expect(context.page.getByTestId(`section-${tab}`)).toBeVisible()
    }
  } finally {
    await closeApp(context)
  }
})
