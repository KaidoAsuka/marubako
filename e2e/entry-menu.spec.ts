// Iteration 5 (package "settings", flow-7): a right-click menu on entries and groups (a native menu from the
// main process) with rename (F2), move to a group and delete (Del), so that moving needs no dragging, and
// the keys F2, Delete and Shift+F10 on a focused tile.
//
// A native menu cannot be clicked through the page, so these tests replace Menu.prototype.popup in the
// main process: it records the menu it was asked to show and, when told to, "clicks" one of its items.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { AppData, FolderItem } from '../src/shared/types'
import {
  createDefaultAppData,
  closeApp,
  launchApp,
  type AppContext,
} from './test-utils'

function folder(id: string, name: string): FolderItem {
  return { id, kind: 'folder', name, icon: '📁', path: `C:\\Work\\${name}` }
}

function seed(configure: (data: AppData) => void = () => {}): AppData {
  const data = createDefaultAppData()
  data.folders = [
    {
      id: 'g-work',
      name: 'Work',
      icon: '💼',
      open: true,
      items: [folder('w1', 'Work one'), folder('w2', 'Work two')],
    },
    {
      id: 'g-home',
      name: 'Home',
      icon: '🏠',
      open: true,
      items: [folder('h1', 'Home one')],
    },
  ]
  data.loose.folders = [folder('l1', 'Loose one'), folder('l2', 'Loose two')]
  data.topOrder.folders = [
    { type: 'loose', id: 'l1' },
    { type: 'group', id: 'g-work' },
    { type: 'group', id: 'g-home' },
    { type: 'loose', id: 'l2' },
  ]
  data.loose.passwords = [
    {
      id: 'p1',
      kind: 'password',
      name: 'Mail login',
      icon: 'K',
      username: 'me@example.com',
      password: 'hunter2-secret',
      note: '',
    },
  ]
  configure(data)

  return data
}

type RecordedMenu = {
  items: string[]
  submenus: Record<string, string[]>
  x: number | undefined
  y: number | undefined
}

async function launchWith(
  configure?: (data: AppData) => void
): Promise<AppContext> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-menu-'))
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(seed(configure)),
    'utf8'
  )
  const context = await launchApp(userDataDir)
  await context.page.emulateMedia({ reducedMotion: 'reduce' })
  // Stand in for the operating system's menu.
  await context.electronApp.evaluate(({ Menu }) => {
    type Item = {
      label: string
      type: string
      enabled: boolean
      accelerator?: unknown
      submenu?: { items: Item[] }
      click: () => void
    }
    const record = globalThis as typeof globalThis & {
      menus: unknown[]
      pick: string[] | null
    }
    record.menus = []
    record.pick = null
    Menu.prototype.popup = function (options?: {
      x?: number
      y?: number
      callback?: () => void
    }) {
      const items = (this as unknown as { items: Item[] }).items
      const text = (item: Item) =>
        item.type === 'separator'
          ? '---'
          : `${item.label}${item.accelerator ? ` [${String(item.accelerator)}]` : ''}${
              item.enabled === false ? ' (disabled)' : ''
            }`
      const submenus: Record<string, string[]> = {}
      for (const item of items)
        if (item.submenu) submenus[item.label] = item.submenu.items.map(text)
      record.menus.push({
        items: items.map(text),
        submenus,
        x: options?.x,
        y: options?.y,
      })
      const path = record.pick
      record.pick = null
      if (path) {
        let level = items
        let chosen: Item | undefined
        for (const label of path) {
          chosen = level.find((item) => item.label === label)
          level = chosen?.submenu?.items ?? []
        }
        chosen?.click()
      }
      options?.callback?.()
    } as never
  })

  return context
}

/** The next menu shown will have this item (a path of labels for a submenu) chosen, or nothing. */
const pick = (context: AppContext, path: string[] | null) =>
  context.electronApp.evaluate((_electron, path) => {
    ;(globalThis as typeof globalThis & { pick: string[] | null }).pick = path
  }, path)

const menus = (context: AppContext) =>
  context.electronApp.evaluate(
    () => (globalThis as typeof globalThis & { menus: RecordedMenu[] }).menus
  )

const strip = (page: Page) => page.locator('.feedback-strip[data-open]')

const looseTile = (page: Page, id: string) =>
  page.getByTestId(`loose-widget-${id}`)

test('right-click on a standalone entry shows launch, rename (F2), move to and delete (Del)', async () => {
  const context = await launchWith()
  try {
    const { page } = context

    await looseTile(page, 'l1').click({ button: 'right' })

    await expect.poll(async () => (await menus(context)).length).toBe(1)
    const [menu] = await menus(context)
    expect(menu!.items).toEqual([
      '打开',
      '---',
      '重命名 / 编辑… [F2]',
      '移到分组',
      '---',
      '删除 [Delete]',
    ])
    // Every group is a place to go; the entry is not in one, so there is no "standalone".
    expect(menu!.submenus['移到分组']).toEqual(['Work', 'Home'])
    // Nothing was chosen, nothing happened.
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect(looseTile(page, 'l1')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('moves a standalone entry into a group from the menu, says where, and undoes it', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await pick(context, ['移到分组', 'Work'])

    await looseTile(page, 'l1').click({ button: 'right' })

    await expect(looseTile(page, 'l1')).toHaveCount(0)
    await expect(strip(page)).toContainText('已移到「Work」')
    // It is in the group now: the popup lists it.
    await page.getByTestId('folder-widget-g-work').click()
    await expect(page.getByTestId('grid-item-l1')).toBeVisible()
    await page.keyboard.press('Escape')

    await strip(page).getByRole('button', { name: '撤销' }).click()

    await expect(looseTile(page, 'l1')).toBeVisible()
    // Back at the front, where it was.
    const order = await page
      .locator('[data-top-entry-id]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-top-entry-id'))
      )
    expect(order[0]).toBe('l1')
  } finally {
    await closeApp(context)
  }
})

test('moves an entry out of a group, from inside the group popup', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await page.getByTestId('folder-widget-g-work').click()
    await expect(page.getByTestId('grid-item-w1')).toBeVisible()

    await page.getByTestId('grid-item-w1').click({ button: 'right' })
    await expect.poll(async () => (await menus(context)).length).toBe(1)
    const [menu] = await menus(context)
    // Out of the group, or into the other one; never into the group it is in.
    expect(menu!.submenus['移到分组']).toEqual(['独立条目', 'Home'])

    await pick(context, ['移到分组', '独立条目'])
    await page.getByTestId('grid-item-w1').click({ button: 'right' })

    await expect(page.getByTestId('grid-item-w1')).toHaveCount(0)
    await expect(strip(page)).toContainText('已移到「独立条目」')
    await page.keyboard.press('Escape')
    await expect(looseTile(page, 'w1')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('moves an entry from one group to another in the list view', async () => {
  const context = await launchWith((data) => {
    data.prefs.viewMode = 'list'
  })
  try {
    const { page } = context
    await pick(context, ['移到分组', 'Home'])

    await page.getByTestId('item-row-w2').click({ button: 'right' })

    await expect(strip(page)).toContainText('已移到「Home」')
    const rows = (group: string) =>
      page
        .getByTestId(`group-card-${group}`)
        .locator('[data-list-item-id]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-list-item-id'))
        )
    await expect.poll(() => rows('g-work')).toEqual(['w1'])
    await expect.poll(() => rows('g-home')).toEqual(['h1', 'w2'])
  } finally {
    await closeApp(context)
  }
})

test('deletes from the menu at once, with the undo in the strip', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await pick(context, ['删除'])

    await looseTile(page, 'l2').click({ button: 'right' })

    await expect(looseTile(page, 'l2')).toHaveCount(0)
    await expect(strip(page)).toContainText('已删除「Loose two」')
    await strip(page).getByRole('button', { name: '撤销' }).click()
    await expect(looseTile(page, 'l2')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('renames from the menu: the editor opens on the name', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await pick(context, ['重命名 / 编辑…'])

    await looseTile(page, 'l1').click({ button: 'right' })

    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('item-name-input')).toHaveValue('Loose one')
    await expect(page.getByTestId('item-name-input')).toBeFocused()
  } finally {
    await closeApp(context)
  }
})

test('a group has open, rename and delete; rename opens the group form', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await pick(context, ['重命名…'])

    await page.getByTestId('folder-widget-g-home').click({ button: 'right' })

    const [menu] = await menus(context)
    expect(menu!.items).toEqual([
      '打开',
      '重命名… [F2]',
      '---',
      '删除 [Delete]',
    ])
    await expect(page.getByTestId('modal-group')).toBeVisible()
    await expect(page.getByTestId('group-name-input')).toHaveValue('Home')
  } finally {
    await closeApp(context)
  }
})

test('deleting a group that holds entries asks first', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await pick(context, ['删除'])

    await page.getByTestId('folder-widget-g-work').click({ button: 'right' })

    await expect(page.getByTestId('modal-confirm')).toBeVisible()
    await expect(page.getByTestId('modal-card')).toContainText('Work')
    await expect(page.getByTestId('folder-widget-g-work')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('copies the password of an entry from the menu', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await page.evaluate(() => {
      const record = globalThis as typeof globalThis & { copied: string[] }
      record.copied = []
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            record.copied.push(value)
          },
        },
      })
    })
    await page.getByTestId('tab-passwords').click()
    await pick(context, ['复制密码'])

    await page.getByTestId('item-row-p1').click({ button: 'right' })

    await expect(strip(page)).toContainText('密码已复制')
    expect(
      await page.evaluate(
        () => (globalThis as typeof globalThis & { copied: string[] }).copied
      )
    ).toEqual(['hunter2-secret'])
  } finally {
    await closeApp(context)
  }
})

test('the space between entries has no menu', async () => {
  const context = await launchWith()
  try {
    const { page } = context

    await page.getByTestId('section-folders').click({
      button: 'right',
      position: { x: 5, y: 400 },
    })

    expect(await menus(context)).toEqual([])
  } finally {
    await closeApp(context)
  }
})

test('F2 renames and Delete deletes the focused entry', async () => {
  const context = await launchWith()
  try {
    const { page } = context

    await looseTile(page, 'l1').focus()
    await page.keyboard.press('F2')
    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('item-name-input')).toHaveValue('Loose one')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    await looseTile(page, 'l2').focus()
    await page.keyboard.press('Delete')
    await expect(looseTile(page, 'l2')).toHaveCount(0)
    await expect(strip(page)).toContainText('已删除「Loose two」')
    // Ctrl+Z is the other way back.
    await page.keyboard.press('Control+z')
    await expect(looseTile(page, 'l2')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('F2 and Delete leave a text field alone', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await looseTile(page, 'l1').focus()
    await page.keyboard.press('F2')
    await page.getByTestId('item-name-input').press('Delete')
    await page.getByTestId('item-name-input').press('F2')

    await expect(page.getByTestId('modal-item')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(looseTile(page, 'l1')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('Shift+F10 and the menu key open the menu at the focused entry', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    const tile = looseTile(page, 'l1')
    await tile.focus()
    const box = (await tile.boundingBox())!

    await page.keyboard.press('Shift+F10')
    await expect.poll(async () => (await menus(context)).length).toBe(1)
    await page.keyboard.press('ContextMenu')
    await expect.poll(async () => (await menus(context)).length).toBe(2)

    for (const menu of await menus(context)) {
      expect(menu.items[0]).toBe('打开')
      // Opened at the lower left of the tile, in window pixels.
      expect(menu.x).toBeGreaterThanOrEqual(Math.round(box.x))
      expect(menu.x).toBeLessThanOrEqual(Math.round(box.x + box.width))
      expect(Math.abs(menu.y! - (box.y + box.height))).toBeLessThanOrEqual(8)
    }
  } finally {
    await closeApp(context)
  }
})

test('the keyboard position is right at a zoom other than 100%', async () => {
  const context = await launchWith((data) => {
    data.prefs.zoom = 1.25
  })
  try {
    const { page } = context
    const tile = looseTile(page, 'l1')
    await tile.focus()
    const box = (await tile.boundingBox())!

    await page.keyboard.press('Shift+F10')
    await expect.poll(async () => (await menus(context)).length).toBe(1)

    const [menu] = await menus(context)
    expect(menu!.x).toBeGreaterThanOrEqual(Math.round(box.x))
    expect(menu!.x).toBeLessThanOrEqual(Math.round(box.x + box.width))
    expect(Math.abs(menu!.y! - (box.y + box.height))).toBeLessThanOrEqual(8)
  } finally {
    await closeApp(context)
  }
})

test('a menu cannot be asked for by anything but the panel', async () => {
  const context = await launchWith()
  try {
    // The ball is a window of its own: it may not pop menus up through this channel.
    const answer = await context.electronApp.evaluate(
      async ({ BrowserWindow }) => {
        const ball = BrowserWindow.getAllWindows().find(
          (window) => !window.isResizable()
        )
        if (!ball) return 'no ball'
        return ball.webContents.executeJavaScript(
          `window.quickLaunch.showContextMenu([{ id: 'x', label: 'X' }]).then((r) => JSON.stringify(r))`
        )
      }
    )

    expect(answer).toContain('"ok":false')
    expect(await menus(context)).toEqual([])
  } finally {
    await closeApp(context)
  }
})
