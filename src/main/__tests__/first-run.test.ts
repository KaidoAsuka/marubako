import { afterEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../shared/default-data'
import { BACKGROUNDS, THEME_SETTINGS, VIEW_MODES } from '../../shared/types'
import { firstRunExperienceEnabled, starterLookOverride } from '../first-run'

const E2E_LOOK = { theme: 'dark', background: 'aurora', viewMode: 'grid' }

describe('firstRunExperienceEnabled', () => {
  it('is on for a real run', () => {
    expect(firstRunExperienceEnabled({})).toBe(true)
  })

  it('is off in an end-to-end run, unless the spec asks for it', () => {
    expect(firstRunExperienceEnabled({ QUICKLAUNCH_E2E: '1' })).toBe(false)
    expect(
      firstRunExperienceEnabled({
        QUICKLAUNCH_E2E: '1',
        QUICKLAUNCH_FIRST_RUN: '1',
      })
    ).toBe(true)
  })
})

describe('starterLookOverride', () => {
  it('leaves the look of a real new installation alone', () => {
    expect(starterLookOverride({})).toEqual({})
  })

  it('gives the end-to-end runs the look their specs were written against', () => {
    expect(starterLookOverride({ QUICKLAUNCH_E2E: '1' })).toEqual(E2E_LOOK)
  })

  it('gives a spec that asks for the first run the real start', () => {
    expect(
      starterLookOverride({ QUICKLAUNCH_E2E: '1', QUICKLAUNCH_FIRST_RUN: '1' })
    ).toEqual({})
  })

  it('has nothing to replace when only the first-run switch is set', () => {
    expect(starterLookOverride({ QUICKLAUNCH_FIRST_RUN: '1' })).toEqual({})
  })

  it.each(['0', 'true', ''])(
    'only takes "1" for either switch, not %j',
    (value) => {
      expect(starterLookOverride({ QUICKLAUNCH_E2E: value })).toEqual({})
      expect(
        starterLookOverride({
          QUICKLAUNCH_E2E: '1',
          QUICKLAUNCH_FIRST_RUN: value,
        })
      ).toEqual(E2E_LOOK)
    }
  )

  it('replaces exactly the three settings of the look, each with a value the app knows', () => {
    const look = starterLookOverride({ QUICKLAUNCH_E2E: '1' })

    expect(Object.keys(look).sort()).toEqual([
      'background',
      'theme',
      'viewMode',
    ])
    expect(THEME_SETTINGS).toContain(look.theme)
    expect(BACKGROUNDS).toContain(look.background)
    expect(VIEW_MODES).toContain(look.viewMode)
  })

  it('differs from the real start in all three, or it would replace nothing', () => {
    const { prefs } = createDefaultAppData()
    const look = starterLookOverride({ QUICKLAUNCH_E2E: '1' })

    expect(look.theme).not.toBe(prefs.theme)
    expect(look.background).not.toBe(prefs.background)
    expect(look.viewMode).not.toBe(prefs.viewMode)
  })

  describe('read from the environment of the process', () => {
    const saved = {
      e2e: process.env.QUICKLAUNCH_E2E,
      firstRun: process.env.QUICKLAUNCH_FIRST_RUN,
    }

    afterEach(() => {
      if (saved.e2e === undefined) delete process.env.QUICKLAUNCH_E2E
      else process.env.QUICKLAUNCH_E2E = saved.e2e
      if (saved.firstRun === undefined) delete process.env.QUICKLAUNCH_FIRST_RUN
      else process.env.QUICKLAUNCH_FIRST_RUN = saved.firstRun
    })

    it('is what is used when no environment is given', () => {
      delete process.env.QUICKLAUNCH_E2E
      delete process.env.QUICKLAUNCH_FIRST_RUN
      expect(starterLookOverride()).toEqual({})

      process.env.QUICKLAUNCH_E2E = '1'
      expect(starterLookOverride()).toEqual(E2E_LOOK)

      process.env.QUICKLAUNCH_FIRST_RUN = '1'
      expect(starterLookOverride()).toEqual({})
    })
  })
})
