// Iteration 5, package "safety" (data-security-8): the floating ball's page shares the panel's
// preload, so it can call every channel. Only the panel may reach the data, which holds every
// password; the ball has one small channel of its own for how to look.
import { test, expect, type Page } from '@playwright/test'

import { DOCK_BALL_SIZE } from '../src/shared/dock-size'
import { closeApp, launchApp, type AppContext } from './test-utils'

const SECRET = 'ball-must-never-see-THIS'

async function openBall(context: AppContext): Promise<Page> {
  await context.page.evaluate(() => window.quickLaunch.window.collapse())
  await expect.poll(() => context.electronApp.windows().length).toBe(2)
  const bubble = context.electronApp
    .windows()
    .find((candidate) => candidate !== context.page)!
  await expect(bubble.getByTestId('dock-bubble')).toBeVisible()

  return bubble
}

/** Saves a password through the panel, the only page that is allowed to. */
async function savePassword(
  page: Page,
  appearance: { theme: 'dark' | 'light'; lang: 'zh' | 'en' | 'ja' }
): Promise<void> {
  const saved = await page.evaluate(
    async ({ secret, theme, lang }) => {
      const loaded = await window.quickLaunch.loadData()
      if (!loaded.ok) return false
      loaded.data.prefs.theme = theme
      loaded.data.prefs.lang = lang
      loaded.data.loose.passwords.push({
        id: 'secret-entry',
        kind: 'password',
        name: 'Bank',
        icon: 'key',
        username: 'me@example.com',
        password: secret,
        note: '',
      })
      return (await window.quickLaunch.saveData(loaded.data)).ok
    },
    { secret: SECRET, ...appearance }
  )
  expect(saved).toBe(true)
}

test('the ball window cannot read, change or export the data, and still dresses itself', async () => {
  const context = await launchApp()

  try {
    await savePassword(context.page, { theme: 'light', lang: 'en' })
    const panelData = await context.page.evaluate(() =>
      window.quickLaunch.loadData()
    )
    const bubble = await openBall(context)

    // The ball dresses itself from its own channel: the saved theme and language.
    await expect(bubble.locator('.dock-root')).toHaveClass(/theme-light/)
    await expect(bubble.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      'Open Marubako'
    )

    const fromBall = await bubble.evaluate(async (data) => {
      const api = window.quickLaunch
      return {
        load: await api.loadData(),
        save: data.ok ? await api.saveData(data.data) : null,
        status: await api.getDataStatus(),
        retry: await api.retryDataSave(),
        dismiss: await api.dismissDataNotice('reset'),
        appearance: await api.getDockAppearance(),
      }
    }, panelData)

    for (const refused of [
      fromBall.load,
      fromBall.save,
      fromBall.status,
      fromBall.retry,
      fromBall.dismiss,
    ]) {
      expect(refused).toMatchObject({ ok: false })
    }
    // Nothing the ball received contains the password, and the ball's page does not either.
    expect(JSON.stringify(fromBall)).not.toContain(SECRET)
    expect(await bubble.content()).not.toContain(SECRET)
    // How to dress, and nothing else: the language, the theme and the size it is drawn at.
    expect(fromBall.appearance).toEqual({
      ok: true,
      data: { lang: 'en', theme: 'light', ballSize: DOCK_BALL_SIZE },
    })

    // The panel is not affected: it still reads its data, password included.
    const again = await context.page.evaluate(() =>
      window.quickLaunch.loadData()
    )
    expect(again.ok).toBe(true)
    expect(JSON.stringify(again)).toContain(SECRET)
  } finally {
    await closeApp(context)
  }
})

test('a change of theme or language reaches the ball the next time it is shown', async () => {
  const context = await launchApp()

  try {
    await savePassword(context.page, { theme: 'dark', lang: 'zh' })
    const bubble = await openBall(context)
    await expect(bubble.locator('.dock-root')).toHaveClass(/theme-dark/)
    await expect(bubble.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      '打开 Marubako'
    )

    // Expand the panel, switch to light and Japanese, fold back into the ball.
    await context.page.evaluate(() => window.quickLaunch.window.expand())
    await context.page.evaluate(async () => {
      const loaded = await window.quickLaunch.loadData()
      if (!loaded.ok) throw new Error('load failed')
      loaded.data.prefs.theme = 'light'
      loaded.data.prefs.lang = 'ja'
      await window.quickLaunch.saveData(loaded.data)
    })
    await context.page.evaluate(() => window.quickLaunch.window.collapse())

    await expect(bubble.locator('.dock-root')).toHaveClass(/theme-light/)
    await expect(bubble.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      /Marubako を開く/
    )
  } finally {
    await closeApp(context)
  }
})
