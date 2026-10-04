import { describe, expect, it } from 'vitest'

import { getLaunchWindowState, normalizeWindowState } from '../window-state'

describe('getLaunchWindowState', () => {
  it('keeps a collapsed persisted state so the ball can come back after a restart', () => {
    const persistedState = {
      bounds: {
        x: 10,
        y: 20,
        w: 420,
        h: 700,
      },
      opacity: 0.9,
      alwaysOnTop: true,
      collapsed: true,
      preCollapseHeight: 680,
    }
    const launchState = getLaunchWindowState(persistedState)

    expect(launchState).toEqual(persistedState)
    expect(launchState.collapsed).toBe(true)
  })

  it('preserves the same object when nothing needs repairing', () => {
    const persistedState = {
      bounds: undefined,
      opacity: 1,
      alwaysOnTop: false,
      collapsed: false,
      preCollapseHeight: 700,
    }

    expect(getLaunchWindowState(persistedState)).toBe(persistedState)
  })

  it('restores the expanded height saved by older collapsed windows and stays collapsed', () => {
    const launchState = getLaunchWindowState({
      bounds: { x: 30, y: 40, w: 760, h: 54 },
      opacity: 1,
      alwaysOnTop: true,
      collapsed: true,
      preCollapseHeight: 680,
    })

    expect(launchState.collapsed).toBe(true)
    expect(launchState.bounds).toEqual({ x: 30, y: 40, w: 760, h: 680 })
  })
})

describe('normalizeWindowState: trayHintShown', () => {
  it('keeps a true flag so the tray hint is shown only once', () => {
    expect(normalizeWindowState({ trayHintShown: true }).trayHintShown).toBe(
      true
    )
  })

  it('leaves the flag out until it has been set', () => {
    expect(normalizeWindowState({})).not.toHaveProperty('trayHintShown')
  })

  it.each([
    ['a string', 'yes'],
    ['the number 1', 1],
    ['false', false],
    ['null', null],
  ])('drops a flag that is %s', (_label, value) => {
    expect(
      normalizeWindowState({ trayHintShown: value as unknown as boolean })
    ).not.toHaveProperty('trayHintShown')
  })
})
