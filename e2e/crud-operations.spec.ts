import { test, expect } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

test('creates and deletes a note group and note item', async () => {
  const context = await launchApp()
  const groupName = 'E2E Notes Group'
  const itemName = 'E2E Note Item'

  try {
    await context.page.getByTestId('tab-notes').click()
    await context.page.getByTestId('add-group-notes').click()
    await context.page.getByTestId('group-name-input').fill(groupName)
    await context.page.getByTestId('group-save').click()

    const groupCard = context.page.locator('[data-testid^="group-card-"]', {
      hasText: groupName,
    })
    await expect(groupCard).toBeVisible()

    await groupCard.locator('button[data-testid^="add-item-"]').click()
    await context.page.getByTestId('item-name-input').fill(itemName)
    await context.page
      .getByTestId('item-content-input')
      .fill('Remember to keep the test app isolated.')
    await context.page.getByTestId('item-save').click()

    const itemRow = context.page.locator('[data-testid^="item-row-"]', {
      hasText: itemName,
    })
    await expect(itemRow).toBeVisible()

    // A single item is deleted at once (with an undo in the feedback strip), no confirmation.
    await itemRow.locator('button[data-testid^="delete-item-"]').click()
    await expect(itemRow).toHaveCount(0)

    // The group is empty by now, so it goes without a confirmation as well.
    await groupCard.locator('button[data-testid^="delete-group-"]').click()
    await expect(groupCard).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})
