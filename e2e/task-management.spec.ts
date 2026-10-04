import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { createDefaultAppData } from '../src/shared/default-data'
import { addDays, todayKey } from '../src/renderer/src/utils/date'
import { closeApp, launchApp } from './test-utils'

async function launchTasks() {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-tasks-')
  )
  const data = createDefaultAppData()
  const date = todayKey()
  data.tasks[date] = [
    {
      id: 'task-release',
      name: '准备版本发布',
      icon: '🚀',
      status: 'doing',
      open: true,
      subtasks: [
        {
          id: 'subtask-checks',
          name: '检查核心功能与发布清单',
          status: 'todo',
        },
        { id: 'subtask-notes', name: '整理更新说明', status: 'done' },
      ],
    },
    {
      id: 'task-plan',
      name: '整理下一阶段的计划与待办事项',
      icon: '📝',
      status: 'todo',
      open: true,
      subtasks: [
        { id: 'subtask-review', name: '回顾本周进度', status: 'doing' },
        { id: 'subtask-plan', name: '列出下一步安排', status: 'skip' },
      ],
    },
    {
      id: 'task-done',
      name: '完成资料归档',
      icon: '📁',
      status: 'done',
      open: false,
      subtasks: [],
    },
  ]
  data.tasks[addDays(date, 1)] = [structuredClone(data.tasks[date]![0]!)]
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  return launchApp(userDataDir)
}

test('edits, adds and deletes subtasks with confirmation and persists deletion on restart', async () => {
  let context = await launchTasks()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    const card = page.getByTestId('task-card-task-release')

    await page.getByTestId('edit-subtask-subtask-checks').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-subtask')).toBeVisible()
    await page.getByTestId('subtask-name-input').fill('检查更新后的核心功能')
    await page.getByTestId('subtask-save').click()
    await expect(card).toContainText('检查更新后的核心功能')
    await expect(page.getByTestId('task-toggle-task-release')).toHaveAttribute(
      'aria-expanded',
      'true'
    )

    await page.getByTestId('delete-subtask-subtask-checks').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('modal-confirm')).toContainText(
      '确认删除此子任务？'
    )
    await page.getByTestId('confirm-cancel').click()
    await expect(page.getByTestId('subtask-row-subtask-checks')).toBeVisible()
    await expect(card).toContainText('1/2')

    await page.getByTestId('delete-subtask-subtask-checks').click()
    await page.getByTestId('confirm-submit').click()
    await expect(page.getByTestId('subtask-row-subtask-checks')).toHaveCount(0)
    await expect(card).toContainText('1/1')
    await expect(page.getByTestId('subtask-row-subtask-notes')).toBeVisible()
    await expect(page.getByTestId('subtask-row-subtask-review')).toBeVisible()

    await page.getByTestId('add-subtask-task-release').click()
    await page.getByTestId('subtask-name-input').fill('新的发布检查')
    await page.getByTestId('subtask-save').click()
    const added = page
      .locator('.subtask-row')
      .filter({ hasText: '新的发布检查' })
    await expect(added).toBeVisible()
    // One click ticks it (it no longer goes through "doing" and "skip" first).
    await added.locator('.subtask-status').click()
    await expect(added).toHaveClass(/status-done/)
    await expect(card).toContainText('2/2')

    const loaded = await page.evaluate(() => window.quickLaunch.loadData())
    expect(
      loaded.ok &&
        loaded.data.tasks[todayKey()]![0]!.subtasks.map((subtask) => subtask.id)
    ).not.toContain('subtask-checks')
    expect(
      loaded.ok &&
        loaded.data.tasks[addDays(todayKey(), 1)]![0]!.subtasks[0]!.id
    ).toBe('subtask-checks')

    const userDataDir = context.userDataDir
    await closeApp(context, { cleanup: false })
    context = await launchApp(userDataDir)
    await context.page.getByTestId('tab-tasks').click()
    await expect(
      context.page.getByTestId('subtask-row-subtask-checks')
    ).toHaveCount(0)
    await expect(
      context.page.getByTestId('task-card-task-release')
    ).toContainText('新的发布检查')
  } finally {
    await closeApp(context)
  }
})

test('keeps task controls visible in both themes at regular and compact sizes', async () => {
  const context = await launchTasks()
  try {
    const { page, electronApp } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    for (const theme of ['dark', 'light'] as const) {
      if (theme === 'light') {
        await page.getByTestId('open-settings').click()
        await page.getByTestId('theme-light').click()
        await page.getByTestId('settings-save').click()
        await expect(page.getByTestId('feedback-strip')).not.toHaveAttribute(
          'data-open'
        )
      }
      for (const width of [760, 420, 320]) {
        await electronApp.evaluate(({ BrowserWindow }, nextWidth) => {
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(nextWidth, 720)
        }, width)
        await expect(page.getByTestId('add-task')).toBeVisible()
        await expect(
          page.getByTestId('delete-subtask-subtask-checks')
        ).toBeVisible()
        const layout = await page
          .getByTestId('section-tasks')
          .evaluate((section) => {
            const card = section
              .querySelector('.task-card')!
              .getBoundingClientRect()
            const button = section
              .querySelector('[data-testid="delete-subtask-subtask-checks"]')!
              .getBoundingClientRect()
            const heading = section.querySelector('h1')!.getBoundingClientRect()
            // "Add task" is in the bars above the page, not in the page itself.
            const add = document
              .querySelector('[data-testid="add-task"]')!
              .getBoundingClientRect()
            return {
              overflow: section.scrollWidth - section.clientWidth,
              buttonInside:
                button.left >= card.left && button.right <= card.right,
              headingHidden: heading.width <= 1 && heading.height <= 1,
              addAbovePage: add.bottom <= section.getBoundingClientRect().top,
              addInPage:
                section.querySelector('[data-testid="add-task"]') !== null,
            }
          })
        expect(layout.overflow).toBeLessThanOrEqual(1)
        expect(layout.buttonInside).toBe(true)
        expect(layout.headingHidden).toBe(true)
        expect(layout.addAbovePage).toBe(true)
        expect(layout.addInPage).toBe(false)
        await page.screenshot({
          path: `artifacts/tasks-${theme}-${width}.png`,
          animations: 'disabled',
        })
      }
    }
    await page.getByTestId('date-display-toggle').click()
    await expect(page.getByTestId('date-calendar')).toBeVisible()
    const calendarBounds = await page
      .getByTestId('date-calendar')
      .evaluate((calendar) => {
        const section = calendar
          .closest('.section-content')!
          .getBoundingClientRect()
        return {
          bottom: calendar.getBoundingClientRect().bottom,
          sectionBottom: section.bottom,
        }
      })
    await page.screenshot({
      path: 'artifacts/tasks-calendar-light-320.png',
      animations: 'disabled',
    })
    expect(calendarBounds.bottom).toBeLessThanOrEqual(
      calendarBounds.sectionBottom
    )
    await page.getByTestId(`calendar-day-${addDays(todayKey(), 2)}`).click()
    await expect(page.getByTestId('empty-add-task')).toBeVisible()
    const emptyActionFits = await page
      .getByTestId('empty-add-task')
      .evaluate((button) => {
        const section = button
          .closest('.section-content')!
          .getBoundingClientRect()
        return button.getBoundingClientRect().bottom <= section.bottom
      })
    expect(emptyActionFits).toBe(true)
    await page.screenshot({
      path: 'artifacts/tasks-empty-light-320.png',
      animations: 'disabled',
    })
  } finally {
    await closeApp(context)
  }
})

test('renaming a task keeps it on its day and at its place in the list', async () => {
  const context = await launchTasks()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()

    await page.getByTestId('edit-task-task-plan').click()
    await page.getByTestId('task-name-input').fill('重命名后的计划')
    await page.getByTestId('task-save').click()

    await expect(page.getByTestId('task-card-task-plan')).toContainText(
      '重命名后的计划'
    )
    await expect(page.locator('.task-card')).toHaveCount(3)
    expect(
      await page
        .locator('.task-card')
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute('data-testid'))
        )
    ).toEqual([
      'task-card-task-release',
      'task-card-task-plan',
      'task-card-task-done',
    ])

    const loaded = await page.evaluate(() => window.quickLaunch.loadData())
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.data.tasks[todayKey()]!.map((task) => task.id)).toEqual([
      'task-release',
      'task-plan',
      'task-done',
    ])
    expect(
      loaded.data.tasks[addDays(todayKey(), 1)]!.map((task) => task.id)
    ).toEqual(['task-release'])
  } finally {
    await closeApp(context)
  }
})

test('Escape closes an open calendar first and only the next one collapses the panel', async () => {
  const context = await launchTasks()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-tasks').click()
    const readCollapsed = () =>
      page.evaluate(async () => {
        const result = await window.quickLaunch.window.getState()
        return result.ok ? result.data.collapsed : null
      })

    await page.getByTestId('date-display-toggle').click()
    await expect(page.getByTestId('date-calendar')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('date-calendar')).toHaveCount(0)
    await expect(page.getByTestId('date-display-toggle')).toBeFocused()
    // Collapsing goes through the main process, so give a wrongly fired collapse time to land.
    await page.waitForTimeout(600)
    expect(await readCollapsed()).toBe(false)

    await page.keyboard.press('Escape')
    await expect.poll(readCollapsed).toBe(true)
  } finally {
    await closeApp(context)
  }
})
