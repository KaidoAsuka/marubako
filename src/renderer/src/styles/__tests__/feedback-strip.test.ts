// layout-7: one strip at the bottom of the shell replaces the status bar and the floating toast.
// Vitest does not load .css files, so these read the real stylesheets.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BACKGROUNDS } from '../../../../shared/types'
import { getBackgroundUiVariables } from '../background-theme'
import {
  contrast,
  loadCascade,
  loadRules,
  lastValue,
  over,
  parseColor,
  type Rgba,
} from './css-utils'

const cascade = loadCascade()
const strip = loadRules('feedback.css')
const own = (selector: string, property: string) =>
  lastValue(strip, selector, property)
const themes = loadRules('themes.css')
const token = (theme: 'dark' | 'light', name: string): string =>
  lastValue(themes, theme === 'dark' ? ':root' : '.theme-light', name) ??
  lastValue(themes, ':root', name)!

/** `color-mix(in srgb, top share%, bottom)` of two opaque colours. */
function mix(top: Rgba, share: number, bottom: Rgba): Rgba {
  return {
    r: top.r * share + bottom.r * (1 - share),
    g: top.g * share + bottom.g * (1 - share),
    b: top.b * share + bottom.b * (1 - share),
    a: 1,
  }
}

describe('what the strip replaces', () => {
  it('leaves no status bar or toast rule in any stylesheet', () => {
    const stylesDir = resolve(process.cwd(), 'src/renderer/src/styles')
    const leftovers: string[] = []

    for (const file of readdirSync(stylesDir).filter((name) =>
      name.endsWith('.css')
    )) {
      const css = readFileSync(resolve(stylesDir, file), 'utf8')
      for (const dead of [
        '.statusbar',
        '.save-status',
        '.toast',
        '.toast-action',
      ]) {
        if (css.includes(dead)) leftovers.push(`${file} ${dead}`)
      }
    }

    expect(leftovers).toEqual([])
  })

  it('is imported by the renderer entry, after the styles it overrides', () => {
    const main = readFileSync(
      resolve(process.cwd(), 'src/renderer/src/main.tsx'),
      'utf8'
    )

    expect(main).toContain("import './styles/feedback.css'")
    expect(main.indexOf('feedback.css')).toBeGreaterThan(
      main.indexOf('motion.css')
    )
  })
})

describe('the strip takes room, and none when it is empty', () => {
  it('sits in the flow of the shell instead of floating over it', () => {
    expect(own('.feedback-strip', 'flex-shrink')).toBe('0')
    expect(own('.feedback-strip', 'position')).toBe('relative')
    // Nothing is taken out of the flow: no absolute or fixed strip.
    expect(own('.feedback-strip', 'display')).toBe('grid')
  })

  it('is 0px high when closed and its own height when open', () => {
    expect(own('.feedback-strip', 'grid-template-rows')).toBe('0fr')
    expect(own('.feedback-strip[data-open]', 'grid-template-rows')).toBe('1fr')
    // The clip hides the content while the row is on its way to 0.
    expect(own('.feedback-clip', 'min-height')).toBe('0')
    expect(own('.feedback-clip', 'overflow')).toBe('hidden')
    // The line above it lives inside the clip, so a closed strip leaves no hairline behind.
    expect(own('.feedback-body', 'border-top')).toBe('1px solid var(--line)')
    expect(own('.feedback-strip', 'border')).toBeUndefined()
    expect(own('.feedback-strip', 'padding')).toBeUndefined()
  })

  it('is at least 28px and at most two lines', () => {
    expect(own('.feedback-body', 'min-height')).toBe('28px')
    expect(own('.feedback-text', '-webkit-line-clamp')).toBe('2')
    expect(own('.feedback-text', 'overflow-wrap')).toBe('anywhere')
    expect(own('.feedback-body', 'font')).toContain('12px/1.4')
  })

  it('animates with the motion tokens only: out and in', () => {
    expect(own('.feedback-strip', 'transition')).toBe(
      'grid-template-rows var(--motion-fast) var(--ease-in)'
    )
    expect(own('.feedback-strip[data-open]', 'transition')).toBe(
      'grid-template-rows var(--motion-normal) var(--ease-out)'
    )
  })
})

describe('above the dialogs', () => {
  // The strip lives in the app shell, which is a stacking context (clip-path) below the dialogs'
  // overlays on the body, so it cannot be raised above their scrim. The overlays end where it
  // begins instead; this is how a message raised while a dialog is open stays readable.
  it.each(['.modal-overlay', '.widget-popup-overlay'])(
    '%s stops at the top edge of the strip',
    (selector) => {
      expect(own(selector, 'bottom')).toBe(
        'max(4px, anchor(--feedback-strip top, 4px))'
      )
    }
  )

  it('does the same for the search palette', () => {
    expect(own('.command-overlay', 'bottom')).toBe(
      'max(0px, anchor(--feedback-strip top, 0px))'
    )
  })

  it('is the anchor those overlays measure from', () => {
    expect(own('.feedback-strip', 'anchor-name')).toBe('--feedback-strip')
  })

  it('has the overlays keep their old inset when there is no strip', () => {
    // The fallback of anchor() is the inset they had before.
    expect(lastValue(cascade, '.modal-overlay', 'inset')).toBe('4px')
    expect(lastValue(cascade, '.command-overlay', 'inset')).toBe('0')
  })

  it('squares the popup overlay corners while the strip is open', () => {
    expect(
      lastValue(
        strip,
        'body:has(.feedback-strip[data-open]) .widget-popup-overlay',
        'border-bottom-left-radius'
      )
    ).toBe('0')
  })
})

describe('readable in both themes', () => {
  const tones = [
    ['neutral (info, undo)', '--text-dim'],
    ['success', '--success'],
    ['danger and error', '--danger'],
  ] as const

  it('writes the words in --text and lets the tone colour only the icon and the line', () => {
    expect(own('.feedback-body', 'color')).toBe('var(--text)')
    expect(own('.feedback-icon', 'color')).toBe('var(--tone)')
    expect(own('.feedback-body', 'box-shadow')).toBe(
      'inset 3px 0 0 var(--tone)'
    )
    // Nothing that holds words takes the tone.
    for (const selector of ['.feedback-text', '.feedback-body']) {
      expect(own(selector, 'color')).not.toBe('var(--tone)')
      expect(own(selector, 'color')).not.toBe('var(--danger)')
    }
    expect(
      own(".feedback-strip[data-kind='error'] .feedback-body", '--tone')
    ).toBe('var(--danger)')
  })

  it('leans the light button words toward the text colour, where the accent alone is too light', () => {
    expect(own('.theme-light .feedback-action', 'color')).toBe(
      'color-mix(in srgb, var(--accent) 60%, var(--text))'
    )
  })

  it('tints the strip a little with its tone over the bar colour', () => {
    expect(own('.feedback-body', 'background')).toBe(
      'color-mix(in srgb, var(--tone) 12%, var(--sidebar-bg))'
    )
  })

  for (const theme of ['dark', 'light'] as const) {
    for (const [name, toneToken] of tones) {
      const fill = () =>
        mix(
          parseColor(token(theme, toneToken)),
          0.12,
          parseColor(token(theme, '--sidebar-bg'))
        )

      it(`keeps the words at 4.5:1 or better on the ${name} strip (${theme})`, () => {
        expect(
          contrast(token(theme, '--text'), fill()),
          `${token(theme, '--text')} on ${JSON.stringify(fill())}`
        ).toBeGreaterThanOrEqual(4.5)
      })

      // The button is the accent, whichever of the five the user chose, at rest and with its hover
      // tint (--accent-soft) on; in the light theme the accent leans toward the text colour.
      for (const key of BACKGROUNDS) {
        it(`keeps the button words at 4.5:1 or better on the ${name} strip, ${key} (${theme})`, () => {
          const accent = parseColor(
            getBackgroundUiVariables(theme, key)['--accent']!
          )
          const words =
            theme === 'light'
              ? mix(accent, 0.6, parseColor(token(theme, '--text')))
              : accent
          const share =
            Number.parseFloat(
              /(\d+(?:\.\d+)?)%/.exec(token(theme, '--accent-soft'))?.[1] ?? '0'
            ) / 100
          const hover = over({ ...accent, a: share }, fill())

          expect(contrast(words, fill()), 'at rest').toBeGreaterThanOrEqual(4.5)
          expect(contrast(words, hover), 'hovered').toBeGreaterThanOrEqual(4.5)
        })
      }

      it(`keeps the icon and the line at 3:1 or better on the ${name} strip (${theme})`, () => {
        expect(
          contrast(token(theme, toneToken), fill())
        ).toBeGreaterThanOrEqual(3)
      })
    }
  }
})
