import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PANEL_WIDTH,
  STACKED_MIN_WIDTH,
} from '../../shared/layout-widths'
import { LANGS } from '../../shared/types'
import {
  DEFAULT_WINDOW_HEIGHT,
  MIN_EXPANDED_HEIGHT,
  MIN_EXPANDED_WIDTH,
  WINDOW_MARGIN,
} from '../config'
import { getDefaultWindowSize } from '../default-window-size'

const BIG_SCREEN = { width: 1920, height: 1040 }

describe('the size of a new installation', () => {
  it('is about 400 x 720 in Chinese', () => {
    expect(getDefaultWindowSize('zh', BIG_SCREEN)).toEqual({
      width: 400,
      height: 720,
    })
  })

  it.each(LANGS)(
    'is slender in %s: narrower than it is high, never square',
    (lang) => {
      const { width, height } = getDefaultWindowSize(lang, BIG_SCREEN)

      expect(width).toBeLessThan(height)
      expect(height - width).toBeGreaterThan(200)
    }
  )

  it.each(LANGS)(
    'is wide enough for every category name to stand whole under its icon in %s',
    (lang) => {
      const { width } = getDefaultWindowSize(lang, BIG_SCREEN)

      expect(width).toBe(DEFAULT_PANEL_WIDTH[lang])
      expect(width).toBeGreaterThan(STACKED_MIN_WIDTH[lang])
    }
  )

  it('takes the width of the language, so English gets more than Chinese', () => {
    expect(getDefaultWindowSize('en', BIG_SCREEN).width).toBeGreaterThan(
      getDefaultWindowSize('zh', BIG_SCREEN).width
    )
  })

  it('is never narrower than the smallest window the app allows', () => {
    for (const lang of LANGS)
      expect(
        getDefaultWindowSize(lang, BIG_SCREEN).width
      ).toBeGreaterThanOrEqual(MIN_EXPANDED_WIDTH)
  })

  it('is capped to the height the screen leaves after the margins', () => {
    const screen = { width: 1366, height: 728 }

    expect(getDefaultWindowSize('zh', screen).height).toBe(
      screen.height - WINDOW_MARGIN * 2
    )
  })

  it('keeps 720 where the screen has room for it', () => {
    expect(
      getDefaultWindowSize('zh', {
        width: 1920,
        height: 720 + WINDOW_MARGIN * 2,
      }).height
    ).toBe(DEFAULT_WINDOW_HEIGHT)
  })

  it('never goes below the smallest height, whatever the screen', () => {
    expect(
      getDefaultWindowSize('zh', { width: 1280, height: 400 }).height
    ).toBe(MIN_EXPANDED_HEIGHT)
  })

  it('shrinks to a screen that is narrower than the language asks for', () => {
    const { width } = getDefaultWindowSize('en', { width: 450, height: 800 })

    expect(width).toBe(450 - WINDOW_MARGIN * 2)
  })

  it('never goes below the smallest width, whatever the screen', () => {
    expect(getDefaultWindowSize('en', { width: 300, height: 800 }).width).toBe(
      MIN_EXPANDED_WIDTH
    )
  })
})
