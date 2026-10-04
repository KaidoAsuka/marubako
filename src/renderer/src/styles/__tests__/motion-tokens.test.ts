// motion-1: four durations, three curves, one place. These read the real stylesheets in cascade
// order, so a literal that creeps back in (or a duplicate that shadows a token) fails here.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { springProgress } from '../../utils/spring'
import { BALL_SPRING } from '../../utils/window-motion'
import {
  CASCADE_ORDER,
  declarations,
  lastValue,
  loadRules,
  readStyle,
} from './css-utils'

const themes = loadRules('themes.css')
const token = (name: string) => lastValue(themes, ':root', name)

// Files that may keep their own curves and timings: the tokens themselves, the loading screen's
// endless idle loops, and the ball, whose spring and 90ms press are specified in motion-spec.md.
const OWN_TIMINGS = new Set(['themes.css', 'startup.css', 'dock.css'])
// The one duration that is not a token: the launch confirmation ring lasts exactly as long as
// further clicks are swallowed (LAUNCH_WINDOW_MS), which does not follow the motion setting.
// launch-feedback.test.ts pins the two to each other.
const DOCUMENTED_LITERALS = new Set([
  "motion.css [data-launch='launching'] animation: launchRing 600ms var(--ease-out)",
])
const TIMING_PROPERTIES =
  /^(transition|transition-duration|transition-delay|transition-timing-function|animation|animation-duration|animation-delay|animation-timing-function)$/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__') return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('the motion tokens', () => {
  it('are four durations and three curves', () => {
    expect(token('--motion-instant')).toBe('90ms')
    expect(token('--motion-fast')).toBe('120ms')
    expect(token('--motion-normal')).toBe('180ms')
    expect(token('--motion-spring')).toBe('600ms')
    expect(token('--ease-out')).toBe('cubic-bezier(0.2, 0, 0, 1)')
    expect(token('--ease-in')).toBe('cubic-bezier(0.4, 0, 1, 1)')
    expect(token('--ease-spring')).toMatch(/^linear\(/)
  })

  it('have no fifth duration left behind', () => {
    const names = themes
      .flatMap((rule) => declarations(rule.body))
      .map(([name]) => name)
      .filter((name) => name.startsWith('--motion-'))

    expect(names.sort()).toEqual([
      '--motion-fast',
      '--motion-instant',
      '--motion-normal',
      '--motion-spring',
    ])
    for (const file of walk(resolve(process.cwd(), 'src/renderer/src'))) {
      if (!/\.(css|ts|tsx)$/.test(file)) continue
      expect(
        readFileSync(file, 'utf8'),
        relative(process.cwd(), file)
      ).not.toContain('--motion-slow')
    }
  })

  it('make the spring token the ball spring, sampled over 600ms', () => {
    const body = /linear\(([\s\S]*)\)/.exec(token('--ease-spring')!)![1]!
    const stops = body.split(',').map((part) => part.trim().split(/\s+/))

    expect(stops[0]).toEqual(['0'])
    expect(stops[stops.length - 1]).toEqual(['1'])
    let peak = { at: 0, value: 0 }
    for (const [value, position] of stops.slice(1, -1)) {
      const percent = Number.parseFloat(position!)
      const expected = springProgress((percent / 100) * 600, BALL_SPRING)

      expect(Number.parseFloat(value!), `${percent}%`).toBeCloseTo(expected, 2)
      if (Number.parseFloat(value!) > peak.value) {
        peak = { at: percent, value: Number.parseFloat(value!) }
      }
    }
    // 12.6% over the target at 180ms, as the ball.
    expect(peak.value).toBeCloseTo(1.126, 3)
    expect((peak.at / 100) * 600).toBe(180)
  })
})

describe('the stylesheets use the tokens', () => {
  const owners = CASCADE_ORDER.filter((file) => !OWN_TIMINGS.has(file))

  it('have no curve literal outside themes, startup and dock', () => {
    const offenders: string[] = []

    for (const file of owners) {
      for (const rule of loadRules(file)) {
        for (const [property, value] of declarations(rule.body)) {
          if (!TIMING_PROPERTIES.test(property)) continue
          const bare = value.replace(/var\(--ease-(out|in|spring)\)/g, '')
          if (
            /cubic-bezier\(|\blinear\(|\bsteps\(/.test(bare) ||
            /\b(ease|ease-in|ease-out|ease-in-out)\b/.test(bare)
          ) {
            offenders.push(`${file} ${rule.selector} ${property}: ${value}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('have no millisecond literal outside themes, startup and dock', () => {
    const offenders: string[] = []

    for (const file of owners) {
      for (const rule of loadRules(file)) {
        for (const [property, value] of declarations(rule.body)) {
          if (!TIMING_PROPERTIES.test(property)) continue
          const line = `${file} ${rule.selector} ${property}: ${value}`
          if (
            /(^|[\s,])(?!0m?s\b)[\d.]+m?s\b/.test(value) &&
            !DOCUMENTED_LITERALS.has(line)
          ) {
            offenders.push(line)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('keep the ball and the loading screen on their own, documented timings', () => {
    expect(readStyle('dock.css')).toContain('90ms')
    expect(readStyle('startup.css')).toContain('infinite')
  })

  it('declare each animation once, in motion.css', () => {
    for (const selector of [
      '.section-content',
      '.group-card-body',
      '.task-card-body',
      '.widget-popup',
      '.widget-popup-card',
      '.command-dialog',
    ]) {
      const holders = CASCADE_ORDER.filter((file) =>
        loadRules(file).some(
          (rule) =>
            rule.at.length === 0 &&
            rule.selector
              .split(',')
              .map((s) => s.trim())
              .includes(selector) &&
            declarations(rule.body).some(([name]) => /^animation/.test(name))
        )
      )

      expect(holders, selector).toEqual(['motion.css'])
    }
  })

  it('has no dead keyframes or dead loading styles left', () => {
    const everything = CASCADE_ORDER.map((file) => readStyle(file)).join('\n')

    expect(everything).not.toContain('@keyframes commandIn')
    expect(everything).not.toMatch(
      /\.loading-(screen|stack|mark|ring|core|line|dots)\b/
    )
    expect(everything).not.toMatch(/@keyframes loading(Spin|Dots|Sweep|Pulse)/)
  })

  it('handle prefers-reduced-motion once', () => {
    const holders = CASCADE_ORDER.filter((file) =>
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(readStyle(file))
    )

    // The ball keeps its own, because its press is a scale, not a transition on the shared list.
    expect(holders).toEqual(['motion.css', 'dock.css'])
  })

  it('press in --motion-instant and fade in --motion-fast', () => {
    const motion = loadRules('motion.css')
    const press = motion.find((rule) =>
      rule.selector.includes(':active:not(:disabled)')
    )!
    const shared = motion.find(
      (rule) =>
        rule.selector.includes('.icon-button') &&
        !rule.selector.includes(':active') &&
        declarations(rule.body).some(([name]) => name === 'transition')
    )!

    expect(
      declarations(press.body).find(
        ([name]) => name === 'transition-duration'
      )?.[1]
    ).toBe('var(--motion-instant)')
    expect(
      declarations(shared.body).find(([name]) => name === 'transition')?.[1]
    ).toContain('var(--motion-fast) var(--ease-out)')
  })
})
