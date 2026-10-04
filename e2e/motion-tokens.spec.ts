// Iteration 4, motion foundation and feedback: what the real renderer resolves the motion tokens to.
import path from 'node:path'

import { test, expect, type Page } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

/** Splits a computed list such as `0.12s, 0.18s` or `cubic-bezier(0.2, 0, 0, 1), linear(0, 1)`. */
function splitList(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current.trim())

  return parts
}

type Timing = { where: string; kind: string; duration: string; curve: string }

/** Every non-zero transition and animation on the page, with its duration and curve. */
async function timings(page: Page): Promise<Timing[]> {
  const raw = await page.evaluate(() => {
    const found: {
      where: string
      kind: string
      durations: string
      curves: string
    }[] = []
    const visit = (element: Element, pseudo: string | null) => {
      const style = getComputedStyle(element, pseudo)
      const where = `${element.tagName.toLowerCase()}.${String(element.className).trim().replace(/\s+/g, '.')}${pseudo ?? ''}`
      found.push({
        where,
        kind: 'transition',
        durations: style.transitionDuration,
        curves: style.transitionTimingFunction,
      })
      found.push({
        where,
        kind: 'animation',
        durations: style.animationDuration,
        curves: style.animationTimingFunction,
      })
    }
    for (const element of document.querySelectorAll('body *')) {
      visit(element, null)
      visit(element, '::before')
      visit(element, '::after')
    }

    return found
  })

  return raw.flatMap(({ where, kind, durations, curves }) => {
    const lengths = splitList(durations)
    const timingFunctions = splitList(curves)

    return lengths.flatMap((duration, index) =>
      duration === '0s'
        ? []
        : [
            {
              where,
              kind,
              duration,
              curve: timingFunctions[index % timingFunctions.length] ?? '',
            },
          ]
    )
  })
}

const ALLOWED_DURATIONS = new Set(['0.09s', '0.12s', '0.18s', '0.6s'])
const isTokenCurve = (curve: string) =>
  curve === 'cubic-bezier(0.2, 0, 0, 1)' ||
  curve === 'cubic-bezier(0.4, 0, 1, 1)' ||
  curve.startsWith('linear(')

function stray(found: Timing[]): string[] {
  return found
    .filter(
      (timing) =>
        !ALLOWED_DURATIONS.has(timing.duration) || !isTokenCurve(timing.curve)
    )
    .map(
      (timing) =>
        `${timing.kind} ${timing.where}: ${timing.duration} ${timing.curve}`
    )
}

test('the runtime motion tokens follow the motion setting, with the ball and panel scale', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const tokens = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)

        return [
          '--motion-instant',
          '--motion-fast',
          '--motion-normal',
          '--motion-spring',
        ].map((name) => style.getPropertyValue(name).trim())
      })
    // The default setting is the standard duration, 100% on the slider: 120, 180 and 600 ms, and a
    // press that never scales. The slider spans 60% to 160%, the range of the time scale.
    expect(await tokens()).toEqual(['90ms', '120ms', '180ms', '600ms'])

    for (const [percent, expected] of [
      [60, ['90ms', '72ms', '108ms', '360ms']],
      [160, ['90ms', '192ms', '288ms', '960ms']],
      [100, ['90ms', '120ms', '180ms', '600ms']],
    ] as const) {
      await page.getByTestId('open-settings').click()
      await page.getByTestId('settings-tab-appearance').click()
      await page.locator('#settings-motion').fill(String(percent))
      await page.getByTestId('settings-save').click()
      await expect(page.getByTestId('modal-card')).toHaveCount(0)
      await expect.poll(tokens).toEqual([...expected])
    }
  } finally {
    await closeApp(context)
  }
})

test('every transition and animation in the open app uses a token duration and curve', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    const seen: Timing[] = []
    const sweep = async () => {
      seen.push(...(await timings(page)))
    }

    await page.getByTestId('tab-folders').click()
    await sweep()
    // A dialog, the search palette, a folder popup, the calendar and the emoji picker, mid-flight
    // as well as settled: the entrance animations are what carried the old literals.
    await page.getByTestId('open-settings').click()
    await sweep()
    await page.waitForTimeout(400)
    await sweep()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-input')).toBeFocused()
    await sweep()
    await page.keyboard.press('Escape')
    await page.getByTestId('tab-folders').click()
    await page.getByTestId('folder-widget-grp-folders-work').click()
    await expect(page.locator('.widget-popup')).toBeVisible()
    await sweep()
    await page.keyboard.press('Escape')
    await page.getByTestId('tab-tasks').click()
    await page.getByTestId('date-display-toggle').click()
    await sweep()
    await page.keyboard.press('Escape')
    await page.getByTestId('tab-websites').click()
    await page.getByTestId('add-loose-item-websites').click()
    await page.locator('.emoji-picker-trigger').first().click()
    await expect(page.locator('.emoji-picker-dropdown')).toBeVisible()
    await sweep()

    // Something real was measured, and it is all on the tokens.
    expect(seen.length).toBeGreaterThan(40)
    expect(new Set(stray(seen))).toEqual(new Set())
    const durations = new Set(seen.map((timing) => timing.duration))
    expect(durations.has('0.12s')).toBe(true)
    expect(durations.has('0.18s')).toBe(true)
  } finally {
    await closeApp(context)
  }
})

async function addLooseFolder(page: Page, name: string, target: string) {
  await page.getByTestId('tab-folders').click()
  await page.getByTestId('add-loose-item-folders').click()
  await page.getByTestId('item-name-input').fill(name)
  await page.getByTestId('item-path-input').fill(target)
  await page.getByTestId('item-save').click()
  await expect(page.getByTestId('modal-item')).toHaveCount(0)
  const card = page.locator('.widget-loose').filter({ hasText: name })
  await expect(card).toHaveCount(1)

  return card
}

test('a card answers a click at once, swallows the double click, and shows a failed launch', async () => {
  const context = await launchApp()
  const { page, electronApp } = context
  try {
    // The real folder would open in Explorer: count calls in the main process instead.
    await electronApp.evaluate(({ shell }) => {
      const scope = globalThis as typeof globalThis & { __opens: number }
      scope.__opens = 0
      shell.openPath = async () => {
        scope.__opens += 1

        return ''
      }
    })
    expect(
      await electronApp.evaluate(({ shell }) =>
        shell.openPath.toString().includes('__opens')
      )
    ).toBe(true)
    const opens = () =>
      electronApp.evaluate(
        () => (globalThis as typeof globalThis & { __opens: number }).__opens
      )

    const good = await addLooseFolder(page, 'Opens fine', context.userDataDir)
    const icon = good.locator('.widget-loose-box')
    await page.mouse.move(2, 2)

    // A press squeezes the icon at once, and a plain click never shows the grabbing cursor.
    const box = (await icon.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect
      .poll(() => icon.evaluate((node) => getComputedStyle(node).transform))
      .toBe('matrix(0.92, 0, 0, 0.92, 0, 0)')
    expect(await good.evaluate((node) => getComputedStyle(node).cursor)).toBe(
      'grab'
    )
    await page.mouse.up()
    await expect(good).toHaveAttribute('data-launch', 'launching')
    await expect(good).toHaveCSS('animation-name', 'launchRing')
    await expect(icon).toHaveCSS('animation-name', 'launchPop')
    await expect(good).not.toHaveAttribute('data-launch', /./, {
      timeout: 2000,
    })
    expect(await opens()).toBe(1)

    // A double click on the same card opens it once.
    await good.dblclick()
    await expect(good).toHaveAttribute('data-launch', 'launching')
    await expect(good).not.toHaveAttribute('data-launch', /./, {
      timeout: 2000,
    })
    expect(await opens()).toBe(2)

    // Pressing the card's own edit button does not squeeze its icon.
    await good.hover()
    const edit = good.getByRole('button', { name: '编辑条目' })
    const editBox = (await edit.boundingBox())!
    await page.mouse.move(
      editBox.x + editBox.width / 2,
      editBox.y + editBox.height / 2
    )
    await page.mouse.down()
    await page.waitForTimeout(250)
    // Whatever hover does to the icon, it is not the 0.92 squeeze of a press.
    expect(
      await icon.evaluate(
        (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a
      )
    ).toBe(1)
    await page.mouse.move(2, 2)
    await page.mouse.up()
    await expect(page.getByTestId('modal-item')).toHaveCount(0)

    // A launch that fails keeps a red outline for a moment, with a message in the strip, and can be retried.
    const bad = await addLooseFolder(
      page,
      'Missing',
      path.join(context.userDataDir, 'missing-directory')
    )
    await page.mouse.move(2, 2)
    await bad.click()
    await expect(bad).toHaveAttribute('data-launch', 'failed')
    await expect(
      page.locator('.feedback-strip[data-kind="danger"]')
    ).toBeVisible()
    await expect
      .poll(() => bad.evaluate((node) => getComputedStyle(node).borderTopColor))
      .toBe('rgb(248, 113, 113)')
    await bad.click()
    expect(await opens()).toBe(2)
    await expect(bad).not.toHaveAttribute('data-launch', /./, {
      timeout: 3000,
    })
  } finally {
    await closeApp(context)
  }
})

async function useLightTheme(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click()
  await page.getByTestId('theme-light').click()
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('app-root')).toHaveClass(/theme-light/)
}

async function addPasswordItem(page: Page): Promise<void> {
  await page.getByTestId('tab-passwords').click()
  await page.getByTestId('add-loose-item-passwords').click()
  await page.getByTestId('item-name-input').fill('Router')
  await page.getByTestId('item-username-input').fill('admin')
  await page.getByTestId('item-password-input').fill('s3cret-pass')
  await page.getByTestId('item-save').click()
  await expect(page.getByTestId('modal-item')).toHaveCount(0)
}

for (const theme of ['dark', 'light'] as const) {
  test(`a copy turns the pressed button into a green tick, one per button, with no message in the strip (${theme})`, async () => {
    const context = await launchApp()
    const { page } = context
    try {
      if (theme === 'light') await useLightTheme(page)
      await addPasswordItem(page)
      await page.evaluate(() => {
        const scope = globalThis as typeof globalThis & { copied: string[] }
        scope.copied = []
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (value: string) => {
              scope.copied.push(value)
            },
          },
        })
      })
      // Saving a new item says "added" (with an undo, for 6 seconds); wait for that to go, so
      // anything shown later would be from the copy.
      await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0, {
        timeout: 10_000,
      })

      const row = page.locator('.password-item').filter({ hasText: 'Router' })
      const user = row.getByTestId(/^copy-username-/)
      const secret = row.getByTestId(/^copy-item-/)
      const value = user.locator('.credential-value')
      const restValueColour = await value.evaluate(
        (node) => getComputedStyle(node).color
      )
      const copyGlyph = await user.locator('svg').innerHTML()
      await page.mouse.move(2, 2)

      await user.click()
      await expect(user).toHaveAttribute('data-copied', '')
      await expect
        .poll(() => user.locator('svg').innerHTML())
        .not.toBe(copyGlyph)
      await expect(user.locator('svg')).toHaveCSS(
        'color',
        theme === 'dark' ? 'rgb(52, 211, 153)' : 'rgb(18, 122, 85)'
      )
      await expect(user.locator('svg')).toHaveCSS('animation-name', /tickPop/)
      // The row's text follows the tick on the dark theme only.
      const copiedValueColour = await value.evaluate(
        (node) => getComputedStyle(node).color
      )
      if (theme === 'dark') expect(copiedValueColour).toBe('rgb(52, 211, 153)')
      else expect(copiedValueColour).not.toBe('rgb(18, 122, 85)')
      expect(restValueColour).not.toBe('rgb(52, 211, 153)')
      await expect(
        row.locator('[role="status"]').filter({ hasText: '账号已复制' })
      ).toHaveCount(1)
      await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0)

      // A second copy right after is confirmed on its own button, and the first is still showing.
      await secret.click()
      await expect(secret).toHaveAttribute('data-copied', '')
      await expect(user).toHaveAttribute('data-copied', '')
      expect(
        await page.evaluate(
          () => (globalThis as typeof globalThis & { copied: string[] }).copied
        )
      ).toEqual(['admin', 's3cret-pass'])
      await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0)

      // Both go back by themselves.
      await expect(user).not.toHaveAttribute('data-copied', /./, {
        timeout: 3000,
      })
      await expect(secret).not.toHaveAttribute('data-copied', /./, {
        timeout: 3000,
      })
      await expect.poll(() => user.locator('svg').innerHTML()).toBe(copyGlyph)
    } finally {
      await closeApp(context)
    }
  })
}

test('a copy that fails shows a message in the strip and leaves the button as it was', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await addPasswordItem(page)
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('Clipboard is busy')
          },
        },
      })
    })
    const copy = page
      .locator('.password-item')
      .filter({ hasText: 'Router' })
      .getByTestId(/^copy-username-/)
    await copy.click()

    await expect(
      page.locator('.feedback-strip[data-kind="danger"]')
    ).toContainText('Clipboard is busy')
    await expect(copy).not.toHaveAttribute('data-copied', /./)
  } finally {
    await closeApp(context)
  }
})

/**
 * Forces `:hover` on an element through the DevTools protocol. The real pointer is not reliable for
 * this: the OS cursor can rest elsewhere, and Chromium drops a synthetic hover when it hears about
 * that. The forced state belongs to the protocol session, so one session serves the whole test.
 */
async function hoverControl(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument', { depth: -1 })

  return async (testId: string, hovered: boolean): Promise<void> => {
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `[data-testid="${testId}"]`,
    })
    await session.send('CSS.forcePseudoState', {
      nodeId,
      forcedPseudoClasses: hovered ? ['hover'] : [],
    })
  }
}

test('hovering moves nothing and re-truncates nothing, and the buttons on a card wait for the pointer', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    await page.getByTestId('tab-folders').click()
    await page.mouse.move(2, 2)
    const forceHover = await hoverControl(page)
    const card = page.getByTestId('folder-widget-grp-folders-work')
    const other = page.getByTestId('folder-widget-grp-folders-life')
    const name = card.locator('.widget-name')
    const icon = card.locator('.widget-box')
    const actions = card.locator('.widget-actions')
    const edit = card.getByRole('button', { name: '编辑分组' })
    const style = (target: typeof card, property: string) =>
      target.evaluate(
        (node, prop) =>
          getComputedStyle(node)[prop as keyof CSSStyleDeclaration] as string,
        property
      )
    const buttonIsHit = () =>
      edit.evaluate((node) => {
        const box = node.getBoundingClientRect()

        return (
          document
            .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
            ?.closest('button') === node
        )
      })

    // At rest: the buttons are invisible and cannot be pressed, and the card fades two properties.
    expect(await style(actions, 'opacity')).toBe('0')
    expect(await style(actions, 'pointerEvents')).toBe('none')
    expect(await style(card, 'transitionProperty')).toBe(
      'background-color, border-color'
    )
    expect(await style(card, 'transitionDuration')).toBe('0.12s, 0.12s')
    const restWidth = (await name.boundingBox())!.width
    // Chromium writes a time custom property as it likes (150ms or .15s): compare the duration.
    expect(
      await page.evaluate(() => {
        const value = getComputedStyle(document.documentElement)
          .getPropertyValue('--hover-intent')
          .trim()
        return value.endsWith('ms')
          ? Number.parseFloat(value)
          : Number.parseFloat(value) * 1000
      })
    ).toBeCloseTo(150, 5)

    // Stretch the intent delay, so the moment "the pointer has only just arrived" can be inspected
    // calmly, then hover.
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--hover-intent', '900ms')
    )
    await forceHover('folder-widget-grp-folders-work', true)
    expect(await style(card, 'transitionDuration')).toBe('0.09s')
    expect(await style(actions, 'transitionDelay')).toMatch(/^0\.9s/)
    expect(await style(actions, 'opacity')).toBe('0')
    expect(await style(actions, 'pointerEvents')).toBe('none')
    // A press where the edit button will be goes to the card, not to an invisible button.
    expect(await buttonIsHit()).toBe(false)
    // Nothing moved or re-truncated on the way.
    expect(await style(icon, 'transform')).toBe('none')
    expect(await style(name, 'paddingRight')).toBe('0px')
    expect((await name.boundingBox())!.width).toBe(restWidth)

    // Then they come, and can be pressed.
    await expect(actions).toHaveCSS('opacity', '1', { timeout: 4000 })
    await expect(actions).toHaveCSS('pointer-events', 'auto')
    expect(await buttonIsHit()).toBe(true)
    expect((await name.boundingBox())!.width).toBe(restWidth)
    expect(await style(icon, 'transform')).toBe('none')

    // Leaving takes them away again (the fade is 90ms, pressable until it is over).
    await forceHover('folder-widget-grp-folders-work', false)
    await expect(actions).toHaveCSS('opacity', '0')
    await expect(actions).toHaveCSS('pointer-events', 'none')

    // A pointer that only crosses a card, shorter than the delay, never brings its buttons up.
    await forceHover('folder-widget-grp-folders-life', true)
    await page.waitForTimeout(150)
    await forceHover('folder-widget-grp-folders-life', false)
    await page.waitForTimeout(1200)
    expect(await style(other.locator('.widget-actions'), 'opacity')).toBe('0')
    await page.evaluate(() =>
      document.documentElement.style.removeProperty('--hover-intent')
    )

    // The keyboard does not wait, and the buttons are in the tab order even while invisible.
    await edit.focus()
    await expect(edit).toBeFocused()
    await expect(actions).toHaveCSS('pointer-events', 'auto')
    await expect(actions).toHaveCSS('opacity', '1', { timeout: 500 })
    expect(await style(actions, 'transitionDelay')).toMatch(/^0s/)

    // A tab does not lift its icon either.
    await page.getByTestId('tab-websites').hover()
    expect(
      await page
        .getByTestId('tab-websites')
        .locator('.tab-button-icon')
        .evaluate((node) => getComputedStyle(node).transform)
    ).toBe('none')
  } finally {
    await closeApp(context)
  }
})

test('choosing a category slides its page in from the side its tab is on, and the day change is calmer', async () => {
  const context = await launchApp()
  const { page } = context
  try {
    // Folders is the first tab: websites and tasks lie to its right, and folders is back to the left.
    for (const [tab, section, name, from] of [
      ['websites', 'section-websites', 'pageInForward', 'translate(16px)'],
      ['tasks', 'section-tasks', 'pageInForward', 'translate(16px)'],
      ['folders', 'section-folders', 'pageInBackward', 'translate(-16px)'],
    ] as const) {
      // Click from inside the page and read the animation the new page starts with. (Counting the
      // frames of 180 ms is not reliable: a window that is not in front draws only a few.)
      const seen = await page.evaluate(
        async ([tabId, sectionId]) => {
          document
            .querySelector<HTMLElement>(`[data-testid="${tabId}"]`)!
            .click()
          // The new page is drawn a moment after the click, not within it.
          let node: HTMLElement | null = null
          for (let attempt = 0; attempt < 50 && !node; attempt++) {
            await Promise.resolve()
            node = document.querySelector<HTMLElement>(
              `[data-testid="${sectionId}"]`
            )
            if (!node) await new Promise((done) => setTimeout(done, 5))
          }
          if (!node) throw new Error(`${sectionId} did not appear`)
          const animations = node.getAnimations()
          const animation = animations[0] as CSSAnimation | undefined
          const effect = animation?.effect as KeyframeEffect | undefined
          const frames = effect?.getKeyframes() ?? []
          const report = {
            count: animations.length,
            name: animation?.animationName ?? '',
            duration: Number(effect?.getTiming().duration ?? 0),
            first: {
              opacity: String(frames[0]?.opacity ?? ''),
              transform: String(frames[0]?.transform ?? ''),
            },
            frames: frames.length,
          }
          await animation?.finished
          const settled = getComputedStyle(node)

          return {
            ...report,
            end: { opacity: settled.opacity, transform: settled.transform },
            left: node.getAnimations().length,
          }
        },
        [`tab-${tab}`, section] as const
      )

      // One animation: from the side the tab is on, 16px away and clear, in the normal duration.
      expect(seen.count, tab).toBe(1)
      expect(seen.name, tab).toBe(name)
      expect(seen.duration, tab).toBe(180)
      // (Chromium writes translateX(16px) back as translate(16px).)
      expect(
        {
          ...seen.first,
          transform: seen.first.transform.replace('translateX', 'translate'),
        },
        tab
      ).toEqual({ opacity: '0', transform: from })
      // Arrived: fully shown, and no transform left on the page (it would catch a dragged card).
      expect(seen.end, tab).toEqual({ opacity: '1', transform: 'none' })
      expect(seen.left, tab).toBe(0)
    }

    // The marker slides in the normal duration, at every width: there is no two-row layout to special-case.
    const markerDuration = () =>
      page
        .getByTestId('tab-folders')
        .evaluate(
          (node) =>
            getComputedStyle(node.parentElement!, '::before').transitionDuration
        )
    expect(await markerDuration()).toBe('0.18s')
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(420, 700)
    })
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(420)
    // (It is put in place without sliding while the window is being resized, and slides again after.)
    await expect.poll(markerDuration).toBe('0.18s')

    // The day strip keeps its direction but moves 6px and starts at half opacity, in the fast duration.
    const day = await page.evaluate(() => {
      const rules = [...document.styleSheets].flatMap((sheet) => [
        ...sheet.cssRules,
      ])
      const frame = (name: string) => {
        const rule = rules.find(
          (candidate) =>
            candidate instanceof CSSKeyframesRule && candidate.name === name
        ) as CSSKeyframesRule

        return rule.cssRules[0] as CSSKeyframeRule
      }

      return {
        forward: [
          frame('dateSlideForward').style.transform,
          frame('dateSlideForward').style.opacity,
        ],
        backward: [
          frame('dateSlideBackward').style.transform,
          frame('dateSlideBackward').style.opacity,
        ],
      }
    })
    // Newer Chromium writes translateX(6px) of a keyframe as translate(6px): compare either way.
    const plain = (value: unknown) =>
      String(value).replace('translateX(', 'translate(')
    expect(day.forward.map(plain)).toEqual(['translate(6px)', '0.5'])
    expect(day.backward.map(plain)).toEqual(['translate(-6px)', '0.5'])
    await page.getByTestId('tab-tasks').click()
    await expect(page.getByTestId('section-tasks')).toBeVisible()
    await expect(page.locator('.date-display-copy')).toHaveCSS(
      'animation-duration',
      '0.12s'
    )
  } finally {
    await closeApp(context)
  }
})
