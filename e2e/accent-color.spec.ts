// color-4: "background" became "accent colour": one solid dot per choice (five accents and the
// Monokai palette), no blob layer behind the canvas.
import { test, expect, type Page } from '@playwright/test'

import { ACCENT_CHOICES } from '../src/renderer/src/styles/background-theme'
import {
  contrast,
  over,
  parseColor,
} from '../src/renderer/src/styles/__tests__/css-utils'
import { BACKGROUNDS, type BackgroundKey } from '../src/shared/types'
import { closeApp, launchApp, type AppContext } from './test-utils'

const NAMES_ZH: Record<BackgroundKey, string> = {
  aurora: '紫罗兰',
  sunset: '珊瑚橙',
  forest: '青',
  ocean: '海蓝',
  minimal: '石墨',
  monokai: 'Monokai',
}

async function openAppearance(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('modal-card')).toBeVisible()
  await expect(page.getByTestId('background-aurora')).toBeVisible()
}

async function save(page: Page): Promise<void> {
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('modal-card')).toHaveCount(0)
}

/** A token resolved to a colour, so color-mix() comes back as rgb. */
const resolved = (page: Page, name: string) =>
  page.evaluate((token) => {
    const probe = document.createElement('i')
    document.body.append(probe)
    probe.style.color = `var(${token})`
    const value = getComputedStyle(probe).color
    probe.remove()

    return value
  }, name)

async function chooseAndSave(
  page: Page,
  theme: 'dark' | 'light',
  key: BackgroundKey
): Promise<void> {
  await openAppearance(page)
  await page.getByTestId(`theme-${theme}`).click()
  await page.getByTestId(`background-${key}`).click()
  await save(page)
  await expect(page.getByTestId('app-root')).toHaveAttribute(
    'data-background',
    key
  )
  await expect(page.getByTestId('app-root')).toHaveClass(
    new RegExp(`theme-${theme}`)
  )
}

for (const theme of ['dark', 'light'] as const) {
  test(`the setting is one solid 24px dot per choice with a 28px hit area, a ring and a check on the chosen one (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openAppearance(page)
      await page.getByTestId(`theme-${theme}`).click()

      const group = page.getByRole('radiogroup', { name: '强调色' })
      await expect(group).toBeVisible()
      await expect(page.getByText('背景', { exact: true })).toHaveCount(0)
      await expect(group.getByRole('radio')).toHaveCount(BACKGROUNDS.length)

      for (const key of BACKGROUNDS) {
        const dot = page.getByTestId(`background-${key}`)
        const name = NAMES_ZH[key]

        await expect(dot).toHaveAttribute('aria-label', name)
        await expect(dot).toHaveAttribute('title', name)
        const geometry = await dot.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const fill = node.querySelector('.accent-dot-fill')!
          const fillBox = fill.getBoundingClientRect()
          const style = getComputedStyle(fill)

          return {
            hit: [box.width, box.height],
            fill: [fillBox.width, fillBox.height],
            radius: style.borderTopLeftRadius,
            colour: style.backgroundColor,
          }
        })
        expect(geometry.hit[0]).toBeGreaterThanOrEqual(28)
        expect(geometry.hit[1]).toBeGreaterThanOrEqual(28)
        expect(geometry.fill).toEqual([24, 24])
        expect(geometry.radius).toBe('50%')
        // A solid dot: the colour is exactly the solid fill the choice has in this theme.
        const solid =
          theme === 'dark'
            ? ACCENT_CHOICES[key].solidDark
            : ACCENT_CHOICES[key].solidLight
        const wanted = parseColor(solid)
        const seen = parseColor(geometry.colour)
        expect([seen.r, seen.g, seen.b]).toEqual([wanted.r, wanted.g, wanted.b])
      }

      // Violet is chosen by default: the ring and the check are on it and on nothing else.
      for (const key of BACKGROUNDS) {
        const dot = page.getByTestId(`background-${key}`)
        const chosen = key === 'aurora'

        await expect(dot).toHaveAttribute('aria-checked', String(chosen))
        await expect(dot.locator('svg')).toHaveCount(chosen ? 1 : 0)
        const ring = await dot
          .locator('.accent-dot-fill')
          .evaluate((node) => getComputedStyle(node).boxShadow)
        if (chosen) expect(ring).toContain('0px 0px 0px 4px')
        else expect(ring).not.toContain('0px 0px 0px 4px')
      }

      // Choosing moves the ring and the check; nothing is saved until Save.
      await page.getByTestId('background-ocean').click()
      await expect(page.getByTestId('background-ocean')).toHaveAttribute(
        'aria-checked',
        'true'
      )
      await expect(page.getByTestId('background-aurora')).toHaveAttribute(
        'aria-checked',
        'false'
      )
      await expect(
        page.getByTestId('background-ocean').locator('svg')
      ).toHaveCount(1)
      await expect(
        page.getByTestId('background-aurora').locator('svg')
      ).toHaveCount(0)
    } finally {
      await closeApp(context)
    }
  })
}

test('the dots are one stop in the tab order and the arrow keys move the choice', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openAppearance(page)

    await page.getByTestId('background-aurora').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('background-sunset')).toBeFocused()
    await expect(page.getByTestId('background-sunset')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await page.keyboard.press('End')
    await expect(page.getByTestId('background-monokai')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('background-aurora')).toBeFocused()

    // Tab leaves the group in one step instead of walking every dot: to the next control of the
    // page, the font.
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('background-sunset')).not.toBeFocused()
    await expect(page.getByTestId('settings-font-family')).toBeFocused()
  } finally {
    await closeApp(context)
  }
})

for (const theme of ['dark', 'light'] as const) {
  test(`every accent sets the two tokens and derives the rest, with white text readable on the solid fill, resting and hovered (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const key of BACKGROUNDS) {
        await chooseAndSave(page, theme, key)

        const choice = ACCENT_CHOICES[key]
        const accent = parseColor(theme === 'dark' ? choice.dark : choice.light)
        const solid = parseColor(
          theme === 'dark' ? choice.solidDark : choice.solidLight
        )
        const asArray = (value: string) => {
          const colour = parseColor(value)

          return [colour.r, colour.g, colour.b].map(Math.round)
        }
        expect(asArray(await resolved(page, '--accent')), key).toEqual([
          accent.r,
          accent.g,
          accent.b,
        ])
        expect(asArray(await resolved(page, '--accent-solid')), key).toEqual([
          solid.r,
          solid.g,
          solid.b,
        ])
        // The soft fill and the border follow the accent: same hue channel order, never a listed value.
        const soft = parseColor(await resolved(page, '--accent-soft'))
        expect(soft.a).toBeCloseTo(theme === 'dark' ? 0.14 : 0.1, 2)
        expect([soft.r, soft.g, soft.b].map(Math.round)).toEqual([
          accent.r,
          accent.g,
          accent.b,
        ])

        // The primary button of the dialog: solid, white text, and lighter/darker on hover.
        await page.getByTestId('open-settings').click()
        const button = page.getByTestId('settings-save')
        await page.mouse.move(2, 2)
        const rest = await button.evaluate((node) => {
          const style = getComputedStyle(node)

          return { text: style.color, fill: style.backgroundColor }
        })
        await button.hover()
        await expect
          .poll(() =>
            button.evaluate((node) => getComputedStyle(node).backgroundColor)
          )
          .not.toBe(rest.fill)
        const hovered = await button.evaluate((node) => {
          const style = getComputedStyle(node)

          return { text: style.color, fill: style.backgroundColor }
        })
        const black = { r: 0, g: 0, b: 0, a: 1 }
        for (const state of [rest, hovered]) {
          expect(
            contrast(
              parseColor(state.text),
              over(parseColor(state.fill), black)
            ),
            `${key} ${theme}: ${state.text} on ${state.fill}`
          ).toBeGreaterThanOrEqual(4.5)
        }
        // Accent as text on the dialog card, which is what it is used for.
        const card = await page
          .getByTestId('modal-card')
          .evaluate((node) => getComputedStyle(node).backgroundColor)
        expect(
          contrast(accent, over(parseColor(card), black)),
          `${key} ${theme} accent text on the card`
        ).toBeGreaterThanOrEqual(4.5)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId('modal-card')).toHaveCount(0)
      }
    } finally {
      await closeApp(context)
    }
  })
}

test('there is no blob layer behind the opaque canvas, and the choice survives a restart', async () => {
  const first = await launchApp()
  const { userDataDir } = first
  try {
    const { page } = first
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('.app-bg')).toHaveCount(0)
    await expect(page.locator('.blob')).toHaveCount(0)
    await chooseAndSave(page, 'dark', 'forest')
    await expect(page.locator('.app-bg')).toHaveCount(0)
    await expect(page.locator('.blob')).toHaveCount(0)
  } finally {
    await closeApp(first, { cleanup: false })
  }

  const second = await launchApp(userDataDir)
  try {
    const { page } = second
    await expect(page.getByTestId('app-root')).toHaveAttribute(
      'data-background',
      'forest'
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openAppearance(page)
    await expect(page.getByTestId('background-forest')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(
      page.getByTestId('background-forest').locator('svg')
    ).toHaveCount(1)
  } finally {
    await closeApp(second)
  }
})

async function ballOf(context: AppContext): Promise<Page> {
  await context.page.evaluate(() => window.quickLaunch.window.collapse())
  await expect.poll(() => context.electronApp.windows().length).toBe(2)
  const bubble = context.electronApp
    .windows()
    .find((candidate) => candidate !== context.page)!
  await expect(bubble.getByTestId('dock-bubble')).toBeVisible()

  return bubble
}

test('the ball stays the brand violet whichever accent is chosen', async () => {
  const context = await launchApp()
  try {
    await context.page.emulateMedia({ reducedMotion: 'reduce' })
    await chooseAndSave(context.page, 'dark', 'forest')
    const bubble = await ballOf(context)

    const surface = await bubble
      .locator('.dock-bubble-surface')
      .evaluate((node) => getComputedStyle(node).backgroundImage)
    expect(surface).toContain('rgb(154, 133, 255)')
    expect(surface).toContain('rgb(85, 68, 218)')
    // The ball window gets no accent of its own, so its tokens are still the violet defaults.
    const accent = await resolved(bubble, '--accent')
    expect(accent).toBe('rgb(165, 148, 255)')
  } finally {
    await closeApp(context)
  }
})
