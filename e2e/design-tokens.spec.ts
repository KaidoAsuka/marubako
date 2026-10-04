// Iteration 4, colour and motion foundation: what the real windows resolve the design tokens to.
import { test, expect, type Page } from '@playwright/test'

import {
  colorLiterals,
  contrast,
  isBlue,
  mixOpaque,
  over,
  parseColor,
  toHsl,
} from '../src/renderer/src/styles/__tests__/css-utils'
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

/** Every colour the ball window resolves to, as `where prop: value` lines. */
async function ballColours(bubble: Page): Promise<string[]> {
  return bubble.evaluate(() => {
    const lines: string[] = []
    const props = [
      'color',
      'backgroundColor',
      'backgroundImage',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'boxShadow',
      'filter',
      'accentColor',
    ] as const
    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element)
      for (const prop of props) {
        lines.push(
          `${element.className || element.tagName} ${prop}: ${style[prop]}`
        )
      }
    }
    // The tokens themselves, resolved through a probe so color-mix() comes back as a colour.
    const probe = document.createElement('i')
    document.body.append(probe)
    for (const name of [
      '--accent',
      '--accent-soft',
      '--accent-border',
      '--accent-solid',
      '--accent-solid-hover',
      '--brand-start',
      '--brand-end',
    ]) {
      probe.style.color = `var(${name})`
      lines.push(`:root ${name}: ${getComputedStyle(probe).color}`)
    }
    probe.remove()

    return lines
  })
}

function blueIn(lines: string[]): string[] {
  const found: string[] = []
  for (const line of lines) {
    for (const literal of colorLiterals(line)) {
      if (isBlue(parseColor(literal))) found.push(`${line} -> ${literal}`)
    }
  }

  return found
}

for (const theme of ['dark', 'light'] as const) {
  test(`the ball window shows no blue in the ${theme} theme, in any of its states`, async () => {
    const context = await launchApp()
    try {
      if (theme === 'light') {
        await context.page.getByTestId('open-settings').click()
        await context.page.getByTestId('theme-light').click()
        await context.page.getByTestId('settings-save').click()
        await expect(context.page.getByTestId('app-root')).toHaveClass(
          /theme-light/
        )
      }
      const bubble = await openBall(context)
      await expect(bubble.locator('.dock-root')).toHaveClass(
        new RegExp(`theme-${theme}`)
      )
      const surface = bubble.locator('.dock-bubble-surface')
      const button = bubble.getByTestId('dock-bubble')
      await bubble.mouse.move(0, 0)

      // Resting.
      const resting = await ballColours(bubble)
      expect(blueIn(resting)).toEqual([])
      // The brand violet is what draws the ball, in both themes.
      expect(resting.join('\n')).toContain('rgb(154, 133, 255)')
      expect(resting.join('\n')).toContain('rgb(85, 68, 218)')

      // Pressed, shrunk to the dot, and being dragged.
      await button.evaluate((node) => node.setAttribute('data-pressed', '1'))
      await surface.evaluate((node) => node.setAttribute('data-morph', 'dot'))
      await button.evaluate((node) => node.classList.add('dragging'))
      expect(blueIn(await ballColours(bubble))).toEqual([])
      await button.evaluate((node) => {
        node.removeAttribute('data-pressed')
        node.classList.remove('dragging')
      })
      await surface.evaluate((node) => node.setAttribute('data-morph', 'ball'))

      // Hovered by a real pointer.
      await button.hover()
      await expect
        .poll(async () => blueIn(await ballColours(bubble)))
        .toEqual([])
      await bubble.mouse.move(0, 0)

      // Keyboard focus draws its own ring; the global accent outline must not appear on top.
      await context.electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => !window.isResizable())!
          .focus()
      )
      await bubble.keyboard.press('Tab')
      await expect(button).toBeFocused()
      expect(blueIn(await ballColours(bubble))).toEqual([])
    } finally {
      await closeApp(context)
    }
  })
}

test('dark theme primary button keeps readable text on hover, in every palette', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const key of ['aurora', 'sunset', 'forest', 'ocean', 'minimal']) {
      await page.getByTestId('open-settings').click()
      await page.getByTestId(`background-${key}`).click()
      await page.getByTestId('settings-save').click()
      await expect(page.getByTestId('modal-card')).toHaveCount(0)

      await page.getByTestId('open-settings').click()
      const save = page.getByTestId('settings-save')
      await save.hover()
      const { text, fill } = await save.evaluate((node) => {
        const style = getComputedStyle(node)

        return { text: style.color, fill: style.backgroundColor }
      })
      const solid = over(parseColor(fill), { r: 0, g: 0, b: 0, a: 1 })
      expect(
        contrast(parseColor(text), solid),
        `${key}: ${text} on ${fill}`
      ).toBeGreaterThanOrEqual(4.5)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('modal-card')).toHaveCount(0)
    }
  } finally {
    await closeApp(context)
  }
})

test('a disabled primary button does not light up on hover', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-websites').click()
    await page.getByTestId('add-loose-item-websites').click()
    const save = page.getByTestId('item-save')
    await expect(save).toBeVisible()
    const fill = () =>
      save.evaluate((node) => getComputedStyle(node).backgroundColor)
    const rest = await fill()
    await save.evaluate((node) => {
      ;(node as HTMLButtonElement).disabled = true
    })
    await save.hover({ force: true })
    expect(await fill()).toBe(rest)
    // Enabled again, the same hover does change it.
    await save.evaluate((node) => {
      ;(node as HTMLButtonElement).disabled = false
    })
    await page.mouse.move(0, 0)
    await save.hover()
    await expect.poll(fill).not.toBe(rest)
  } finally {
    await closeApp(context)
  }
})

for (const [theme, solid] of [
  ['dark', 'rgb(101, 83, 228)'],
  ['light', 'rgb(85, 68, 218)'],
] as const) {
  test(`settings sliders are drawn in the ${theme} accent, with the thumb at the filled edge`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      if (theme === 'light') {
        await page.getByTestId('open-settings').click()
        await page.getByTestId('theme-light').click()
        await page.getByTestId('settings-save').click()
        await expect(page.getByTestId('app-root')).toHaveClass(/theme-light/)
      }
      await page.getByTestId('open-settings').click()
      const slider = page.locator('#settings-font-size')
      expect(
        await slider.evaluate((node) => getComputedStyle(node).appearance)
      ).toBe('none')
      // Font size 100 on a 80..140 range: a third of the way along.
      expect(
        Number(
          await slider.evaluate((node) =>
            node.style.getPropertyValue('--range-fill')
          )
        )
      ).toBeCloseTo(1 / 3, 3)

      // Pseudo-elements of a range input cannot be read back with getComputedStyle, so look at
      // the pixels: filled part in the accent, unfilled part neutral, nothing blue.
      const box = (await slider.boundingBox())!
      const shot = (await slider.screenshot()).toString('base64')
      const sample = (fraction: number) =>
        page.evaluate(
          async ([base64, cssX, cssY, cssWidth]) => {
            // The page's CSP forbids fetch() of a data: URL, so build the blob by hand.
            const bytes = Uint8Array.from(atob(base64), (char) =>
              char.charCodeAt(0)
            )
            const bitmap = await createImageBitmap(
              new Blob([bytes], { type: 'image/png' })
            )
            // The screenshot is in device pixels; the coordinates are in CSS pixels.
            const scale = bitmap.width / cssWidth
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
            const context2d = canvas.getContext('2d')!
            context2d.drawImage(bitmap, 0, 0)
            const [r, g, b] = context2d.getImageData(
              Math.round(cssX * scale),
              Math.round(cssY * scale),
              1,
              1
            ).data

            return `rgb(${r}, ${g}, ${b})`
          },
          [
            shot,
            8 + (box.width - 16) * fraction,
            box.height / 2,
            box.width,
          ] as const
        )
      const filled = await sample(0.15)
      const unfilled = await sample(0.85)
      expect(filled).toBe(solid)
      expect(isBlue(parseColor(unfilled)), `unfilled track ${unfilled}`).toBe(
        false
      )
      // `accent-color` would turn the unfilled track near-white (#efefef) in the dark theme.
      if (theme === 'dark') {
        expect(
          contrast(parseColor(unfilled), { r: 0, g: 0, b: 0, a: 1 }),
          `unfilled track ${unfilled}`
        ).toBeLessThan(6)
      }

      await slider.fill('140')
      await expect
        .poll(() =>
          slider.evaluate((node) => node.style.getPropertyValue('--range-fill'))
        )
        .toBe('1')
    } finally {
      await closeApp(context)
    }
  })
}

type Surface = {
  card: string
  cardBorder: string
  footer: string
  field: string
  fieldBorder: string
}

/** What a dialog and its first form control resolve to on screen. */
async function surfaceOf(
  page: Page,
  control: string,
  card = '[data-testid="modal-card"]'
): Promise<Surface> {
  return page.evaluate(
    ([cardSelector, controlSelector]) => {
      const colour = (selector: string, prop: 'backgroundColor') =>
        getComputedStyle(document.querySelector(selector)!)[prop]
      const field = document.querySelector(controlSelector!)!
      const fieldStyle = getComputedStyle(field)

      return {
        card: colour(cardSelector!, 'backgroundColor'),
        cardBorder: getComputedStyle(document.querySelector(cardSelector!)!)
          .borderTopColor,
        footer: colour(`${cardSelector} .modal-actions`, 'backgroundColor'),
        field: fieldStyle.backgroundColor,
        fieldBorder: fieldStyle.borderTopColor,
      }
    },
    [card, control] as const
  )
}

for (const theme of ['dark', 'light'] as const) {
  test(`the settings dialog and the item editor share their surface and input styling (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      if (theme === 'light') {
        await page.getByTestId('open-settings').click()
        await page.getByTestId('theme-light').click()
        await page.getByTestId('settings-save').click()
        await expect(page.getByTestId('app-root')).toHaveClass(/theme-light/)
      }
      await page.getByTestId('open-settings').click()
      await page.getByTestId('settings-tab-data').click()
      const settings = await surfaceOf(page, '#settings-language')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('modal-card')).toHaveCount(0)

      await page.getByTestId('tab-websites').click()
      await page.getByTestId('add-loose-item-websites').click()
      // A website starts with its address (the name is made from it unless typed).
      await expect(page.getByTestId('item-url-input')).toBeFocused()
      // The name field: the address field has the cursor (and so the focus border) in this form.
      const editor = await surfaceOf(
        page,
        '[data-testid="item-name-input"]',
        '[data-testid="modal-card"]'
      )

      expect(editor.card).toBe(settings.card)
      expect(editor.cardBorder).toBe(settings.cardBorder)
      expect(editor.footer).toBe(settings.footer)
      expect(editor.field).toBe(settings.field)
      expect(editor.fieldBorder).toBe(settings.fieldBorder)
      // The canvas colour for the field, the card colour for the dialog, one level apart.
      const canvas = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--workspace-bg')
          .trim()
      )
      expect(parseColor(settings.field)).toEqual(parseColor(canvas))
      expect(settings.field).not.toBe(settings.card)
    } finally {
      await closeApp(context)
    }
  })
}

test('light theme small text, tab names, the search label and status colours stay readable on the real screen', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('app-root')).toHaveClass(/theme-light/)

    const read = (selector: string, pseudo?: string) =>
      page.evaluate(
        ([target, pseudoElement]) => {
          const style = getComputedStyle(
            document.querySelector(target!)!,
            pseudoElement || null
          )

          return { color: style.color, opacity: style.opacity }
        },
        [selector, pseudo ?? ''] as const
      )
    const bg = (selector: string) =>
      page.evaluate(
        (target) =>
          getComputedStyle(document.querySelector(target)!).backgroundColor,
        selector
      )

    // The error line of the feedback strip: words in --text on a red-tinted fill (red words on it
    // were about 3.5:1). The status arrives the way main pushes it.
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send('data-status-changed', {
          writeError: 'disk full',
          notices: [],
        })
    })
    await expect(
      page.locator('.feedback-strip[data-kind="error"][data-open]')
    ).toBeVisible()
    await page.waitForTimeout(300)
    const alertWords = await read('.feedback-strip .feedback-text')
    expect(
      contrast(
        parseColor(alertWords.color),
        over(
          parseColor(await bg('.feedback-strip .feedback-body')),
          parseColor(await bg('.workspace-nav'))
        )
      )
    ).toBeGreaterThanOrEqual(4.5)
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send('data-status-changed', {
          writeError: null,
          notices: [],
        })
    })
    await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0)
    // A tab name (the dimmest text of the category row) and the label of the search entry are the dim
    // text colour at full opacity, and read on the bars they sit on.
    const tab = await read('[data-testid="tab-websites"]')
    expect(tab.opacity).toBe('1')
    expect(
      contrast(parseColor(tab.color), parseColor(await bg('.workspace-nav')))
    ).toBeGreaterThanOrEqual(4.5)
    const search = await read('.titlebar-search span')
    expect(search.opacity).toBe('1')
    expect(
      contrast(
        parseColor(search.color),
        parseColor(await bg('.titlebar-search'))
      )
    ).toBeGreaterThanOrEqual(4.5)
    const canvas = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--workspace-bg')
        .trim()
    )
    // The status colours, probed through a real element so they are what the theme resolves to.
    for (const token of ['--success', '--warning', '--danger']) {
      const colour = await page.evaluate((name) => {
        const probe = document.createElement('i')
        document.body.append(probe)
        probe.style.color = `var(${name})`
        const resolved = getComputedStyle(probe).color
        probe.remove()

        return resolved
      }, token)
      expect(
        contrast(parseColor(colour), parseColor(canvas)),
        `${token} ${colour} on the canvas`
      ).toBeGreaterThanOrEqual(4.5)
    }
  } finally {
    await closeApp(context)
  }
})

// color-3: the accent has a use per role.
function isViolet(colour: string): boolean {
  const { r, g, b, a } = parseColor(colour)
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
  const { h } = toHsl({ r, g, b, a })

  return a > 0.03 && chroma > 0.12 && h >= 235 && h <= 275
}

async function useTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  if (theme === 'dark') return
  await page.getByTestId('open-settings').click()
  await page.getByTestId('theme-light').click()
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('app-root')).toHaveClass(/theme-light/)
}

const fillOf = (page: Page, testId: string) =>
  page
    .getByTestId(testId)
    .evaluate((node) => getComputedStyle(node).backgroundColor)

for (const theme of ['dark', 'light'] as const) {
  test(`no box on the folders screen is both filled and outlined in the accent (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await useTheme(page, theme)
      await page.getByTestId('tab-folders').click()
      await page.mouse.move(2, 2)

      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="app-root"] *')].map(
          (element) => {
            const style = getComputedStyle(element)

            return {
              name: `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, '.')}`,
              fill: style.backgroundColor,
              line: style.borderTopColor,
              lineWidth: style.borderTopWidth,
            }
          }
        )
      )
      const tintedAndOutlined = boxes.filter(
        (box) =>
          isViolet(box.fill) && box.lineWidth !== '0px' && isViolet(box.line)
      )

      expect(tintedAndOutlined).toEqual([])
      // What is tinted without a line is what is offered: the toolbar action, and (layout-2) a group
      // tile, which is told from a loose entry by its soft fill and has the plain line.
      const tinted = boxes.filter((box) => isViolet(box.fill))
      const groupTiles = tinted.filter((box) =>
        box.name.startsWith('article.folder-widget')
      )
      expect(tinted.map((box) => box.name)).toContain(
        'button.primary-button.section-add'
      )
      expect(groupTiles).toHaveLength(2)
      expect(tinted.length - groupTiles.length).toBeLessThanOrEqual(3)
    } finally {
      await closeApp(context)
    }
  })

  test(`primary buttons keep to their roles: soft in the toolbar, solid in a dialog, tinted red when destructive (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await useTheme(page, theme)
      const solid = theme === 'dark' ? 'rgb(101, 83, 228)' : 'rgb(85, 68, 218)'
      // The hover fill is derived from the solid fill (themes.css): a little white on dark, a
      // little black on light.
      const solidHover = mixOpaque(
        theme === 'dark'
          ? { r: 255, g: 255, b: 255, a: 1 }
          : { r: 0, g: 0, b: 0, a: 1 },
        theme === 'dark' ? 0.06 : 0.14,
        parseColor(solid)
      )
      const canvas = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--workspace-bg')
          .trim()
      )

      // Toolbar: soft fill, no line, accent text that reads on it.
      const toolbar = page.getByTestId('add-loose-item-folders')
      const soft = await toolbar.evaluate((node) => {
        const style = getComputedStyle(node)

        return {
          fill: style.backgroundColor,
          line: style.borderTopColor,
          text: style.color,
        }
      })
      expect(parseColor(soft.line).a).toBe(0)
      expect(isViolet(soft.fill)).toBe(true)
      expect(
        contrast(
          parseColor(soft.text),
          over(parseColor(soft.fill), parseColor(canvas))
        )
      ).toBeGreaterThanOrEqual(4.5)

      // Dialog: the save button is solid at rest and one step lighter or darker on hover.
      await page.getByTestId('open-settings').click()
      const save = page.getByTestId('settings-save')
      await page.mouse.move(2, 2)
      expect(await fillOf(page, 'settings-save')).toBe(solid)
      expect(await save.evaluate((node) => getComputedStyle(node).color)).toBe(
        'rgb(255, 255, 255)'
      )
      await save.hover()
      await expect
        .poll(async () => {
          const seen = parseColor(await fillOf(page, 'settings-save'))

          return Math.max(
            Math.abs(seen.r - solidHover.r),
            Math.abs(seen.g - solidHover.g),
            Math.abs(seen.b - solidHover.b)
          )
        })
        .toBeLessThan(1.5)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('modal-card')).toHaveCount(0)

      // Destructive: tinted red at rest in the same footer, solid red with white text on hover.
      await page.getByTestId('tab-folders').click()
      await page.getByTestId('folder-widget-grp-folders-work').hover()
      await page
        .getByTestId('folder-widget-grp-folders-work')
        .getByRole('button', { name: '删除' })
        .click()
      const confirm = page.getByTestId('confirm-submit')
      await expect(confirm).toBeVisible()
      await page.mouse.move(2, 2)
      const rest = await confirm.evaluate((node) => {
        const style = getComputedStyle(node)

        return { fill: style.backgroundColor, text: style.color }
      })
      expect(isViolet(rest.fill)).toBe(false)
      expect(parseColor(rest.fill).r).toBeGreaterThan(parseColor(rest.fill).b)
      expect(parseColor(rest.text).r).toBeGreaterThan(parseColor(rest.text).b)
      await confirm.hover()
      const dangerSolid =
        theme === 'dark' ? 'rgb(207, 63, 82)' : 'rgb(201, 47, 63)'
      await expect
        .poll(() =>
          confirm.evaluate((node) => getComputedStyle(node).backgroundColor)
        )
        .toBe(dangerSolid)
      const hoverText = await confirm.evaluate(
        (node) => getComputedStyle(node).color
      )
      expect(
        contrast(parseColor(hoverText), parseColor(dangerSolid))
      ).toBeGreaterThanOrEqual(4.5)
    } finally {
      await closeApp(context)
    }
  })
}

test('a focused field changes its border and draws no glow; the selected calendar day is solid', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-websites').click()
    await page.getByTestId('add-loose-item-websites').click()
    // The address is the first field of a website, and has the cursor.
    const name = page.getByTestId('item-url-input')
    await expect(name).toBeFocused()
    const focused = await name.evaluate((node) => {
      const style = getComputedStyle(node)

      return { shadow: style.boxShadow, line: style.borderTopColor }
    })
    expect(focused.shadow).toBe('none')
    expect(focused.line).toBe('rgb(165, 148, 255)')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    await page.getByTestId('tab-tasks').click()
    await page.getByTestId('date-display-toggle').click()
    const day = page.locator('[data-testid^="calendar-day-"].active')
    await expect(day).toBeVisible()
    expect(
      await day.evaluate((node) => getComputedStyle(node).backgroundColor)
    ).toBe('rgb(101, 83, 228)')
    expect(await day.evaluate((node) => getComputedStyle(node).color)).toBe(
      'rgb(255, 255, 255)'
    )
  } finally {
    await closeApp(context)
  }
})

test('the tab marker has no line of its own but is still visible against the tab bar', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const marker = await page.getByTestId('tab-folders').evaluate((node) => {
      const nav = node.parentElement!
      const style = getComputedStyle(nav, '::before')

      return {
        line: style.borderTopColor,
        lineWidth: style.borderTopWidth,
        fill: style.backgroundColor,
        bar: getComputedStyle(nav.parentElement!).backgroundColor,
      }
    })
    expect(parseColor(marker.line).a).toBe(0)
    expect(isViolet(marker.fill)).toBe(true)
    expect(
      contrast(
        over(parseColor(marker.fill), parseColor(marker.bar)),
        parseColor(marker.bar)
      )
    ).toBeGreaterThanOrEqual(1.3)
  } finally {
    await closeApp(context)
  }
})

// color-7: one neutral scrim and two shadows.
const chromaOf = (colour: { r: number; g: number; b: number }) =>
  (Math.max(colour.r, colour.g, colour.b) -
    Math.min(colour.r, colour.g, colour.b)) /
  255

for (const theme of ['dark', 'light'] as const) {
  test(`every dialog sits on the same neutral scrim and the shadows follow the theme (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await useTheme(page, theme)
      const canvas = parseColor(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--workspace-bg')
            .trim()
        )
      )
      const scrim = (selector: string) =>
        page.evaluate((target) => {
          const style = getComputedStyle(document.querySelector(target)!)

          return { fill: style.backgroundColor, blur: style.backdropFilter }
        }, selector)
      const shadow = (selector: string) =>
        page.evaluate(
          (target) =>
            getComputedStyle(document.querySelector(target)!).boxShadow,
          selector
        )
      // Dark: black at 0.36 / 0.5; light: slate at 0.12 / 0.18.
      const colourPart =
        theme === 'dark' ? 'rgba(0, 0, 0, ' : 'rgba(15, 23, 42, '
      const pop = theme === 'dark' ? '0.36' : '0.12'
      const modal = theme === 'dark' ? '0.5' : '0.18'

      await page.getByTestId('open-settings').click()
      const seen: string[] = []
      const dialog = await scrim('.modal-overlay')
      seen.push(dialog.fill)
      expect(dialog.blur).toBe('blur(6px)')
      expect(await shadow('.modal-card')).toBe(
        `${colourPart}${modal}) 0px 24px 64px 0px`
      )
      await page.getByTestId('settings-save').click()
      await expect(page.getByTestId('modal-settings')).toHaveCount(0)
      // What floats (here the calendar) is the small shadow; saving said nothing, so no strip.
      await page.getByTestId('tab-tasks').click()
      await page.getByTestId('date-display-toggle').click()
      await expect(page.getByTestId('date-calendar')).toBeVisible()
      expect(await shadow('.calendar-popover')).toBe(
        `${colourPart}${pop}) 0px 8px 24px 0px`
      )
      await page.getByTestId('date-display-toggle').click()
      await expect(page.getByTestId('date-calendar')).toHaveCount(0)

      await page.keyboard.press('Control+k')
      await expect(page.getByTestId('command-input')).toBeFocused()
      const palette = await scrim('.command-overlay')
      seen.push(palette.fill)
      expect(palette.blur).toBe('blur(6px)')
      expect(await shadow('.command-dialog')).toBe(
        `${colourPart}${modal}) 0px 24px 64px 0px`
      )
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)

      await page.getByTestId('tab-folders').click()
      await page.getByTestId('folder-widget-grp-folders-work').click()
      await expect(page.locator('.widget-popup')).toBeVisible()
      const popup = await scrim('.widget-popup-overlay')
      seen.push(popup.fill)
      expect(popup.blur).toBe('blur(6px)')
      expect(await shadow('.widget-popup')).toBe(
        `${colourPart}${modal}) 0px 24px 64px 0px`
      )

      // One scrim for all three, and what it lays over the canvas is a quiet grey, not a tint.
      expect(new Set(seen).size).toBe(1)
      const laidOver = over(parseColor(seen[0]!), canvas)
      expect(chromaOf(laidOver)).toBeLessThan(0.05)
    } finally {
      await closeApp(context)
    }
  })
}
