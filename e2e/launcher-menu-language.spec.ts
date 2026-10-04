// Iteration 5, package "safety" (i18n-copy-6): the menu of the floating ball follows the language
// that was saved, also when the language changes while the app keeps running. (The tray icon's
// menu is rebuilt by the same code; there is no tray in the e2e runs, so it is covered by the unit
// tests of tray.ts and ipc-handlers.ts.)
import { test, expect, type Page } from '@playwright/test'

import { closeApp, launchApp, type AppContext } from './test-utils'

async function openBall(context: AppContext): Promise<Page> {
  await context.page.evaluate(() => window.quickLaunch.window.collapse())
  await expect.poll(() => context.electronApp.windows().length).toBe(2)
  const bubble = context.electronApp
    .windows()
    .find((candidate) => candidate !== context.page)!
  await expect(bubble.getByTestId('dock-bubble')).toBeVisible()

  return bubble
}

async function saveLanguage(
  page: Page,
  lang: 'zh' | 'en' | 'ja'
): Promise<void> {
  const saved = await page.evaluate(async (next) => {
    const loaded = await window.quickLaunch.loadData()
    if (!loaded.ok) return false
    loaded.data.prefs.lang = next
    return (await window.quickLaunch.saveData(loaded.data)).ok
  }, lang)
  expect(saved).toBe(true)
}

test('right-clicking the ball shows the menu in the saved language, before and after a change', async () => {
  const context = await launchApp()

  try {
    // Observe the native-menu request without leaving a popup open on the desktop.
    await context.electronApp.evaluate(({ Menu }) => {
      Menu.prototype.popup = function () {
        Object.assign(globalThis, { launcherMenuShown: this })
      }
    })
    const labels = () =>
      context.electronApp.evaluate(() => {
        const menu = (
          globalThis as typeof globalThis & {
            launcherMenuShown?: Electron.Menu
          }
        ).launcherMenuShown
        return menu?.items
          .filter((item) => item.type !== 'separator')
          .map((item) => item.label)
      })
    // Keeps the menu that was shown, to tell afterwards whether the next one is another object: a
    // native item cannot be renamed, so a change of language must produce a new menu.
    const forget = () =>
      context.electronApp.evaluate(() => {
        const holder = globalThis as {
          launcherMenuShown?: unknown
          launcherMenuBefore?: unknown
        }
        holder.launcherMenuBefore = holder.launcherMenuShown
        delete holder.launcherMenuShown
      })
    const isNewMenu = () =>
      context.electronApp.evaluate(() => {
        const holder = globalThis as {
          launcherMenuShown?: unknown
          launcherMenuBefore?: unknown
        }
        return (
          holder.launcherMenuShown !== undefined &&
          holder.launcherMenuShown !== holder.launcherMenuBefore
        )
      })

    await saveLanguage(context.page, 'zh')
    const bubble = await openBall(context)
    await bubble.getByTestId('dock-bubble').click({ button: 'right' })
    await expect.poll(labels).toEqual(['打开 Marubako', '退出 (Quit)'])

    for (const [lang, expected] of [
      ['en', ['Open Marubako', 'Quit']],
      ['ja', ['Marubako を開く', '終了 (Quit)']],
      ['zh', ['打开 Marubako', '退出 (Quit)']],
    ] as const) {
      await saveLanguage(context.page, lang)
      await forget()
      await bubble.getByTestId('dock-bubble').click({ button: 'right' })
      await expect.poll(labels, lang).toEqual(expected)
      expect(
        await isNewMenu(),
        `${lang}: a menu built for the new language`
      ).toBe(true)
    }
  } finally {
    await closeApp(context)
  }
})
