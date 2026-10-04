import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createDefaultAppData, closeApp, launchApp } from './test-utils'

async function launchCollection() {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-collection-')
  )
  const data = createDefaultAppData()
  data.commands = []
  data.notes = []
  data.topOrder.commands = []
  data.topOrder.notes = []
  // A new installation opens slender (one column of cards); these tests are about the wide layout and
  // then narrow it step by step, so they start from a saved wide window.
  data.window.bounds = { x: 100, y: 40, w: 760, h: 720 }
  const examples = [
    [
      '查看工作目录',
      'powershell',
      '检查文件列表',
      'Get-ChildItem -Path "C:\\Work"\n  | Sort-Object LastWriteTime\n  | Select-Object Name, Length',
    ],
    [
      '检查 Git 状态',
      'bash',
      '查看当前工作区与分支',
      'git status --short\ngit branch --show-current\ngit log --oneline -5',
    ],
    [
      '启动开发服务',
      'bash',
      '安装依赖后启动项目',
      'npm install\nnpm run dev\n# Ctrl+C 停止服务',
    ],
    [
      '查找大文件',
      'powershell',
      '按文件大小排序',
      'Get-ChildItem -Recurse -File\n  | Sort-Object Length -Descending\n  | Select-Object -First 10',
    ],
    [
      '备份配置文件',
      'python',
      '复制配置到备份目录',
      'from pathlib import Path\nimport shutil\nshutil.copy("config.json", "backup/config.json")',
    ],
    [
      '查询最近记录',
      'sql',
      '按更新时间查看数据',
      'SELECT id, name, updated_at\nFROM entries\nORDER BY updated_at DESC;',
    ],
  ] as const
  for (let index = 0; index < 12; index++) {
    const [name, language, description, content] =
      examples[index % examples.length]!
    const id = `command-${index}`
    data.loose.commands.push({
      id,
      kind: 'command',
      name: index < 6 ? name : `${name} · 备用`,
      icon: '⌘',
      language,
      description,
      content,
    })
    data.topOrder.commands.push({ type: 'loose', id })
    const noteId = `note-${index}`
    data.loose.notes.push({
      id: noteId,
      kind: 'note',
      name: ['本周工作计划', '项目约定', '会议记录', '待办想法'][index % 4]!,
      icon: '📝',
      content:
        '整理当前项目的工作进度\n记录需要跟进的事项\n保留完整内容，按需展开阅读。',
    })
    data.topOrder.notes.push({ type: 'loose', id: noteId })
  }
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  return launchApp(userDataDir)
}

test('places Commands before Notes and shows more scripts without horizontal overflow', async () => {
  const context = await launchCollection()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(
      await page
        .locator('.tab-button')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-testid'))
        )
    ).toEqual([
      'tab-folders',
      'tab-websites',
      'tab-apps',
      'tab-passwords',
      'tab-commands',
      'tab-notes',
      'tab-tasks',
    ])
    await page.keyboard.press('Alt+5')
    await expect(page.getByTestId('tab-commands')).toHaveClass(/active/)
    const first = await page.getByTestId('item-row-command-0').boundingBox()
    const second = await page.getByTestId('item-row-command-1').boundingBox()
    expect(second!.x).toBeGreaterThan(first!.x + first!.width)
    expect(Math.abs(second!.y - first!.y)).toBeLessThan(1)
    const visibleCount = await page
      .locator('.command-item')
      .evaluateAll((nodes) => {
        const viewport = document
          .querySelector('.workspace-content')!
          .getBoundingClientRect()
        return nodes.filter((node) => {
          const rect = node.getBoundingClientRect()
          return rect.top >= viewport.top && rect.bottom <= viewport.bottom
        }).length
      })
    await page.screenshot({
      path: 'artifacts/collection-commands-dark.png',
      animations: 'disabled',
    })
    expect(visibleCount).toBeGreaterThanOrEqual(6)
    await page.keyboard.press('Alt+6')
    await expect(page.getByTestId('tab-notes')).toHaveClass(/active/)
    await page.screenshot({
      path: 'artifacts/collection-notes.png',
      animations: 'disabled',
    })
    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('settings-save').click()
    await page.getByTestId('tab-commands').click()
    await page.screenshot({
      path: 'artifacts/collection-commands-light.png',
      animations: 'disabled',
    })
    for (const width of [420, 320]) {
      await context.electronApp.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(width, 720),
        width
      )
      const first = await page.getByTestId('item-row-command-0').boundingBox()
      const second = await page.getByTestId('item-row-command-1').boundingBox()
      expect(second!.x).toBe(first!.x)
      expect(second!.y).toBeGreaterThan(first!.y)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
      await expect(page.getByTestId('open-command')).toBeVisible()
    }
    await page.screenshot({
      path: 'artifacts/collection-compact.png',
      animations: 'disabled',
    })
  } finally {
    await closeApp(context)
  }
})

test('reorders adjacent command cards by dropping on the trailing side', async () => {
  const context = await launchCollection()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-commands').click()
    const first = await page
      .getByTestId('item-row-command-0')
      .locator('.snippet-header')
      .boundingBox()
    const second = await page
      .getByTestId('item-row-command-1')
      .locator('.snippet-header')
      .boundingBox()
    await page.mouse.move(first!.x + 15, first!.y + first!.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      second!.x + second!.width - 18,
      second!.y + second!.height / 2,
      { steps: 20 }
    )
    await page.mouse.up()
    await expect
      .poll(() =>
        page
          .locator('.list-section > .command-item')
          .evaluateAll((nodes) =>
            nodes
              .slice(0, 2)
              .map((node) => node.getAttribute('data-top-entry-id'))
          )
      )
      .toEqual(['command-1', 'command-0'])
    // Just after a drop the first click can still be swallowed on a slow machine: click until the
    // editor opens.
    await expect(async () => {
      await page.getByTestId('edit-item-command-0').click()
      await expect(page.getByTestId('command-code-input')).toBeVisible({
        timeout: 1500,
      })
    }).toPass({ timeout: 10_000 })
    await expect(page.getByTestId('command-code-input')).toContainText(
      'Get-ChildItem'
    )
  } finally {
    await closeApp(context)
  }
})
