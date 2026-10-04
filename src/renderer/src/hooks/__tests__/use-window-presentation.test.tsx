import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WindowPresentation } from '../../../../shared/types'
import { useWindowPresentation } from '../use-window-presentation'

type Handler = (presentation: WindowPresentation) => Promise<void>

interface FakeAnimation {
  target: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  canceled: boolean
  /** True once the animation has run to its end (and was not cancelled before that). */
  completed: boolean
  finished: Promise<void>
  finish: () => void
  cancel: () => void
}

/** A Web Animations stand-in: jsdom has none. Animations end by themselves after delay + duration. */
let animations: FakeAnimation[] = []
let handler: Handler
let reduced = false

function installFakeAnimate(): void {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function (
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ) {
      let resolve!: () => void
      let reject!: (reason: unknown) => void
      const finished = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      // The page code owns the rejection handling; keep the test runner quiet.
      finished.catch(() => {})
      let ended = false
      const fake: FakeAnimation = {
        target: this,
        keyframes,
        options,
        canceled: false,
        completed: false,
        finished,
        finish: () => {
          if (ended) return
          ended = true
          fake.completed = true
          resolve()
        },
        cancel: () => {
          fake.canceled = true
          if (ended) return
          ended = true
          reject(new DOMException('The animation was canceled', 'AbortError'))
        },
      }
      setTimeout(fake.finish, (options.delay ?? 0) + Number(options.duration))
      animations.push(fake)
      return fake as unknown as Animation
    },
  })
}

function mountDocument(): { surface: HTMLElement; dot: HTMLElement } {
  document.body.removeAttribute('style')
  document.body.innerHTML = `
    <div id="root">
      <button class="dock-bubble" data-pressed="1">
        <span class="dock-bubble-surface"><span class="dock-bubble-dot"></span></span>
      </button>
    </div>`
  return {
    surface: document.querySelector<HTMLElement>('.dock-bubble-surface')!,
    dot: document.querySelector<HTMLElement>('.dock-bubble-dot')!,
  }
}

function presentation(
  overrides: Partial<WindowPresentation> = {}
): WindowPresentation {
  return {
    stage: 'prepare',
    direction: 'expand',
    surface: 'panel',
    origin: { x: -64, y: 0 },
    timeScale: 1,
    ...overrides,
  }
}

/** Runs one stage and reports whether its acknowledgement has been sent. */
function send(next: WindowPresentation): { done: () => boolean } {
  let finished = false
  void handler(next).then(() => {
    finished = true
  })
  return { done: () => finished }
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

function windowState(collapsed: boolean) {
  return {
    ok: true as const,
    data: { alwaysOnTop: false, collapsed, opacity: 1 },
  }
}

function animationsOn(target: Element): FakeAnimation[] {
  return animations.filter((animation) => animation.target === target)
}

function transforms(animation: FakeAnimation): string[] {
  return animation.keyframes.map((frame) => String(frame.transform))
}

beforeEach(() => {
  vi.useFakeTimers()
  animations = []
  reduced = false
  installFakeAnimate()
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  vi.mocked(window.quickLaunch.onPrepareShow).mockImplementation((callback) => {
    handler = callback
    return () => {}
  })
  // The ball normally starts out collapsed, so the panel is not open behind it.
  vi.mocked(window.quickLaunch.window.getState).mockResolvedValue(
    windowState(true)
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
})

describe('panel expansion', () => {
  beforeEach(() => {
    mountDocument()
    renderHook(() => useWindowPresentation())
  })

  it('prepares a scaled, transparent body that stays clickable, without clip-path', async () => {
    send(presentation())
    await advance(0)
    const style = document.body.style
    // The ball's centre is 36px outside the panel's left edge, so the far edge is
    // at the right: 48px of travel over innerWidth + 36px of reach.
    expect(Number(style.transform.match(/scale\(([\d.]+)\)/)?.[1])).toBeCloseTo(
      1 - 48 / (window.innerWidth + 36),
      5
    )
    expect(style.opacity).toBe('0')
    expect(style.transformOrigin).toBe('-36px 28px')
    expect(style.clipPath).toBe('')
    expect(style.pointerEvents).toBe('')
    expect(document.getElementById('root')!.dataset.presentation).toBe(
      'expand-prepared'
    )
  })

  it.each([0.6, 1, 1.6])(
    'springs the scale, fades in, and acknowledges after 270 ms x %d without waiting for the tail',
    async (timeScale) => {
      send(presentation({ timeScale }))
      await advance(0)
      const stage = send(presentation({ stage: 'animate', timeScale }))
      await advance(0)

      const [scale, fade] = animationsOn(document.body)
      expect(scale).toBeDefined()
      expect(scale!.options.fill).toBe('forwards')
      expect(scale!.options.easing).toBe('linear')
      expect(scale!.keyframes.length).toBeGreaterThanOrEqual(24)
      expect(transforms(scale!).at(-1)).toBe('scale(1)')
      // The spring dips past 1 once, so the panel really bounces.
      const peak = Math.max(
        ...transforms(scale!).map((value) => Number(value.slice(6, -1)))
      )
      expect(peak).toBeGreaterThan(1)
      expect(peak).toBeLessThan(1.005)
      expect(Number(scale!.options.duration)).toBeGreaterThan(460 * timeScale)
      expect(fade!.keyframes.map((frame) => frame.opacity)).toEqual([0, 1])
      expect(fade!.options.duration).toBeCloseTo(90 * timeScale, 5)
      expect(document.body.style.pointerEvents).not.toBe('none')

      const receipt = Math.round(270 * timeScale)
      await advance(receipt - 1)
      expect(stage.done()).toBe(false)
      await advance(1)
      expect(stage.done()).toBe(true)
      // The spring itself is far from over at that moment.
      expect(scale!.canceled).toBe(false)
    }
  )

  it('lets the tail finish by itself: reset leaves it running, and its end clears the body', async () => {
    send(presentation())
    await advance(0)
    send(presentation({ stage: 'animate' }))
    await advance(300)
    const [scale] = animationsOn(document.body)

    send(presentation({ stage: 'reset' }))
    await advance(50)
    expect(scale!.canceled).toBe(false)
    expect(document.body.style.transform).not.toBe('')
    expect(document.body.style.pointerEvents).toBe('')
    expect(document.getElementById('root')!.dataset.presentation).toBe(
      undefined
    )

    await advance(400)
    expect(document.body.getAttribute('style') ?? '').toBe('')
    expect(animationsOn(document.body).every((a) => a.canceled)).toBe(true)
  })

  it('cancels an unfinished tail when the next presentation starts, without letting it wipe the new styles', async () => {
    send(presentation())
    await advance(0)
    send(presentation({ stage: 'animate' }))
    await advance(300)
    send(presentation({ stage: 'reset' }))
    await advance(0)
    const tail = animationsOn(document.body)

    send(presentation({ direction: 'collapse' }))
    await advance(0)
    expect(tail.every((animation) => animation.canceled)).toBe(true)
    expect(document.body.style.pointerEvents).toBe('none')
    expect(document.body.style.transformOrigin).toBe('-36px 28px')
    // The cancelled tail's own completion must not reach into the new styles.
    await advance(1000)
    expect(document.body.style.transformOrigin).toBe('-36px 28px')
    expect(document.body.style.pointerEvents).toBe('none')
  })
})

describe('panel collapse', () => {
  beforeEach(() => {
    mountDocument()
    renderHook(() => useWindowPresentation())
  })

  it('blocks input while it shrinks and fades in one 160 ms animation', async () => {
    send(presentation({ direction: 'collapse', timeScale: 1.5 }))
    await advance(0)
    expect(document.body.style.pointerEvents).toBe('none')
    expect(document.body.style.clipPath).toBe('')
    expect(document.body.style.transformOrigin).toBe('-36px 28px')

    const stage = send(
      presentation({ stage: 'animate', direction: 'collapse', timeScale: 1.5 })
    )
    await advance(0)
    const [only, ...rest] = animationsOn(document.body)
    expect(rest).toEqual([])
    expect(only!.options.duration).toBeCloseTo(240, 5)
    expect(only!.options.easing).toBe('cubic-bezier(0.4, 0, 1, 1)')
    expect(only!.keyframes[0]).toMatchObject({
      transform: 'scale(1)',
      opacity: 1,
    })
    const last = only!.keyframes.at(-1)!
    expect(last.opacity).toBe(0)
    expect(Number(String(last.transform).slice(6, -1))).toBeLessThan(1)

    await advance(239)
    expect(stage.done()).toBe(false)
    // Two animation frames after the end, so the last frame is on screen before the hide.
    await advance(40)
    expect(stage.done()).toBe(true)

    send(presentation({ stage: 'reset', direction: 'collapse' }))
    await advance(0)
    expect(document.body.getAttribute('style') ?? '').toBe('')
    expect(only!.canceled).toBe(true)
  })
})

describe('ball', () => {
  let surface: HTMLElement
  let dot: HTMLElement

  beforeEach(() => {
    ;({ surface, dot } = mountDocument())
    renderHook(() => useWindowPresentation())
  })

  const ball = (overrides: Partial<WindowPresentation> = {}) =>
    presentation({
      surface: 'bubble',
      origin: { x: 0, y: 0 },
      stationary: true,
      ...overrides,
    })

  it('starts its spring from the scale it has right now, so a pressed ball does not jump', async () => {
    surface.style.transform = 'scale(0.92)'
    send(ball())
    await advance(0)
    send(ball({ stage: 'animate' }))
    await advance(0)

    const spring = animationsOn(surface).find((animation) =>
      animation.keyframes.some((frame) => frame.transform)
    )!
    expect(spring.keyframes[0]!.transform).toBe('scale(0.92)')
    expect(spring.keyframes.at(-1)!.transform).toBe('scale(0.52)')
    expect(spring.options.easing).toBe('linear')
    expect(spring.options.delay ?? 0).toBe(0)
    // The release of the button is the animation's business, not a leftover.
    expect(
      document.querySelector('.dock-bubble')!.hasAttribute('data-pressed')
    ).toBe(false)
  })

  it('acknowledges right after painting instead of waiting for the spring', async () => {
    send(ball())
    await advance(0)
    const stage = send(ball({ stage: 'animate' }))
    await advance(40)
    expect(stage.done()).toBe(true)
    // ... while the spring keeps playing and the ball keeps its old look.
    expect(animationsOn(surface).length).toBeGreaterThanOrEqual(2)
    expect(
      animationsOn(surface).every((animation) => !animation.canceled)
    ).toBe(true)
    expect(surface.dataset.morph).toBeUndefined()
  })

  it.each([true, false])(
    'delays the collapse spring and the shape change by 100 ms x time scale when stationary is %s',
    async (stationary) => {
      surface.dataset.morph = 'dot'
      send(ball({ direction: 'collapse', stationary, timeScale: 1.5 }))
      await advance(0)
      send(
        ball({
          stage: 'animate',
          direction: 'collapse',
          stationary,
          timeScale: 1.5,
        })
      )
      await advance(0)

      const [spring, shape] = animationsOn(surface)
      expect(spring!.options.delay).toBeCloseTo(150, 5)
      expect(shape!.options.delay).toBeCloseTo(150, 5)
      expect(shape!.keyframes.at(-1)!.borderRadius).toBe('28% 28% 28% 50%')
      const spark = animationsOn(dot)[0]!
      expect(spark.options.delay).toBeCloseTo(210, 5)
      expect(spark.keyframes.at(-1)!.opacity).toBe(1)
    }
  )

  it('brings a ball that is not on screen yet in as the plain dot, fading in, and then lets it bloom', async () => {
    send(ball({ direction: 'collapse', stationary: false }))
    await advance(0)
    expect(surface.style.transform).toBe('scale(0.52)')
    expect(surface.style.borderRadius).toBe('50%')
    expect(dot.style.opacity).toBe('0')
    expect(document.body.style.opacity).toBe('0')
    expect(document.body.style.pointerEvents).toBe('none')

    send(ball({ stage: 'animate', direction: 'collapse', stationary: false }))
    await advance(0)
    const [fade] = animationsOn(document.body)
    expect(fade!.keyframes.map((frame) => frame.opacity)).toEqual([0, 1])
    expect(fade!.options.duration).toBe(100)
    const [spring, shape] = animationsOn(surface)
    expect(spring!.keyframes[0]!.transform).toBe('scale(0.52)')
    expect(spring!.keyframes.at(-1)!.transform).toBe('scale(1)')
    expect(shape!.keyframes[0]!.borderRadius).toBe('50%')
    await advance(100)

    send(ball({ stage: 'reset', direction: 'collapse', stationary: false }))
    await advance(0)
    expect(document.body.style.opacity).toBe('')
    expect(document.body.style.pointerEvents).toBe('')
  })

  it('holds the handshake until the fade-in of a ball that is not on screen yet has run out', async () => {
    send(ball({ direction: 'collapse', stationary: false }))
    await advance(0)
    const stage = send(
      ball({ stage: 'animate', direction: 'collapse', stationary: false })
    )
    await advance(0)
    const [fade] = animationsOn(document.body)

    // The main process answers the acknowledgement with `reset` at once (settleBubble waits for
    // nothing else), and reset cancels the fade: the ball would pop from half to full opacity.
    await advance(99)
    expect(stage.done()).toBe(false)
    expect(fade!.completed).toBe(false)
    await advance(40)
    expect(stage.done()).toBe(true)
    expect(fade!.completed).toBe(true)

    send(ball({ stage: 'reset', direction: 'collapse', stationary: false }))
    await advance(0)
    expect(document.body.style.opacity).toBe('')
    expect(document.body.style.pointerEvents).toBe('')
    expect(
      document.getElementById('root')!.dataset.presentation
    ).toBeUndefined()
  })

  it('does not report a fade-in as complete after a newer presentation cancelled it', async () => {
    send(ball({ direction: 'collapse', stationary: false }))
    await advance(0)
    const stage = send(
      ball({ stage: 'animate', direction: 'collapse', stationary: false })
    )
    await advance(40)
    const [fade] = animationsOn(document.body)
    expect(stage.done()).toBe(false)

    send(ball({ direction: 'expand' }))
    await advance(0)
    expect(fade!.canceled).toBe(true)
    await advance(100)
    expect(stage.done()).toBe(true)
    expect(document.getElementById('root')!.dataset.presentation).toBe(
      'expand-prepared'
    )
  })

  it('draws the ball as a dot by changing its shape and dimming the white mark', async () => {
    send(ball())
    await advance(0)
    send(ball({ stage: 'animate' }))
    await advance(0)

    const shape = animationsOn(surface).find((animation) =>
      animation.keyframes.some((frame) => frame.borderRadius)
    )!
    expect(shape.keyframes.at(-1)!.borderRadius).toBe('50%')
    expect(shape.options.duration).toBeCloseTo(140, 5)
    const mark = animationsOn(dot)[0]!
    expect(mark.keyframes.at(-1)!.opacity).toBe(0)
    expect(mark.options.duration).toBeCloseTo(90, 5)
  })

  it('switches to the dot only when every animation has ended, and keeps them across reset', async () => {
    send(ball())
    await advance(0)
    send(ball({ stage: 'animate' }))
    await advance(100)
    send(ball({ stage: 'reset' }))
    await advance(100)
    expect(animationsOn(surface).some((animation) => animation.canceled)).toBe(
      false
    )
    expect(surface.dataset.morph).toBeUndefined()
    expect(document.getElementById('root')!.dataset.presentation).toBe(
      undefined
    )

    await advance(600)
    expect(surface.dataset.morph).toBe('dot')
    // Nothing animated is left behind: the stylesheet takes over the same values.
    expect(surface.getAttribute('style') ?? '').not.toContain('transform')
    expect(dot.style.opacity).toBe('')
  })

  it('does not let an interrupted animation switch the shape after a newer one began', async () => {
    send(ball())
    await advance(0)
    send(ball({ stage: 'animate' }))
    await advance(100)
    send(ball({ stage: 'reset' }))
    await advance(0)
    const interrupted = animationsOn(surface)
    expect(interrupted.length).toBeGreaterThanOrEqual(2)

    send(ball({ direction: 'collapse' }))
    await advance(0)
    expect(interrupted.every((animation) => animation.canceled)).toBe(true)
    await advance(1000)
    expect(surface.dataset.morph).not.toBe('dot')
  })
})

describe('a ball that loads while the panel is open', () => {
  it('stands for the panel as the plain dot, without animating', async () => {
    const { surface } = mountDocument()
    vi.mocked(window.quickLaunch.window.getState).mockResolvedValue(
      windowState(false)
    )
    renderHook(() => useWindowPresentation())
    await advance(0)
    expect(surface.dataset.morph).toBe('dot')
    expect(animations).toEqual([])
  })

  it('stays a ball when the panel is collapsed into it', async () => {
    const { surface } = mountDocument()
    renderHook(() => useWindowPresentation())
    await advance(0)
    expect(surface.dataset.morph).toBeUndefined()
  })

  it('leaves the look to a presentation that has already begun', async () => {
    const { surface } = mountDocument()
    let answer!: (state: ReturnType<typeof windowState>) => void
    vi.mocked(window.quickLaunch.window.getState).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      })
    )
    renderHook(() => useWindowPresentation())
    send({
      stage: 'prepare',
      direction: 'collapse',
      surface: 'bubble',
      origin: { x: 0, y: 0 },
      timeScale: 1,
      stationary: true,
    })
    await advance(0)
    answer(windowState(false))
    await advance(0)
    expect(surface.dataset.morph).toBeUndefined()
  })
})

describe('reduced motion', () => {
  beforeEach(() => {
    reduced = true
    mountDocument()
    renderHook(() => useWindowPresentation())
  })

  it('fades the panel in and out without any scaling', async () => {
    send(presentation())
    await advance(0)
    expect(document.body.style.transform).toBe('')
    send(presentation({ stage: 'animate' }))
    await advance(0)
    const [fadeIn] = animationsOn(document.body)
    expect(fadeIn!.options.duration).toBe(100)
    expect(fadeIn!.keyframes.every((frame) => !('transform' in frame))).toBe(
      true
    )
    await advance(200)
    send(presentation({ stage: 'reset' }))
    await advance(0)

    send(presentation({ direction: 'collapse' }))
    await advance(0)
    send(presentation({ stage: 'animate', direction: 'collapse' }))
    await advance(0)
    const fadeOut = animationsOn(document.body).at(-1)!
    expect(fadeOut.options.duration).toBe(60)
    expect(fadeOut.keyframes.every((frame) => !('transform' in frame))).toBe(
      true
    )
  })

  it('switches the ball instantly, with nothing animated', async () => {
    const surface = document.querySelector<HTMLElement>('.dock-bubble-surface')!
    const request = (stage: WindowPresentation['stage']) =>
      presentation({
        stage,
        surface: 'bubble',
        origin: { x: 0, y: 0 },
        stationary: true,
      })
    send(request('prepare'))
    await advance(0)
    send(request('animate'))
    await advance(0)
    expect(animationsOn(surface)).toEqual([])
    expect(surface.dataset.morph).toBe('dot')
  })
})
