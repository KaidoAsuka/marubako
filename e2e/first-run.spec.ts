// iteration 5, "firstrun": a new installation starts in the language of the computer, the first
// screen offers the language switch, and the first-run card remembers being closed.
//
// The e2e runs keep the plain first start the other specs were written against (Chinese, no card)
// unless a spec poses as another computer with QUICKLAUNCH_LOCALE and opts in to the first-run
// experience with QUICKLAUNCH_FIRST_RUN=1.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createDefaultAppData } from '../src/shared/default-data'
import { translations } from '../src/renderer/src/i18n/translations'
import { workspaceStrings } from '../src/renderer/src/i18n/workspace'
import { closeApp, launchApp, type AppContext } from './test-utils'
import { DOCK_SIZE } from '../src/shared/dock-size'

const TAB_KEYS = [
  'tab_folders',
  'tab_websites',
  'tab_apps',
  'tab_passwords',
  'tab_commands',
  'tab_notes',
  'tab_tasks',
] as const

/** The category names of a language, as the tab bar shows them. */
function tabWords(lang: 'zh' | 'en' | 'ja'): string[] {
  return TAB_KEYS.map(
    (key) =>
      workspaceStrings[lang][key] ?? translations[lang].strings[key] ?? key
  )
}

/** Launches the app on a computer that reports `locale`, as a first run when asked. */
async function launchAs(
  env: { locale?: string; firstRun?: boolean },
  userDataDir?: string
): Promise<AppContext> {
  const keys = ['QUICKLAUNCH_LOCALE', 'QUICKLAUNCH_FIRST_RUN'] as const
  const saved = keys.map((key) => process.env[key])
  if (env.locale) process.env.QUICKLAUNCH_LOCALE = env.locale
  else delete process.env.QUICKLAUNCH_LOCALE
  if (env.firstRun) process.env.QUICKLAUNCH_FIRST_RUN = '1'
  else delete process.env.QUICKLAUNCH_FIRST_RUN
  try {
    return await launchApp(userDataDir)
  } finally {
    keys.forEach((key, index) => {
      const value = saved[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  }
}

async function savedData(context: AppContext) {
  const text = await fs.readFile(
    path.join(context.userDataDir, 'quicklaunch-data.json'),
    'utf8'
  )
  return JSON.parse(text).data
}

async function tabNames(context: AppContext): Promise<string[]> {
  return context.page.locator('.tab-label').allTextContents()
}

test('without a posed locale the e2e runs start in Chinese with no first-run card', async () => {
  const context = await launchAs({})
  try {
    expect(await tabNames(context)).toEqual(tabWords('zh'))
    await expect(context.page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(context.page.getByTestId('onboarding-card')).toHaveCount(0)
    expect((await savedData(context)).prefs.lang).toBe('zh')
  } finally {
    await closeApp(context)
  }
})

for (const [locale, lang, htmlLang, firstGroup, firstSite] of [
  ['en-US', 'en', 'en', 'Work files', 'Google'],
  ['de-DE', 'en', 'en', 'Work files', 'Google'],
  // The interface follows the computer; the sample entries have the same English words everywhere.
  ['ja-JP', 'ja', 'ja', 'Work files', 'Google'],
  ['zh-TW', 'zh', 'zh-CN', 'Work files', 'Google'],
] as const) {
  test(`a first launch on a ${locale} computer is in ${lang}, sample data included`, async () => {
    const context = await launchAs({ locale })
    try {
      const { page } = context

      expect(await tabNames(context)).toEqual(tabWords(lang))
      await expect(page.locator('html')).toHaveAttribute('lang', htmlLang)
      await expect(
        page.getByTestId('folder-widget-grp-folders-work')
      ).toContainText(firstGroup)
      const data = await savedData(context)
      expect(data.prefs.lang).toBe(lang)
      expect(data.websites[0].items[0].name).toBe(firstSite)
      // Nothing of the other languages is left on the first screen.
      const text = (await page.getByTestId('app-root').innerText()) ?? ''
      if (lang === 'en') expect(text).not.toMatch(/[一-鿿぀-ヿ]/)
    } finally {
      await closeApp(context)
    }
  })
}

test('data that already exists keeps its language, whatever the computer says', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-lang-'))
  const data = createDefaultAppData('zh')
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  const context = await launchAs({ locale: 'en-US' }, userDataDir)
  try {
    expect(await tabNames(context)).toEqual(tabWords('zh'))
    expect((await savedData(context)).prefs.lang).toBe('zh')
  } finally {
    await closeApp(context)
  }
})

test('the first-run card offers the language switch in all three languages, and the choice sticks', async () => {
  const context = await launchAs({ locale: 'ja-JP', firstRun: true })
  try {
    const { page } = context
    const card = page.getByTestId('onboarding-card')
    await expect(card).toBeVisible()
    const row = page.getByTestId('onboarding-language')
    await expect(row.getByRole('radio')).toHaveText([
      '中文',
      'English',
      '日本語',
    ])
    await expect(page.getByTestId('onboarding-lang-ja')).toHaveAttribute(
      'aria-checked',
      'true'
    )

    await page.getByTestId('onboarding-lang-en').click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    expect(await tabNames(context)).toEqual(tabWords('en'))
    await expect
      .poll(async () => (await savedData(context)).prefs.lang)
      .toBe('en')
    // The card is still there for the next choice, and now says English is the current one.
    await expect(page.getByTestId('onboarding-lang-en')).toHaveAttribute(
      'aria-checked',
      'true'
    )
  } finally {
    await closeApp(context)
  }
})

test('closing the first-run card is remembered across a restart', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-card-'))
  const first = await launchAs({ locale: 'en-US', firstRun: true }, userDataDir)
  try {
    await expect(first.page.getByTestId('onboarding-card')).toBeVisible()
    await first.page.getByTestId('onboarding-dismiss').click()
    await expect(first.page.getByTestId('onboarding-card')).toHaveCount(0)
  } finally {
    await closeApp(first, { cleanup: false })
  }

  const second = await launchAs(
    { locale: 'en-US', firstRun: true },
    userDataDir
  )
  try {
    await expect(second.page.getByTestId('app-root')).toBeVisible()
    await expect(second.page.getByTestId('onboarding-card')).toHaveCount(0)
  } finally {
    await closeApp(second)
  }
})

test('the card is still there at the next start until it is closed, and an installation that already had data never gets it', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-card-'))
  const first = await launchAs({ locale: 'en-US', firstRun: true }, userDataDir)
  try {
    await expect(first.page.getByTestId('onboarding-card')).toBeVisible()
  } finally {
    await closeApp(first, { cleanup: false })
  }

  // Not a first run any more (the data exists), but the card was begun and is not closed.
  const second = await launchAs(
    { locale: 'en-US', firstRun: true },
    userDataDir
  )
  try {
    await expect(second.page.getByTestId('onboarding-card')).toBeVisible()
  } finally {
    await closeApp(second)
  }

  // An installation that existed before the card did: data on disk, nothing stored by the card.
  const existing = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-card-'))
  await fs.writeFile(
    path.join(existing, 'quicklaunch-data.json'),
    JSON.stringify(createDefaultAppData('en')),
    'utf8'
  )
  const upgraded = await launchAs({ locale: 'en-US', firstRun: true }, existing)
  try {
    await expect(upgraded.page.getByTestId('app-root')).toBeVisible()
    await expect(upgraded.page.getByTestId('onboarding-card')).toHaveCount(0)
  } finally {
    await closeApp(upgraded)
  }
})

async function geometry(context: AppContext) {
  return context.electronApp.evaluate(({ BrowserWindow, screen }) => {
    const windows = BrowserWindow.getAllWindows()
    const panel = windows.find((window) => window.isResizable())!
    const ball = windows.find((window) => !window.isResizable())
    return {
      panel: { ...panel.getBounds(), visible: panel.isVisible() },
      ball: ball ? { ...ball.getBounds(), visible: ball.isVisible() } : null,
      area: screen.getPrimaryDisplay().workArea,
    }
  })
}

async function ballPage(context: AppContext): Promise<Page> {
  await expect.poll(() => context.electronApp.windows().length).toBe(2)
  return context.electronApp.windows().find((page) => page !== context.page)!
}

test('a new installation shows the ball beside the panel from the first second, and the pair stays together', async () => {
  const context = await launchAs({ firstRun: true })
  try {
    await expect
      .poll(async () => (await geometry(context)).ball?.visible)
      .toBe(true)
    const first = await geometry(context)
    const { area, panel, ball } = first

    // The ball is docked at the right edge on the vertical middle; the panel is beside it with
    // the 8 px gap, on the same middle. (A window is sized in device pixels: a pixel or two off on
    // a scaled display is not a difference.)
    expect(
      Math.abs(ball!.x + DOCK_SIZE + 4 - (area.x + area.width))
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(ball!.y + DOCK_SIZE / 2 - (area.y + area.height / 2))
    ).toBeLessThanOrEqual(2)
    expect(Math.abs(panel.x + panel.width + 8 - ball!.x)).toBeLessThanOrEqual(2)
    expect(
      Math.abs(panel.y + panel.height / 2 - (ball!.y + DOCK_SIZE / 2))
    ).toBeLessThanOrEqual(2)
    expect(panel.visible).toBe(true)

    // The ball is the small dot that stands for an open panel, not a full ball.
    const bubble = await ballPage(context)
    await expect(bubble.locator('.dock-bubble-surface')).toHaveAttribute(
      'data-morph',
      'dot'
    )

    // Folding into the ball leaves the ball where it is; opening puts the panel back.
    await context.page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => (await geometry(context)).panel.visible)
      .toBe(false)
    const folded = await geometry(context)
    expect(folded.ball).toMatchObject({ x: ball!.x, y: ball!.y, visible: true })
    await expect(bubble.locator('.dock-bubble-surface')).toHaveAttribute(
      'data-morph',
      'ball'
    )

    await bubble.evaluate(() =>
      window.quickLaunch.window.activateDock('window')
    )
    await expect
      .poll(async () => (await geometry(context)).panel.visible)
      .toBe(true)
    const opened = await geometry(context)
    expect(opened.panel).toMatchObject({
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
    })
  } finally {
    await closeApp(context)
  }
})

test('the card ticks a line when it is done: an added entry, a trip into the ball and back', async () => {
  const context = await launchAs({ locale: 'en-US', firstRun: true })
  try {
    const { page } = context
    const done = (name: string) => page.getByTestId(`onboarding-step-${name}`)
    await expect(page.getByTestId('onboarding-card')).toBeVisible()
    // No global shortcut is registered in an e2e run, so there is no line about one.
    await expect(page.getByTestId('onboarding-step-hotkey')).toHaveCount(0)
    await expect(done('added')).not.toHaveAttribute('data-done')
    await expect(done('bubble')).not.toHaveAttribute('data-done')

    await page.getByTestId('tab-notes').click()
    await page.getByTestId('add-loose-item-notes').click()
    await page.getByTestId('item-name-input').fill('First of mine')
    await page.getByTestId('item-content-input').fill('Hello')
    await page.getByTestId('item-save').click()
    await expect(done('added')).toHaveAttribute('data-done')
    await expect(done('bubble')).not.toHaveAttribute('data-done')

    await page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => (await geometry(context)).panel.visible)
      .toBe(false)
    await expect(done('bubble')).not.toHaveAttribute('data-done')
    const bubble = await ballPage(context)
    await bubble.evaluate(() =>
      window.quickLaunch.window.activateDock('window')
    )

    await expect(done('bubble')).toHaveAttribute('data-done')
    // Everything that applies is done: it says so, and folds away by itself.
    await expect(page.getByTestId('onboarding-card')).toContainText('All set')
    await expect(page.getByTestId('onboarding-card')).toHaveCount(0, {
      timeout: 5000,
    })
  } finally {
    await closeApp(context)
  }
})

test('an empty category says what it is for, in the language of the computer', async () => {
  // A new installation has a sample in every category but the tasks, so the others are emptied.
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-empty-'))
  const data = createDefaultAppData('ja')
  data.apps = []
  data.commands = []
  data.topOrder.apps = []
  data.topOrder.commands = []
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  const context = await launchAs({ locale: 'ja-JP' }, userDataDir)
  try {
    const { page } = context
    for (const [tab, key] of [
      ['apps', 'empty_apps'],
      ['commands', 'empty_commands'],
      ['tasks', 'empty_tasks'],
    ] as const) {
      await page.getByTestId(`tab-${tab}`).click()
      await expect(page.getByTestId('empty-description')).toHaveText(
        workspaceStrings.ja[key]!
      )
      await expect(page.locator('.empty-state-action')).toBeVisible()
    }
  } finally {
    await closeApp(context)
  }
})
