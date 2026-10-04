// Iteration 5 (package "settings", collection-ui-5 and flow-6): in the global search Enter does the right
// thing for the kind of entry (launch, or copy for a command, a note and a password), Shift+Enter or the
// pencil edits, Alt+number jumps, and an empty query lists what was used lately.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { AppData } from '../src/shared/types'
import {
  createDefaultAppData,
  closeApp,
  launchApp,
  type AppContext,
} from './test-utils'

const SCRIPT = 'Get-ChildItem | Sort-Object Length'

function seed(configure: (data: AppData) => void = () => {}): AppData {
  const data = createDefaultAppData()
  data.loose.commands = [
    {
      id: 'cmd-zeta',
      kind: 'command',
      name: 'Zeta command',
      icon: 'C',
      content: SCRIPT,
      language: 'powershell',
      description: 'list files by size',
    },
  ]
  data.loose.notes = [
    {
      id: 'note-zeta',
      kind: 'note',
      name: 'Zeta note',
      icon: 'N',
      content: 'remember the milk',
    },
  ]
  data.loose.passwords = [
    {
      id: 'pw-zeta',
      kind: 'password',
      name: 'Zeta login',
      icon: 'P',
      username: 'zeta@example.com',
      password: 'hunter2-secret',
      note: 'private hint',
    },
  ]
  configure(data)

  return data
}

async function launchWith(
  configure?: (data: AppData) => void
): Promise<AppContext> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-palette-'))
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(seed(configure)),
    'utf8'
  )
  const context = await launchApp(userDataDir)
  await context.page.emulateMedia({ reducedMotion: 'reduce' })
  await context.page.evaluate(() => {
    const record = globalThis as typeof globalThis & { copiedValues: string[] }
    record.copiedValues = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          record.copiedValues.push(value)
        },
      },
    })
  })

  return context
}

const copied = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as typeof globalThis & { copiedValues: string[] })
        .copiedValues
  )

const palette = (page: Page) => page.getByTestId('command-palette')

async function openSearch(page: Page, query?: string): Promise<void> {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-input')).toBeFocused()
  if (query !== undefined) await page.getByTestId('command-input').fill(query)
}

test('Enter copies a command, a note and a password, says so, and closes the search', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    const strip = page.locator('.feedback-strip[data-open]')

    await openSearch(page, 'Zeta command')
    await expect(page.getByRole('option')).toHaveCount(1)
    await expect(page.getByRole('option')).toContainText('复制')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toHaveCount(0)
    await expect(strip).toContainText('已复制')
    // Copying is not editing: no editor opened, and the page stays where it was.
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    expect(await copied(page)).toEqual([SCRIPT])

    await openSearch(page, 'Zeta note')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toHaveCount(0)
    expect(await copied(page)).toEqual([SCRIPT, 'remember the milk'])

    await openSearch(page, 'Zeta login')
    // The row says what Enter will copy; the password itself is nowhere in the list.
    await expect(page.getByRole('option')).toContainText('复制密码')
    await expect(page.getByRole('option')).toContainText('zeta@example.com')
    await expect(palette(page)).not.toContainText('hunter2-secret')
    await expect(palette(page)).not.toContainText('private hint')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toHaveCount(0)
    await expect(strip).toContainText('密码已复制')
    expect(await copied(page)).toEqual([
      SCRIPT,
      'remember the milk',
      'hunter2-secret',
    ])
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('the search does not find a password by its value', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await openSearch(page, 'hunter2')

    await expect(page.getByRole('option')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('Shift+Enter and the pencil open the editor instead, and nothing is copied', async () => {
  const context = await launchWith()
  try {
    const { page } = context

    await openSearch(page, 'Zeta command')
    await page.keyboard.press('Shift+Enter')
    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('item-name-input')).toHaveValue(
      'Zeta command'
    )
    await expect(palette(page)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    await openSearch(page, 'Zeta login')
    await page.getByTestId('command-edit-0').click()
    await expect(page.getByTestId('modal-item')).toBeVisible()
    await expect(page.getByTestId('item-name-input')).toHaveValue('Zeta login')
    await expect(page.getByTestId('tab-passwords')).toHaveClass(/active/)

    expect(await copied(page)).toEqual([])
  } finally {
    await closeApp(context)
  }
})

test('Alt+number does what Enter would on that row, and the digits show only while Alt is held', async () => {
  const context = await launchWith()
  try {
    const { page } = context
    await openSearch(page, 'Zeta')
    // Categories in order: login (passwords), command, note.
    await expect(page.getByRole('option')).toHaveCount(3)
    await expect(page.getByTestId('command-digit')).toHaveCount(0)

    await page.keyboard.down('Alt')
    await expect(page.getByTestId('command-digit')).toHaveCount(3)
    await expect(page.getByTestId('command-digit').first()).toHaveText('1')
    // Drawn, not just present: the default window is only 400 px wide.
    await expect(page.getByTestId('command-digit').first()).toBeVisible()
    await page.keyboard.up('Alt')
    await expect(page.getByTestId('command-digit')).toHaveCount(0)

    await page.keyboard.press('Alt+3')
    await expect(palette(page)).toHaveCount(0)
    expect(await copied(page)).toEqual(['remember the milk'])

    await openSearch(page, 'Zeta')
    await page.keyboard.press('Alt+1')
    expect(await copied(page)).toEqual(['remember the milk', 'hunter2-secret'])
  } finally {
    await closeApp(context)
  }
})

test('an empty search lists the category in front, then what was used lately, and no longer says "quick access"', async () => {
  const context = await launchWith()
  try {
    const { page } = context

    // Nothing used yet: the entries of the category in front (the folders of the sample data).
    await openSearch(page)
    await expect(page.getByTestId('command-caption')).toHaveText('当前分类')
    await expect(page.getByRole('option').first()).toContainText('桌面')
    await expect(palette(page)).not.toContainText('快捷访问')
    await page.keyboard.press('Escape')
    await expect(palette(page)).toHaveCount(0)

    await openSearch(page, 'Zeta note')
    await page.keyboard.press('Enter')
    await expect(palette(page)).toHaveCount(0)

    await openSearch(page)
    await expect(page.getByTestId('command-caption')).toHaveText('最近使用')
    await expect(page.getByRole('option')).toHaveCount(1)
    await expect(page.getByRole('option').first()).toContainText('Zeta note')

    // Enter on it copies it again, straight from the empty search.
    await page.keyboard.press('Enter')
    expect(await copied(page)).toEqual([
      'remember the milk',
      'remember the milk',
    ])
  } finally {
    await closeApp(context)
  }
})

test('the recent list survives a restart, and forgets an entry that was deleted', async () => {
  const first = await launchWith()
  const { userDataDir } = first
  try {
    await openSearch(first.page, 'Zeta note')
    await first.page.keyboard.press('Enter')
    await expect(palette(first.page)).toHaveCount(0)
  } finally {
    await closeApp(first, { cleanup: false })
  }

  const second = await launchApp(userDataDir)
  try {
    const { page } = second
    await openSearch(page)
    await expect(page.getByTestId('command-caption')).toHaveText('最近使用')
    await expect(page.getByRole('option').first()).toContainText('Zeta note')
    await page.keyboard.press('Escape')

    await page.getByTestId('tab-notes').click()
    await page.getByTestId('delete-item-note-zeta').click()
    await expect(page.getByTestId('item-row-note-zeta')).toHaveCount(0)

    await openSearch(page)
    // The deleted note is gone from the list; the category in front is listed instead.
    await expect(page.getByTestId('command-caption')).not.toHaveText('最近使用')
    await expect(palette(page)).not.toContainText('Zeta note')
  } finally {
    await closeApp(second)
  }
})

test.describe('after a launch from the keyboard', () => {
  async function launchWithFolder(hideAfterLaunch: boolean) {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-palette-dir-'))
    const context = await launchWith((data) => {
      data.prefs.hideAfterLaunch = hideAfterLaunch
      data.loose.folders = [
        {
          id: 'folder-zeta',
          kind: 'folder',
          name: 'Zeta folder',
          icon: 'F',
          path: folder,
        },
      ]
    })
    // Opening the folder for real would pop an Explorer window up: record the call instead.
    await context.electronApp.evaluate(({ shell }) => {
      const record = globalThis as typeof globalThis & { opened: string[] }
      record.opened = []
      shell.openPath = async (target: string) => {
        record.opened.push(target)
        return ''
      }
    })

    return { context, folder }
  }

  const panelVisible = (context: AppContext) =>
    context.electronApp.evaluate(({ BrowserWindow }) => {
      const panel = BrowserWindow.getAllWindows().find((window) =>
        window.isResizable()
      )!
      const ball = BrowserWindow.getAllWindows().find(
        (window) => !window.isResizable()
      )

      return { panel: panel.isVisible(), ball: ball?.isVisible() ?? false }
    })

  test('Enter launches, then folds the panel into the ball when the open-entry setting says so', async () => {
    const { context, folder } = await launchWithFolder(true)
    try {
      const { page } = context
      await openSearch(page, 'Zeta folder')
      await expect(page.getByRole('option')).toContainText('启动')

      await page.keyboard.press('Enter')

      await expect
        .poll(() =>
          context.electronApp.evaluate(
            () =>
              (globalThis as typeof globalThis & { opened: string[] }).opened
          )
        )
        .toEqual([folder])
      await expect
        .poll(() => panelVisible(context))
        .toEqual({
          panel: false,
          ball: true,
        })
    } finally {
      await closeApp(context)
    }
  })

  test('Alt+number launches the same way', async () => {
    const { context, folder } = await launchWithFolder(true)
    try {
      const { page } = context
      await openSearch(page, 'Zeta folder')

      await page.keyboard.press('Alt+1')

      await expect
        .poll(() =>
          context.electronApp.evaluate(
            () =>
              (globalThis as typeof globalThis & { opened: string[] }).opened
          )
        )
        .toEqual([folder])
      await expect
        .poll(() => panelVisible(context))
        .toMatchObject({
          panel: false,
        })
    } finally {
      await closeApp(context)
    }
  })

  test('leaves the panel where it is when the setting is off', async () => {
    const { context, folder } = await launchWithFolder(false)
    try {
      const { page } = context
      await openSearch(page, 'Zeta folder')

      await page.keyboard.press('Enter')

      await expect
        .poll(() =>
          context.electronApp.evaluate(
            () =>
              (globalThis as typeof globalThis & { opened: string[] }).opened
          )
        )
        .toEqual([folder])
      await expect(palette(page)).toHaveCount(0)
      expect((await panelVisible(context)).panel).toBe(true)
    } finally {
      await closeApp(context)
    }
  })
})
