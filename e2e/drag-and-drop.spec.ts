import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { test, expect, type Locator, type Page } from '@playwright/test'

import { createDefaultAppData } from '../src/shared/default-data'
import type { AppData } from '../src/shared/types'
import { closeApp, launchApp } from './test-utils'

async function launchWithData(mutate: (data: AppData) => void) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-dnd-'))
  const data = createDefaultAppData()
  // These tests lay entries out in several columns and place the pointer by their geometry; a new
  // installation opens slender (two columns of tiles), so they start from a saved wide window.
  data.window.bounds = { x: 100, y: 40, w: 760, h: 720 }
  mutate(data)
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )

  return launchApp(userDataDir)
}

function makeNote(id: string) {
  return {
    id,
    kind: 'note' as const,
    name: id,
    icon: '📝',
    content: `${id} body`,
  }
}

function makeFolder(id: string) {
  return {
    id,
    kind: 'folder' as const,
    name: id,
    icon: '📁',
    path: `C:\\${id}`,
  }
}

async function waitForStableScroll(locator: Locator) {
  let previous = -1

  await expect
    .poll(async () => {
      const current = await locator.evaluate((node) => node.scrollTop)
      const stable = current === previous
      previous = current

      return stable
    })
    .toBe(true)

  return locator.evaluate((node) => node.scrollTop)
}

const attributesOf = (page: Page, selector: string, attribute: string) =>
  page
    .locator(selector)
    .evaluateAll(
      (nodes, name) => nodes.map((node) => node.getAttribute(name)),
      attribute
    )

async function waitForStableBox(locator: Locator) {
  let previousSignature = ''

  await expect
    .poll(async () => {
      const box = await locator.boundingBox()
      if (!box) {
        previousSignature = ''
        return 'missing'
      }

      const nextSignature = [box.x, box.y, box.width, box.height]
        .map((value) => Math.round(value))
        .join(':')
      const stable =
        previousSignature !== '' && previousSignature === nextSignature

      previousSignature = nextSignature

      return stable ? nextSignature : 'moving'
    })
    .not.toBe('moving')

  const box = await locator.boundingBox()

  expect(box).not.toBeNull()

  return box
}

test('reorders folder widgets when dragging from the card label area', async () => {
  const context = await launchApp()

  try {
    const order = async () =>
      context.page
        .locator('[data-testid^="folder-widget-"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-testid'))
        )

    const source = context.page.getByTestId('folder-widget-grp-folders-work')
    const target = context.page.getByTestId('folder-widget-grp-folders-life')
    const sourceBox = await waitForStableBox(source)
    const targetBox = await waitForStableBox(target)

    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    const startX = sourceBox!.x + sourceBox!.width / 2
    const startY = sourceBox!.y + sourceBox!.height - 8
    const endX = targetBox!.x + targetBox!.width * 0.7
    const endY = targetBox!.y + targetBox!.height / 2

    const beforeOrder = await order()

    await context.page.mouse.move(startX, startY)
    await context.page.mouse.down()
    await context.page.mouse.move(endX, endY, { steps: 20 })

    const liveTargetBox = await waitForStableBox(target)

    // On the trailing half of the target tile (its middle is the line between before and after).
    await context.page.mouse.move(
      liveTargetBox.x + liveTargetBox.width * 0.7,
      liveTargetBox.y + liveTargetBox.height / 2,
      { steps: 8 }
    )

    await context.page.mouse.up()

    await expect
      .poll(order)
      .toEqual([
        'folder-widget-grp-folders-life',
        'folder-widget-grp-folders-work',
      ])
    expect(beforeOrder).toEqual([
      'folder-widget-grp-folders-work',
      'folder-widget-grp-folders-life',
    ])
  } finally {
    await closeApp(context)
  }
})

test('keeps folder order when dropping on the trailing half of the previous folder', async () => {
  const context = await launchApp()

  try {
    const order = async () =>
      context.page
        .locator('[data-testid^="folder-widget-"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-testid'))
        )

    const source = context.page.getByTestId('folder-widget-grp-folders-life')
    const target = context.page.getByTestId('folder-widget-grp-folders-work')
    const sourceBox = await waitForStableBox(source)
    // The tile is the target (44px high, one line), not the 24px icon inside it.
    const targetBox = await waitForStableBox(target)

    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height - 8
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      targetBox!.x + targetBox!.width * 0.78,
      targetBox!.y + targetBox!.height / 2,
      { steps: 20 }
    )

    await expect
      .poll(() => target.getAttribute('class'))
      .toContain('drop-after')

    await context.page.mouse.up()

    await expect
      .poll(order)
      .toEqual([
        'folder-widget-grp-folders-work',
        'folder-widget-grp-folders-life',
      ])
  } finally {
    await closeApp(context)
  }
})

test('moves a loose folder shortcut into a folder widget', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('add-loose-item-folders').click()
    await context.page.getByTestId('item-name-input').fill('LooseTest')
    await context.page.getByTestId('item-path-input').fill('C:\\LooseTest')
    await context.page.getByTestId('item-save').click()

    const source = context.page
      .locator('.widget-grid')
      .locator('[data-testid^="loose-widget-"]')
      .filter({ hasText: 'LooseTest' })
      .first()
    const target = context.page.getByTestId('folder-widget-grp-folders-work')
    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()

    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()

    const previewX = sourceBox!.x + sourceBox!.width + 28
    const previewY = sourceBox!.y + sourceBox!.height / 2

    await context.page.mouse.move(previewX, previewY, { steps: 12 })

    const overlayIconBox = await context.page
      .locator('.drag-overlay-shell .widget-loose-box')
      .boundingBox()

    expect(overlayIconBox).not.toBeNull()
    expect(
      Math.abs(overlayIconBox!.x + overlayIconBox!.width / 2 - previewX)
    ).toBeLessThan(18)
    expect(
      Math.abs(overlayIconBox!.y + overlayIconBox!.height / 2 - previewY)
    ).toBeLessThan(18)
    await expect(source).toBeHidden()

    // Released on the name, a long way from the 24px icon: the whole tile is the group.
    await context.page.mouse.move(
      targetBox!.x + targetBox!.width * 0.6,
      targetBox!.y + targetBox!.height / 2,
      { steps: 20 }
    )

    await expect
      .poll(() => target.getAttribute('class'))
      .toContain('folder-drop')

    await context.page.mouse.up()

    await expect(source).toHaveCount(0)

    // Just after a drop the first click can still be swallowed on a slow machine: click until the
    // popup opens.
    await expect(async () => {
      await target.click()
      await expect(context.page.locator('.widget-popup')).toBeVisible({
        timeout: 1500,
      })
    }).toPass({ timeout: 10_000 })
    await expect(context.page.locator('.widget-popup')).toContainText(
      'LooseTest'
    )
  } finally {
    await closeApp(context)
  }
})

test('reorders a loose folder shortcut between folder widgets without nesting it', async () => {
  const context = await launchApp()

  try {
    const order = async () =>
      context.page
        .locator('.widget-grid > [data-top-entry-id]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-testid'))
        )

    await context.page.getByTestId('add-loose-item-folders').click()
    await context.page.getByTestId('item-name-input').fill('BetweenTest')
    await context.page.getByTestId('item-path-input').fill('C:\\BetweenTest')
    await context.page.getByTestId('item-save').click()

    const source = context.page
      .locator('.widget-grid')
      .locator('[data-testid^="loose-widget-"]')
      .filter({ hasText: 'BetweenTest' })
      .first()
    const sourceTestId = await source.getAttribute('data-testid')
    const workFolder = context.page.getByTestId(
      'folder-widget-grp-folders-work'
    )
    const lifeFolder = context.page.getByTestId(
      'folder-widget-grp-folders-life'
    )
    const workFolderBox = await waitForStableBox(workFolder)
    const lifeFolderBox = await waitForStableBox(lifeFolder)
    const sourceBox = await waitForStableBox(source)

    expect(sourceTestId).toBeTruthy()
    expect(workFolderBox).not.toBeNull()
    expect(lifeFolderBox).not.toBeNull()
    expect(sourceBox).not.toBeNull()

    const gapLeft = workFolderBox.x + workFolderBox.width
    const gapRight = lifeFolderBox.x
    const betweenX = gapLeft + (gapRight - gapLeft) / 2
    const betweenY = Math.min(
      workFolderBox.y + workFolderBox.height * 0.38,
      lifeFolderBox.y + lifeFolderBox.height * 0.38
    )

    await context.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(betweenX, betweenY, { steps: 20 })

    await context.page.mouse.up()

    await expect
      .poll(order)
      .toEqual([
        'folder-widget-grp-folders-work',
        sourceTestId,
        'folder-widget-grp-folders-life',
      ])

    await expect(
      context.page.locator('.widget-popup').filter({ hasText: 'BetweenTest' })
    ).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('places a loose folder shortcut next to a group tile when it is released on the tile’s edge strip, without nesting it', async () => {
  const context = await launchApp()

  try {
    const order = async () =>
      context.page
        .locator('.widget-grid > [data-top-entry-id]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-testid'))
        )

    await context.page.getByTestId('add-loose-item-folders').click()
    await context.page.getByTestId('item-name-input').fill('EdgeStripTest')
    await context.page.getByTestId('item-path-input').fill('C:\\EdgeStripTest')
    await context.page.getByTestId('item-save').click()

    const source = context.page
      .locator('.widget-grid')
      .locator('[data-testid^="loose-widget-"]')
      .filter({ hasText: 'EdgeStripTest' })
      .first()
    const sourceTestId = await source.getAttribute('data-testid')
    const work = context.page.getByTestId('folder-widget-grp-folders-work')
    const workBox = await waitForStableBox(work)
    const sourceBox = await waitForStableBox(source)

    await context.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2
    )
    await context.page.mouse.down()
    // 5px in from the left edge of the group tile: its before strip, not the group.
    await context.page.mouse.move(
      workBox.x + 5,
      workBox.y + workBox.height / 2,
      { steps: 20 }
    )
    await expect.poll(() => work.getAttribute('class')).toContain('drop-before')
    expect(await work.getAttribute('class')).not.toContain('folder-drop')
    await context.page.mouse.up()

    await expect
      .poll(order)
      .toEqual([
        sourceTestId,
        'folder-widget-grp-folders-work',
        'folder-widget-grp-folders-life',
      ])
    await work.click()
    await expect(context.page.locator('.widget-popup')).not.toContainText(
      'EdgeStripTest'
    )
  } finally {
    await closeApp(context)
  }
})

test('moves a loose note into a short note group near the header edge', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()
    await context.page.getByTestId('add-group-notes').click()
    await context.page.getByTestId('group-name-input').fill('Edge Drop Group')
    await context.page.getByTestId('group-save').click()

    await context.page.getByTestId('add-loose-item-notes').click()
    await context.page.getByTestId('item-name-input').fill('Edge Drop Note')
    await context.page
      .getByTestId('item-content-input')
      .fill('Drag near the header edge')
    await context.page.getByTestId('item-save').click()

    const source = context.page
      .locator('.list-section [data-top-entry-type="loose"]')
      .filter({ hasText: 'Edge Drop Note' })
      .first()
    const targetGroup = context.page.locator('[data-testid^="group-card-"]', {
      hasText: 'Edge Drop Group',
    })
    const targetHeader = targetGroup.locator('.group-card-header')
    await source.scrollIntoViewIfNeeded()
    const sourceBox = await waitForStableBox(source)
    const targetHeaderBox = await waitForStableBox(targetHeader)

    await context.page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      targetHeaderBox.x + targetHeaderBox.width / 2,
      targetHeaderBox.y + Math.max(12, targetHeaderBox.height * 0.24),
      { steps: 20 }
    )

    await context.page.mouse.up()

    await expect(source).toHaveCount(0)
    await expect(targetGroup).toContainText('Edge Drop Note')
  } finally {
    await closeApp(context)
  }
})

test('keeps a drag overlay visible when dragging a popup item outside the popup', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('folder-widget-grp-folders-work').click()
    await expect(context.page.locator('.widget-popup')).toBeVisible()

    const source = context.page
      .locator('.widget-popup')
      .getByTestId('grid-item-folder-desktop')
    const sourceBox = await source.boundingBox()

    expect(sourceBox).not.toBeNull()

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(24, 24, { steps: 20 })

    await expect(context.page.locator('.drag-overlay-shell')).toBeVisible()
    await expect(source).toBeHidden()

    await context.page.mouse.up()
  } finally {
    await closeApp(context)
  }
})

test('moves a loose note into an open note group in list view', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()
    await context.page.getByTestId('add-loose-item-notes').click()
    await context.page.getByTestId('item-name-input').fill('Inbox Drag')
    await context.page
      .getByTestId('item-content-input')
      .fill('Drag me into group')
    await context.page.getByTestId('item-save').click()

    const source = context.page
      .locator('.list-section [data-top-entry-type="loose"]')
      .filter({ hasText: 'Inbox Drag' })
      .first()
    const target = context.page.getByTestId('item-row-note-usage')
    const sourceBox = await source.boundingBox()
    const targetBox = await target.boundingBox()

    expect(sourceBox).not.toBeNull()
    expect(targetBox).not.toBeNull()

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 20 }
    )
    await context.page.mouse.up()

    await expect(source).toHaveCount(0)
    await expect(
      context.page.getByTestId('group-card-grp-notes-default')
    ).toContainText('Inbox Drag')
  } finally {
    await closeApp(context)
  }
})

test('keeps list item drag overlay size stable while dragging', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()
    await context.page.getByTestId('add-loose-item-notes').click()
    await context.page.getByTestId('item-name-input').fill('Overlay Note')
    await context.page
      .getByTestId('item-content-input')
      .fill('Overlay sizing check')
    await context.page.getByTestId('item-save').click()

    const source = context.page
      .locator('.list-section [data-top-entry-type="loose"]')
      .filter({ hasText: 'Overlay Note' })
      .first()
    const sourceBox = await source.boundingBox()

    expect(sourceBox).not.toBeNull()

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height + 48,
      { steps: 12 }
    )

    const overlay = context.page.locator('.drag-overlay-shell')
    await expect(overlay).toBeVisible()
    await expect(source).toBeHidden()

    const overlayBox = await overlay.boundingBox()
    expect(overlayBox).not.toBeNull()
    expect(Math.abs(overlayBox!.width - sourceBox!.width)).toBeLessThan(4)
    expect(Math.abs(overlayBox!.height - sourceBox!.height)).toBeLessThan(4)

    await context.page.mouse.up()
  } finally {
    await closeApp(context)
  }
})

test('moves a grouped note to the loose list when dropped below the list content', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()

    const source = context.page.getByTestId('item-row-note-usage')
    const groupCard = context.page.getByTestId('group-card-grp-notes-default')
    const section = context.page.getByTestId('section-notes')
    const sourceBox = await waitForStableBox(source)
    const groupCardBox = await waitForStableBox(groupCard)
    const sectionBox = await waitForStableBox(section)

    expect(sourceBox).not.toBeNull()
    expect(groupCardBox).not.toBeNull()
    expect(sectionBox).not.toBeNull()

    const dropX = sourceBox!.x + sourceBox!.width / 2
    const dropY = Math.min(
      sectionBox!.y + sectionBox!.height - 20,
      groupCardBox!.y + groupCardBox!.height + 56
    )

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(dropX, dropY, { steps: 20 })
    await context.page.mouse.up()

    await expect(
      context.page.locator(
        '.list-section > [data-testid="item-row-note-usage"]'
      )
    ).toHaveCount(1)
    await expect(
      context.page
        .getByTestId('group-card-grp-notes-default')
        .getByTestId('item-row-note-usage')
    ).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('opens the item modal above the popup and saves a new popup item', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('folder-widget-grp-folders-work').click()
    await expect(context.page.locator('.widget-popup')).toBeVisible()

    await context.page.locator('.widget-popup .widget-popup-action').click()

    await expect(context.page.getByTestId('modal-item')).toBeVisible()
    await context.page.getByTestId('item-name-input').fill('PopupItem')
    await context.page.getByTestId('item-path-input').fill('C:\\PopupItem')
    await context.page.getByTestId('item-save').click()

    await expect(context.page.getByTestId('modal-item')).toHaveCount(0)
    await expect(context.page.locator('.widget-popup')).toBeVisible()
    await expect(context.page.locator('.widget-popup')).toContainText(
      'PopupItem'
    )
  } finally {
    await closeApp(context)
  }
})

test('keeps a grouped note in its group when it is released on its own slot', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()

    const source = context.page.getByTestId('item-row-note-usage')
    const box = await waitForStableBox(source)
    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2

    await context.page.mouse.move(x, y)
    await context.page.mouse.down()
    await context.page.mouse.move(x + 8, y + 2, { steps: 4 })
    await expect(context.page.locator('.drag-overlay-shell')).toBeVisible()
    await context.page.mouse.up()
    await context.page.waitForTimeout(400)

    await expect(
      context.page
        .getByTestId('group-card-grp-notes-default')
        .getByTestId('item-row-note-usage')
    ).toHaveCount(1)
    await expect(
      context.page.locator(
        '.list-section > [data-testid="item-row-note-usage"]'
      )
    ).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('does not start a drag for a pointer movement below the activation distance', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()

    const box = await waitForStableBox(
      context.page.getByTestId('item-row-note-usage')
    )
    const x = box!.x + box!.width / 2
    const y = box!.y + box!.height / 2

    await context.page.mouse.move(x, y)
    await context.page.mouse.down()
    await context.page.mouse.move(x + 5, y, { steps: 5 })
    await context.page.waitForTimeout(150)
    await expect(context.page.locator('.drag-overlay-shell')).toHaveCount(0)
    await context.page.mouse.move(x + 9, y, { steps: 4 })
    await expect(context.page.locator('.drag-overlay-shell')).toBeVisible()
    await context.page.mouse.up()
  } finally {
    await closeApp(context)
  }
})

test('keeps a grouped note in its group when it is released on the add button of its own group', async () => {
  const context = await launchApp()

  try {
    await context.page.getByTestId('tab-notes').click()

    const source = context.page.getByTestId('item-row-note-usage')
    const addButton = context.page
      .getByTestId('group-card-grp-notes-default')
      .locator('.group-add-button')
    const sourceBox = await waitForStableBox(source)
    const addBox = await waitForStableBox(addButton)

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 12 }
    )
    await context.page.mouse.up()
    await context.page.waitForTimeout(400)

    await expect(
      context.page
        .getByTestId('group-card-grp-notes-default')
        .getByTestId('item-row-note-usage')
    ).toHaveCount(1)
    await expect(
      context.page.locator(
        '.list-section > [data-testid="item-row-note-usage"]'
      )
    ).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('moves a grouped note to the end of its group when released in the blank cell after the last item', async () => {
  const context = await launchWithData((data) => {
    data.notes = [
      {
        id: 'grp-tail',
        name: 'Tail Group',
        icon: '📋',
        open: true,
        items: [makeNote('tail-1'), makeNote('tail-2'), makeNote('tail-3')],
      },
    ]
    data.topOrder.notes = [{ type: 'group', id: 'grp-tail' }]
  })

  try {
    await context.page.getByTestId('tab-notes').click()

    const first = await waitForStableBox(
      context.page.getByTestId('item-row-tail-1')
    )
    const second = await waitForStableBox(
      context.page.getByTestId('item-row-tail-2')
    )
    const third = await waitForStableBox(
      context.page.getByTestId('item-row-tail-3')
    )

    // Two columns: the third note opens a second row and leaves a blank cell.
    expect(second!.x).toBeGreaterThan(first!.x)
    expect(third!.y).toBeGreaterThan(first!.y)

    await context.page.mouse.move(
      first!.x + first!.width / 2,
      first!.y + first!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      third!.x + third!.width + 30,
      third!.y + third!.height / 2,
      { steps: 20 }
    )
    await context.page.mouse.up()

    await expect
      .poll(() =>
        attributesOf(
          context.page,
          '[data-testid="group-card-grp-tail"] .group-item-list > [data-list-item-id]',
          'data-list-item-id'
        )
      )
      .toEqual(['tail-2', 'tail-3', 'tail-1'])
  } finally {
    await closeApp(context)
  }
})

test('moves a grouped note into another group when released on its add-item button', async () => {
  const context = await launchWithData((data) => {
    data.notes = [
      {
        id: 'grp-from',
        name: 'From Group',
        icon: '📋',
        open: true,
        items: [makeNote('from-1'), makeNote('from-2')],
      },
      {
        id: 'grp-to',
        name: 'To Group',
        icon: '📋',
        open: true,
        items: [makeNote('to-1')],
      },
    ]
    data.topOrder.notes = [
      { type: 'group', id: 'grp-from' },
      { type: 'group', id: 'grp-to' },
    ]
  })

  try {
    await context.page.getByTestId('tab-notes').click()

    const source = context.page.getByTestId('item-row-from-1')
    const addButton = context.page
      .getByTestId('group-card-grp-to')
      .locator('.group-add-button')
    const sourceBox = await waitForStableBox(source)
    const addBox = await waitForStableBox(addButton)

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 20 }
    )
    await context.page.mouse.up()

    await expect
      .poll(() =>
        attributesOf(
          context.page,
          '[data-testid="group-card-grp-to"] .group-item-list > [data-list-item-id]',
          'data-list-item-id'
        )
      )
      .toEqual(['to-1', 'from-1'])
    await expect(
      context.page.locator('.list-section > [data-testid="item-row-from-1"]')
    ).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('moves a loose note into an open empty group when released on the group body', async () => {
  const context = await launchWithData((data) => {
    data.notes = [
      {
        id: 'grp-empty',
        name: 'Empty Group',
        icon: '📋',
        open: true,
        items: [],
      },
    ]
    data.loose.notes = [makeNote('loose-solo')]
    data.topOrder.notes = [
      { type: 'group', id: 'grp-empty' },
      { type: 'loose', id: 'loose-solo' },
    ]
  })

  try {
    await context.page.getByTestId('tab-notes').click()

    const source = context.page.getByTestId('item-row-loose-solo')
    const addButton = context.page
      .getByTestId('group-card-grp-empty')
      .locator('.group-add-button')
    const sourceBox = await waitForStableBox(source)
    const addBox = await waitForStableBox(addButton)

    await context.page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await context.page.mouse.down()
    await context.page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 20 }
    )
    await context.page.mouse.up()

    await expect(
      context.page
        .getByTestId('group-card-grp-empty')
        .getByTestId('item-row-loose-solo')
    ).toHaveCount(1)
    await expect(
      context.page.locator(
        '.list-section > [data-testid="item-row-loose-solo"]'
      )
    ).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('highlights the group under a loose note over any part of its card and drops it there', async () => {
  const context = await launchWithData((data) => {
    data.notes = [
      {
        id: 'grp-a',
        name: 'Group A',
        icon: '📋',
        open: true,
        items: [makeNote('a-1')],
      },
      {
        id: 'grp-b',
        name: 'Group B',
        icon: '📋',
        open: true,
        items: [makeNote('b-1')],
      },
    ]
    data.loose.notes = [makeNote('loose-solo')]
    data.topOrder.notes = [
      { type: 'group', id: 'grp-a' },
      { type: 'group', id: 'grp-b' },
      { type: 'loose', id: 'loose-solo' },
    ]
  })

  try {
    const { page } = context
    await page.getByTestId('tab-notes').click()

    const groupA = page.getByTestId('group-card-grp-a')
    const groupB = page.getByTestId('group-card-grp-b')
    const source = page.getByTestId('item-row-loose-solo')
    const sourceBox = await waitForStableBox(source)
    const itemBox = await waitForStableBox(page.getByTestId('item-row-b-1'))
    const addBox = await waitForStableBox(groupB.locator('.group-add-button'))

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await page.mouse.down()

    // The blank add-item part of the card: no header band, no item row.
    await page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 20 }
    )
    await expect(groupB).toHaveClass(/folder-drop/)
    await expect(groupA).not.toHaveClass(/folder-drop/)
    await expect(page.locator('.folder-drop')).toHaveCount(1)

    // An item row of the group is a drop into that group too.
    await page.mouse.move(
      itemBox!.x + itemBox!.width / 2,
      itemBox!.y + itemBox!.height / 2,
      { steps: 6 }
    )
    await expect(groupB).toHaveClass(/folder-drop/)
    await expect(page.locator('.folder-drop')).toHaveCount(1)

    await page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 6 }
    )
    await expect(groupB).toHaveClass(/folder-drop/)
    await page.mouse.up()

    await expect
      .poll(() =>
        attributesOf(
          page,
          '[data-testid="group-card-grp-b"] .group-item-list > [data-list-item-id]',
          'data-list-item-id'
        )
      )
      .toEqual(['b-1', 'loose-solo'])
    await expect(
      page.locator('.list-section > [data-testid="item-row-loose-solo"]')
    ).toHaveCount(0)
    await expect(page.locator('.folder-drop')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('shows no group highlight while a whole group is dragged over another group header', async () => {
  const context = await launchWithData((data) => {
    data.notes = [
      {
        id: 'grp-a',
        name: 'Group A',
        icon: '📋',
        open: false,
        items: [makeNote('a-1')],
      },
      {
        id: 'grp-b',
        name: 'Group B',
        icon: '📋',
        open: false,
        items: [makeNote('b-1')],
      },
    ]
    data.topOrder.notes = [
      { type: 'group', id: 'grp-a' },
      { type: 'group', id: 'grp-b' },
    ]
  })

  try {
    const { page } = context
    await page.getByTestId('tab-notes').click()

    const sourceBox = await waitForStableBox(
      page.getByTestId('group-card-grp-a').locator('.group-card-header')
    )
    const targetBox = await waitForStableBox(
      page.getByTestId('group-card-grp-b').locator('.group-card-header')
    )

    await page.mouse.move(
      sourceBox!.x + 60,
      sourceBox!.y + sourceBox!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height * 0.64,
      { steps: 20 }
    )
    await expect(page.locator('.drag-overlay-shell')).toBeVisible()
    // The highlight follows the pointer synchronously: give it time to show.
    await page.waitForTimeout(250)
    await expect(page.locator('.folder-drop')).toHaveCount(0)

    await page.mouse.up()

    // A group drag only reorders: both groups stay top-level entries.
    await expect
      .poll(() =>
        attributesOf(
          page,
          '.list-section > [data-top-entry-type="group"]',
          'data-top-entry-id'
        )
      )
      .toEqual(['grp-b', 'grp-a'])
  } finally {
    await closeApp(context)
  }
})

test('highlights only another group, never the own one, while a grouped note is dragged', async () => {
  const context = await launchWithData((data) => {
    data.notes = [
      {
        id: 'grp-from',
        name: 'From Group',
        icon: '📋',
        open: true,
        items: [makeNote('from-1'), makeNote('from-2')],
      },
      {
        id: 'grp-to',
        name: 'To Group',
        icon: '📋',
        open: true,
        items: [makeNote('to-1')],
      },
    ]
    data.topOrder.notes = [
      { type: 'group', id: 'grp-from' },
      { type: 'group', id: 'grp-to' },
    ]
  })

  try {
    const { page } = context
    await page.getByTestId('tab-notes').click()

    const ownHeaderBox = await waitForStableBox(
      page.getByTestId('group-card-grp-from').locator('.group-card-header')
    )
    const sourceBox = await waitForStableBox(
      page.getByTestId('item-row-from-1')
    )
    const addBox = await waitForStableBox(
      page.getByTestId('group-card-grp-to').locator('.group-add-button')
    )

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await page.mouse.down()

    // Over the centre of its own header: the drop would be a no-op.
    await page.mouse.move(
      ownHeaderBox!.x + ownHeaderBox!.width / 2,
      ownHeaderBox!.y + ownHeaderBox!.height / 2,
      { steps: 12 }
    )
    await expect(page.locator('.drag-overlay-shell')).toBeVisible()
    await page.waitForTimeout(250)
    await expect(page.locator('.folder-drop')).toHaveCount(0)

    await page.mouse.move(
      addBox!.x + addBox!.width / 2,
      addBox!.y + addBox!.height / 2,
      { steps: 20 }
    )
    await expect(page.getByTestId('group-card-grp-to')).toHaveClass(
      /folder-drop/
    )
    await expect(page.locator('.folder-drop')).toHaveCount(1)
    await page.mouse.up()

    await expect
      .poll(() =>
        attributesOf(
          page,
          '[data-testid="group-card-grp-to"] .group-item-list > [data-list-item-id]',
          'data-list-item-id'
        )
      )
      .toEqual(['to-1', 'from-1'])
  } finally {
    await closeApp(context)
  }
})

const BEHIND = 30

test('keeps a popup item inside its folder when it is released on a non-item spot of the popup', async () => {
  const context = await launchWithData((data) => {
    // Enough top-level entries for a grid that reaches down behind the popup, whatever the height of
    // the bars above it and of the tiles in it.
    data.loose.folders = Array.from({ length: BEHIND }, (_, index) =>
      makeFolder(`behind-${index}`)
    )
    data.topOrder.folders.push(
      ...data.loose.folders.map((item) => ({
        type: 'loose' as const,
        id: item.id,
      }))
    )
  })

  try {
    const { page } = context
    const popup = page.locator('.widget-popup')
    const source = popup.getByTestId('grid-item-folder-desktop')
    const looseWidgets = page.locator(
      '.widget-grid [data-testid^="loose-widget-"]'
    )

    await page.getByTestId('folder-widget-grp-folders-work').click()
    await expect(popup).toBeVisible()
    await waitForStableBox(popup)

    // (a) a jitter of a few pixels over the item's own slot
    const sourceBox = await waitForStableBox(source)
    const gridBox = await page.locator('.widget-grid').boundingBox()
    const x = sourceBox!.x + sourceBox!.width / 2
    const y = sourceBox!.y + sourceBox!.height / 2

    // Precondition: the grid really lies behind this spot.
    expect(x + 8).toBeGreaterThan(gridBox!.x)
    expect(x + 8).toBeLessThan(gridBox!.x + gridBox!.width)
    expect(y).toBeGreaterThan(gridBox!.y)
    expect(y).toBeLessThan(gridBox!.y + gridBox!.height)

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 8, y, { steps: 5 })
    await expect(page.locator('.drag-overlay-shell')).toBeVisible()
    await page.mouse.up()
    await page.waitForTimeout(400)

    await expect(popup).toBeVisible()
    await expect(popup.getByTestId('grid-item-folder-desktop')).toHaveCount(1)
    await expect(looseWidgets).toHaveCount(BEHIND)

    // (b) dropping on the add cell of the popup
    const addBox = await waitForStableBox(popup.locator('.grid-add'))
    const addX = addBox!.x + addBox!.width / 2
    const addY = addBox!.y + addBox!.height / 2

    expect(addX).toBeGreaterThan(gridBox!.x)
    expect(addX).toBeLessThan(gridBox!.x + gridBox!.width)
    expect(addY).toBeGreaterThan(gridBox!.y)
    expect(addY).toBeLessThan(gridBox!.y + gridBox!.height)

    // The pointer has rested on the tile by now, so its buttons are up, and on a 44px tile they cover
    // the right half: take hold of the icon.
    const restBox = await waitForStableBox(source.locator('.grid-ico'))
    await page.mouse.move(
      restBox!.x + restBox!.width / 2,
      restBox!.y + restBox!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(addX, addY, { steps: 15 })
    await expect(page.locator('.drag-overlay-shell')).toBeVisible()
    await page.mouse.up()
    await page.waitForTimeout(400)

    await expect(popup).toBeVisible()
    await expect(popup.getByTestId('grid-item-folder-desktop')).toHaveCount(1)
    await expect(
      page.locator('.widget-grid [data-testid="loose-widget-folder-desktop"]')
    ).toHaveCount(0)
    await expect(looseWidgets).toHaveCount(BEHIND)
  } finally {
    await closeApp(context)
  }
})

test('still moves a popup item out to the grid when it is released outside the popup', async () => {
  const context = await launchWithData((data) => {
    data.loose.folders = Array.from({ length: 6 }, (_, index) =>
      makeFolder(`behind-${index}`)
    )
    data.topOrder.folders.push(
      ...data.loose.folders.map((item) => ({
        type: 'loose' as const,
        id: item.id,
      }))
    )
  })

  try {
    const { page } = context
    const popup = page.locator('.widget-popup')

    await page.getByTestId('folder-widget-grp-folders-work').click()
    await expect(popup).toBeVisible()

    const popupBox = await waitForStableBox(popup)
    const sourceBox = await waitForStableBox(
      popup.getByTestId('grid-item-folder-desktop')
    )
    const gridBox = await page.locator('.widget-grid').boundingBox()
    const secondRowBox = await page
      .getByTestId('loose-widget-behind-2')
      .boundingBox()
    // The overlay margin left of the popup, still above the grid's second row.
    const outsideX = (popupBox!.x + gridBox!.x) / 2
    const outsideY = secondRowBox!.y + secondRowBox!.height / 2

    expect(outsideX).toBeLessThan(popupBox!.x)
    expect(outsideX).toBeGreaterThan(gridBox!.x)

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(outsideX, outsideY, { steps: 15 })
    await page.mouse.up()

    await expect(
      page.locator('.widget-grid [data-testid="loose-widget-folder-desktop"]')
    ).toHaveCount(1)
    await expect(popup).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('drops a note on the item under the pointer after the list auto-scrolled', async () => {
  const context = await launchWithData((data) => {
    data.loose.notes = Array.from({ length: 30 }, (_, index) =>
      makeNote(`scroll-note-${index}`)
    )
    data.topOrder.notes.push(
      ...data.loose.notes.map((item) => ({
        type: 'loose' as const,
        id: item.id,
      }))
    )
  })

  try {
    const { page } = context
    await page.getByTestId('tab-notes').click()

    const section = page.getByTestId('section-notes')
    const source = page.getByTestId('item-row-scroll-note-0')
    const sectionBox = await waitForStableBox(section)
    const sourceBox = await waitForStableBox(source)

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    )
    await page.mouse.down()
    // Hold the pointer in the lower auto-scroll zone until the list moved.
    await page.mouse.move(
      sourceBox!.x + 40,
      sectionBox!.y + sectionBox!.height - 12,
      { steps: 15 }
    )
    await expect
      .poll(() => section.evaluate((node) => node.scrollTop), {
        timeout: 8000,
      })
      .toBeGreaterThan(250)

    // Park the pointer in the middle of the viewport (stops auto-scrolling)
    // and wait for the list to settle.
    await page.mouse.move(
      sourceBox!.x + 40,
      sectionBox!.y + sectionBox!.height / 2,
      { steps: 10 }
    )
    expect(await waitForStableScroll(section)).toBeGreaterThan(250)

    const targetId = await page
      .locator('.list-section > [data-top-entry-type="loose"]')
      .evaluateAll(
        (nodes, area) => {
          const middle = area.y + area.height / 2
          const candidates = nodes
            .map((node) => ({
              id: node.getAttribute('data-top-entry-id'),
              rect: node.getBoundingClientRect(),
            }))
            .filter(
              ({ id, rect }) =>
                id !== 'scroll-note-0' &&
                rect.top > area.y + 60 &&
                rect.bottom < area.y + area.height - 60 &&
                rect.top < middle
            )

          return candidates[candidates.length - 1]?.id ?? null
        },
        { y: sectionBox!.y, height: sectionBox!.height }
      )
    expect(targetId).not.toBeNull()

    const targetBox = await page
      .getByTestId(`item-row-${targetId}`)
      .boundingBox()
    await page.mouse.move(
      targetBox!.x + 24,
      targetBox!.y + targetBox!.height / 2,
      { steps: 8 }
    )
    await page.mouse.up()

    const expected = Array.from(
      { length: 30 },
      (_, index) => `scroll-note-${index}`
    ).filter((id) => id !== 'scroll-note-0')
    expected.splice(expected.indexOf(targetId!), 0, 'scroll-note-0')

    await expect
      .poll(() =>
        attributesOf(
          page,
          '.list-section > [data-top-entry-type="loose"]',
          'data-top-entry-id'
        )
      )
      .toEqual(expected)
  } finally {
    await closeApp(context)
  }
})

test('keeps the grid drop on the entry under the pointer when the content scrolls during a drag', async () => {
  const context = await launchWithData((data) => {
    // 44 px tiles: it takes this many for the grid to be taller than the window.
    data.loose.folders = Array.from({ length: 100 }, (_, index) =>
      makeFolder(`scroll-folder-${index}`)
    )
    data.topOrder.folders.push(
      ...data.loose.folders.map((item) => ({
        type: 'loose' as const,
        id: item.id,
      }))
    )
  })

  try {
    const { page } = context
    const section = page.getByTestId('section-folders')
    const box = (index: number) =>
      waitForStableBox(
        page
          .getByTestId(`loose-widget-scroll-folder-${index}`)
          .locator('.widget-loose-box')
      )

    // Two folder widgets and the loose widgets share four columns, so loose
    // widgets 4 and 8 sit in the same column, one row apart.
    const dragged = await box(0)
    const rowAbove = await box(4)
    const rowBelow = await box(8)
    const pitch = rowBelow!.y - rowAbove!.y

    expect(pitch).toBeGreaterThan(40)

    const pointer = {
      x: rowAbove!.x + rowAbove!.width * 0.25,
      y: rowAbove!.y + rowAbove!.height / 2,
    }

    await page.mouse.move(
      dragged!.x + dragged!.width / 2,
      dragged!.y + dragged!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(pointer.x, pointer.y, { steps: 15 })
    await expect(page.getByTestId('loose-widget-scroll-folder-4')).toHaveClass(
      /drop-before/
    )

    // A real wheel event never reaches the section during a drag (dnd-kit's
    // overlay wrapper sits under the pointer), so scroll it directly: the
    // scroll offset reaches dnd-kit's delta the same way.
    await section.evaluate((node, amount) => {
      node.scrollTop += amount
    }, pitch)
    expect(await waitForStableScroll(section)).toBeGreaterThan(pitch / 2)

    // The entry that is now under the stationary pointer is the drop target.
    await expect(page.getByTestId('loose-widget-scroll-folder-8')).toHaveClass(
      /drop-before/
    )
    await page.mouse.up()

    const expected = Array.from(
      { length: 100 },
      (_, index) => `loose-widget-scroll-folder-${index}`
    ).filter((id) => id !== 'loose-widget-scroll-folder-0')
    expected.splice(
      expected.indexOf('loose-widget-scroll-folder-8'),
      0,
      'loose-widget-scroll-folder-0'
    )

    await expect
      .poll(() =>
        attributesOf(
          page,
          '.widget-grid > [data-top-entry-type="loose"]',
          'data-testid'
        )
      )
      .toEqual(expected)
  } finally {
    await closeApp(context)
  }
})

test('auto-scrolls the grid while dragging near its bottom edge', async () => {
  // 44px tiles: this many fill the section several times over, in two columns or in four.
  const count = 120
  const context = await launchWithData((data) => {
    data.loose.folders = Array.from({ length: count }, (_, index) =>
      makeFolder(`edge-folder-${index}`)
    )
    data.topOrder.folders.push(
      ...data.loose.folders.map((item) => ({
        type: 'loose' as const,
        id: item.id,
      }))
    )
  })

  try {
    const { page } = context
    const section = page.getByTestId('section-folders')
    const sectionBox = await waitForStableBox(section)
    const source = await waitForStableBox(
      page
        .getByTestId('loose-widget-edge-folder-0')
        .locator('.widget-loose-box')
    )

    await page.mouse.move(
      source!.x + source!.width / 2,
      source!.y + source!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      source!.x + source!.width / 2,
      sectionBox!.y + sectionBox!.height - 12,
      { steps: 15 }
    )
    await expect
      .poll(() => section.evaluate((node) => node.scrollTop), { timeout: 8000 })
      .toBeGreaterThan(150)

    await page.mouse.move(
      source!.x + source!.width / 2,
      sectionBox!.y + sectionBox!.height / 2,
      { steps: 10 }
    )
    await waitForStableScroll(section)

    const targetId = await page
      .locator('.widget-grid > [data-top-entry-type="loose"]')
      .evaluateAll(
        (nodes, area) => {
          const candidates = nodes
            .map((node) => ({
              id: node.getAttribute('data-top-entry-id'),
              box: node
                .querySelector('.widget-loose-box')!
                .getBoundingClientRect(),
            }))
            .filter(
              ({ id, box }) =>
                id !== 'edge-folder-0' &&
                box.top > area.y + 60 &&
                box.bottom < area.y + area.height - 60
            )

          return candidates[0]?.id ?? null
        },
        { y: sectionBox!.y, height: sectionBox!.height }
      )
    expect(targetId).not.toBeNull()

    const targetBox = await page
      .getByTestId(`loose-widget-${targetId}`)
      .locator('.widget-loose-box')
      .boundingBox()
    await page.mouse.move(
      targetBox!.x + targetBox!.width * 0.25,
      targetBox!.y + targetBox!.height / 2,
      { steps: 8 }
    )
    await page.mouse.up()

    const expected = Array.from(
      { length: count },
      (_, index) => `edge-folder-${index}`
    ).filter((id) => id !== 'edge-folder-0')
    expected.splice(expected.indexOf(targetId!), 0, 'edge-folder-0')

    await expect
      .poll(() =>
        attributesOf(
          page,
          '.widget-grid > [data-top-entry-type="loose"]',
          'data-top-entry-id'
        )
      )
      .toEqual(expected)
  } finally {
    await closeApp(context)
  }
})

test('auto-scrolls the folder popup and drops on the item under the pointer', async () => {
  // 44px tiles in two or three columns: this many overflow the popup.
  const count = 90
  const context = await launchWithData((data) => {
    data.folders[0]!.items = Array.from({ length: count }, (_, index) =>
      makeFolder(`pop-item-${index}`)
    )
  })

  try {
    const { page } = context
    await page.getByTestId('folder-widget-grp-folders-work').click()
    const grid = page.locator('.widget-popup .grid-view')
    await expect(grid).toBeVisible()
    const gridBox = await waitForStableBox(grid)
    const source = await waitForStableBox(
      page.locator('.widget-popup').getByTestId('grid-item-pop-item-0')
    )

    await page.mouse.move(
      source!.x + source!.width / 2,
      source!.y + source!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      source!.x + source!.width / 2,
      gridBox!.y + gridBox!.height - 8,
      { steps: 15 }
    )
    await expect
      .poll(() => grid.evaluate((node) => node.scrollTop), { timeout: 8000 })
      .toBeGreaterThan(120)

    await page.mouse.move(
      source!.x + source!.width / 2,
      gridBox!.y + gridBox!.height / 2,
      { steps: 10 }
    )
    await waitForStableScroll(grid)

    const targetId = await page
      .locator('.widget-popup .grid-view > [data-popup-item-id]')
      .evaluateAll(
        (nodes, area) => {
          const candidates = nodes
            .map((node) => ({
              id: node.getAttribute('data-popup-item-id'),
              rect: node.getBoundingClientRect(),
            }))
            .filter(
              ({ id, rect }) =>
                id !== 'pop-item-0' &&
                rect.top > area.y + 20 &&
                rect.bottom < area.y + area.height - 20
            )

          return candidates[candidates.length - 1]?.id ?? null
        },
        { y: gridBox!.y, height: gridBox!.height }
      )
    expect(targetId).not.toBeNull()

    const targetBox = await page
      .locator(`.widget-popup [data-popup-item-id="${targetId}"]`)
      .boundingBox()
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 8 }
    )
    await page.mouse.up()

    // reorderItems moves the dragged item onto the target's index.
    const original = Array.from(
      { length: count },
      (_, index) => `pop-item-${index}`
    )
    const expected = original.filter((id) => id !== 'pop-item-0')
    expected.splice(original.indexOf(targetId!), 0, 'pop-item-0')

    await expect
      .poll(() =>
        attributesOf(
          page,
          '.widget-popup .grid-view > [data-popup-item-id]',
          'data-popup-item-id'
        )
      )
      .toEqual(expected)
  } finally {
    await closeApp(context)
  }
})
