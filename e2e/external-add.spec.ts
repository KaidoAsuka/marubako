import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { closeApp, launchApp, type AppContext } from './test-utils'

async function setClipboard(context: AppContext, text: string): Promise<void> {
  await context.electronApp.evaluate(({ clipboard }, value) => {
    clipboard.writeText(value)
  }, text)
}

type Entry = { name: string } & Record<string, string>

async function loose(
  page: Page,
  tab: 'folders' | 'websites' | 'apps'
): Promise<Entry[]> {
  const result = await page.evaluate(() => window.quickLaunch.loadData())
  if (!result.ok) throw new Error(result.error)
  return result.data.loose[tab] as Entry[]
}

/**
 * Drops files on the panel the way the browser reports a drop from Explorer: a DataTransfer whose
 * files are real files on disk (they come from a file input, so the app can ask for their paths).
 * What cannot be done here is the operating system's own drag, which only routes the same events.
 */
async function dropFiles(
  page: Page,
  files: string[],
  at = '.workspace-content'
): Promise<void> {
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.id = 'external-add-test-input'
    document.body.append(input)
  })
  await page.locator('#external-add-test-input').setInputFiles(files)
  await page.evaluate((selector) => {
    const input = document.querySelector<HTMLInputElement>(
      '#external-add-test-input'
    )!
    const data = new DataTransfer()
    for (const file of Array.from(input.files ?? [])) data.items.add(file)
    const target = document.querySelector(selector)!
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        })
      )
    }
    input.remove()
  }, at)
}

test('Ctrl+V on the panel adds a link from the clipboard, and the strip can undo it', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    await setClipboard(context, 'https://www.example.org/docs')

    await page.keyboard.press('Control+v')

    // The view followed it to the category it belongs to.
    await expect(page.getByTestId('section-websites')).toBeVisible()
    await expect(page.getByTestId('feedback-strip')).toContainText(
      '已添加「example.org」'
    )
    expect(await loose(page, 'websites')).toMatchObject([
      { name: 'example.org', url: 'https://www.example.org/docs' },
    ])

    await page.getByTestId('feedback-action').click()
    await expect
      .poll(async () => (await loose(page, 'websites')).length)
      .toBe(0)
  } finally {
    await closeApp(context)
  }
})

test('Ctrl+V adds a folder path (quoted, as Explorer copies it) and a program', async () => {
  const context = await launchApp()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-paste-'))
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const program = path.join(dir, 'Tool.exe')
    await fs.writeFile(program, 'MZ')

    await setClipboard(context, `"${dir}"`)
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('section-folders')).toBeVisible()
    await expect.poll(async () => (await loose(page, 'folders')).length).toBe(1)
    expect((await loose(page, 'folders'))[0]).toMatchObject({
      name: path.basename(dir),
      path: dir,
    })

    await setClipboard(context, `"${program}"`)
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('section-apps')).toBeVisible()
    await expect.poll(async () => (await loose(page, 'apps')).length).toBe(1)
    expect((await loose(page, 'apps'))[0]).toMatchObject({
      name: 'Tool',
      path: program,
    })

    // The same folder again is not added twice.
    await page.getByTestId('tab-folders').click()
    await setClipboard(context, dir.toLowerCase())
    await page.keyboard.press('Control+v')
    await expect(page.getByTestId('feedback-strip')).toContainText(
      '已经添加过了'
    )
    expect(await loose(page, 'folders')).toHaveLength(1)
  } finally {
    await closeApp(context)
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('Ctrl+V in a text field pastes into the field and adds nothing', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-notes').click()
    await page.getByTestId('add-loose-item-notes').click()
    await setClipboard(context, 'https://www.example.org/docs')

    await page.getByTestId('item-content-input').focus()
    await page.keyboard.press('Control+v')

    await expect(page.getByTestId('item-content-input')).toHaveValue(
      'https://www.example.org/docs'
    )
    expect(await loose(page, 'websites')).toHaveLength(0)
  } finally {
    await closeApp(context)
  }
})

test('files dropped on the panel are added by type, and the drop area shows while dragging', async () => {
  const context = await launchApp()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-drop-'))
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const note = path.join(dir, 'plan.txt')
    const program = path.join(dir, 'Editor.exe')
    const shortcut = path.join(dir, 'site.url')
    await fs.writeFile(note, 'hello')
    await fs.writeFile(program, 'MZ')
    await fs.writeFile(
      shortcut,
      '[InternetShortcut]\r\nURL=https://example.org/page\r\n'
    )

    // While dragging: the dashed area with its words, and the panel is told not to fold away.
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File(['x'], 'x.txt'))
      document.querySelector('.workspace-content')!.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        })
      )
    })
    await expect(page.getByTestId('external-drop-zone')).toContainText(
      '松开以添加'
    )
    await expect(page.locator('body')).toHaveClass(/external-drag-active/)
    await page.screenshot({
      path: 'artifacts/external-drop-zone.png',
      animations: 'disabled',
    })
    await expect(page.getByTestId('external-drop-zone')).toHaveCount(0)

    await dropFiles(page, [note, program, shortcut])

    await expect.poll(async () => (await loose(page, 'apps')).length).toBe(1)
    expect(await loose(page, 'folders')).toMatchObject([
      { name: 'plan.txt', path: note },
    ])
    expect(await loose(page, 'apps')).toMatchObject([
      { name: 'Editor', path: program },
    ])
    expect(await loose(page, 'websites')).toMatchObject([
      { url: 'https://example.org/page' },
    ])
    await expect(page.getByTestId('feedback-strip')).toContainText(
      '已添加 3 项'
    )
    await expect(page.getByTestId('external-drop-zone')).toHaveCount(0)
    await expect(page.locator('body')).not.toHaveClass(/external-drag-active/)
  } finally {
    await closeApp(context)
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('a drop on a group card goes into that group', async () => {
  const context = await launchApp()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-drop-'))
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-folders').click()

    const sub = path.join(dir, 'Atlas')
    await fs.mkdir(sub)
    await fs.writeFile(path.join(sub, 'a.txt'), 'x')
    const file = path.join(sub, 'a.txt')
    await dropFiles(
      page,
      [file],
      '[data-testid="folder-widget-grp-folders-life"]'
    )

    await expect(page.getByTestId('feedback-strip')).toContainText('已添加')
    const saved = await page.evaluate(() => window.quickLaunch.loadData())
    if (!saved.ok) throw new Error(saved.error)
    expect(
      saved.data.folders
        .find((group) => group.id === 'grp-folders-life')!
        .items.map((item) => item.name)
    ).toEqual(['下载', 'a.txt'])
    expect(saved.data.loose.folders).toHaveLength(0)
  } finally {
    await closeApp(context)
    await fs.rm(dir, { recursive: true, force: true })
  }
})
