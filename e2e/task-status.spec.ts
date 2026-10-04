import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { createDefaultAppData } from '../src/shared/default-data'
import { addDays, todayKey } from '../src/renderer/src/utils/date'
import { closeApp, launchApp } from './test-utils'

async function launchSeeded() {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-task-status-')
  )
  const data = createDefaultAppData()
  data.tasks[todayKey()] = [
    {
      id: 'task-plain',
      name: '交周报',
      icon: '📝',
      status: 'todo',
      open: true,
      subtasks: [],
    },
    {
      id: 'task-steps',
      name: '准备发布',
      icon: '🚀',
      status: 'doing',
      open: true,
      subtasks: [
        { id: 'sub-notes', name: '整理说明', status: 'done' },
        { id: 'sub-checks', name: '检查清单', status: 'todo' },
      ],
    },
  ]
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  return launchApp(userDataDir)
}

async function saved(page: Parameters<typeof closeApp>[0]['page']) {
  const result = await page.evaluate(() => window.quickLaunch.loadData())
  if (!result.ok) throw new Error(result.error)
  return result.data.tasks[todayKey()]!
}

test('one click completes a task from its card, and the next takes it back', async () => {
  const context = await launchSeeded()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    const card = page.getByTestId('task-card-task-plain')
    const button = page.getByTestId('task-status-task-plain')
    await expect(page.locator('.task-summary')).toContainText('0 已完成')

    await button.click()

    await expect(card).toHaveClass(/status-done/)
    await expect(page.locator('.task-summary')).toContainText('1 已完成')
    await expect(page.getByTestId('task-toggle-task-plain')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect((await saved(page)).find((t) => t.id === 'task-plain')?.status).toBe(
      'done'
    )

    // From the keyboard too.
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(card).not.toHaveClass(/status-done/)
    expect((await saved(page)).find((t) => t.id === 'task-plain')?.status).toBe(
      'todo'
    )
  } finally {
    await closeApp(context)
  }
})

test('a subtask is ticked with one click, and the last one offers to complete the task', async () => {
  const context = await launchSeeded()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    const row = page.getByTestId('subtask-row-sub-checks')
    const card = page.getByTestId('task-card-task-steps')

    await page.getByTestId('subtask-status-sub-checks').click()

    await expect(row).toHaveClass(/status-done/)
    await expect(card).toContainText('2/2')
    // Nothing changed the task by itself.
    await expect(card).toHaveClass(/status-doing/)
    const strip = page.getByTestId('feedback-strip')
    await expect(strip).toContainText('子任务都完成了')
    await expect(page.getByTestId('feedback-action')).toContainText(
      '标记任务完成'
    )
    expect((await saved(page)).find((t) => t.id === 'task-steps')?.status).toBe(
      'doing'
    )

    await page.getByTestId('feedback-action').click()

    await expect(card).toHaveClass(/status-done/)
    expect((await saved(page)).find((t) => t.id === 'task-steps')?.status).toBe(
      'done'
    )

    // Clearing a box again under a finished task offers to reopen it.
    await page.getByTestId('subtask-status-sub-checks').click()
    await expect(row).not.toHaveClass(/status-done/)
    await expect(strip).toContainText('任务已完成，但有子任务没完成')
    await expect(page.getByTestId('feedback-action')).toContainText(
      '重新打开任务'
    )
    await page.getByTestId('feedback-action').click()
    await expect(card).toHaveClass(/status-doing/)
  } finally {
    await closeApp(context)
  }
})

test('doing and skip are chosen in the subtask dialog, not by clicking through them', async () => {
  const context = await launchSeeded()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()

    await page.getByTestId('edit-subtask-sub-checks').click()
    await page.getByRole('combobox').selectOption('skip')
    await page.getByTestId('subtask-save').click()

    await expect(page.getByTestId('subtask-row-sub-checks')).toHaveClass(
      /status-skip/
    )
    // One click from "skip" ticks it; it does not go round through the other states.
    await page.getByTestId('subtask-status-sub-checks').click()
    await expect(page.getByTestId('subtask-row-sub-checks')).toHaveClass(
      /status-done/
    )
  } finally {
    await closeApp(context)
  }
})

test('a new task can be put on another day from its dialog', async () => {
  const context = await launchSeeded()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    const later = addDays(todayKey(), 3)

    await page.getByTestId('add-task').click()
    const date = page.getByTestId('task-date-input')
    await expect(date).toHaveValue(todayKey())
    await page.getByTestId('task-name-input').fill('下周的任务')
    await date.fill(later)
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('modal-task')).toHaveCount(0)
    await expect(page.getByTestId('feedback-strip')).toContainText('已添加到')
    // The page stays on today, where the new task is not.
    await expect(page.getByText('下周的任务')).toHaveCount(0)
    const result = await page.evaluate(() => window.quickLaunch.loadData())
    if (!result.ok) throw new Error(result.error)
    expect(result.data.tasks[later]?.map((task) => task.name)).toEqual([
      '下周的任务',
    ])
    expect(result.data.tasks[todayKey()]).toHaveLength(2)
  } finally {
    await closeApp(context)
  }
})
