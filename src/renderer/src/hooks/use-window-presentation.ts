import { useEffect } from 'react'

import { springKeyframes } from '../utils/spring'
import {
  BALL_RADIUS,
  BALL_SPRING,
  DOT_RADIUS,
  DOT_SCALE,
  PANEL_SPRING,
  currentScale,
  panelGeometry,
  type PanelGeometry,
} from '../utils/window-motion'

function painted(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** Frames for Web Animations, spread evenly over the animation. */
function scaleFrames(values: number[]): Keyframe[] {
  return values.map((value, index) => ({
    offset: index / (values.length - 1),
    transform: `scale(${value})`,
  }))
}

/**
 * Presents the two native windows. Each handshake stage is acknowledged when the
 * promise settles. The panel's spring and the ball's springs outlive the handshake:
 * they finish, and clean up after themselves, on their own.
 */
export function useWindowPresentation(): void {
  useEffect(() => {
    const root = document.getElementById('root')!
    const surfaceRoot = document.body
    const bubble = document.querySelector<HTMLElement>('.dock-bubble-surface')
    const dot = bubble?.querySelector<HTMLElement>('.dock-bubble-dot')
    // Bumped by every `prepare`: whatever a previous presentation left running
    // (a spring tail) must neither be waited for nor touch the new styles.
    let generation = 0
    let bodyAnimations: Animation[] = []
    let morphAnimations: Animation[] = []
    let geometry: PanelGeometry | undefined

    const clearBody = () => {
      bodyAnimations.forEach((animation) => animation.cancel())
      bodyAnimations = []
      Object.assign(surfaceRoot.style, {
        transform: '',
        opacity: '',
        transformOrigin: '',
        willChange: '',
        pointerEvents: '',
      })
    }

    // Replaces the animated values with the stylesheet's: the same numbers, so
    // nothing jumps (the e2e frame sampling watches for a pop through the press
    // transition when it switches).
    const finishMorph = (expanded: boolean) => {
      if (!bubble || !dot) return
      morphAnimations.forEach((morph) => morph.cancel())
      morphAnimations = []
      bubble.dataset.morph = expanded ? 'dot' : 'ball'
      Object.assign(bubble.style, {
        transform: '',
        borderRadius: '',
        willChange: '',
      })
      dot.style.opacity = ''
      dot.style.willChange = ''
    }

    // A ball that loads while the panel is already open stands for it as the plain
    // dot. Nothing is animated: once a presentation has started it owns the look.
    let active = true
    if (bubble && dot)
      void window.quickLaunch.window.getState().then((result) => {
        if (active && result.ok && !result.data.collapsed && generation === 0)
          finishMorph(true)
      })

    const unsubscribe = window.quickLaunch.onPrepareShow(
      async (presentation) => {
        const { stage, direction, surface, origin, timeScale } = presentation
        const panel = surface === 'panel'
        const expanded = direction === 'expand'
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
        // A ball that is not on screen yet fades in as the panel leaves.
        const fadeIn = !panel && !expanded && !presentation.stationary

        if (stage === 'prepare') {
          generation++
          // Read the ball's state before the old animations go: a press, or the tail
          // of the previous spring, is where the next spring has to start. A ball that
          // is not on screen yet appears as the plain dot the open panel stands for.
          if (bubble && dot) {
            const live = getComputedStyle(bubble)
            const scale = fadeIn ? DOT_SCALE : currentScale(live.transform)
            const radius = fadeIn ? DOT_RADIUS : live.borderRadius
            const opacity = fadeIn ? '0' : getComputedStyle(dot).opacity
            morphAnimations.forEach((morph) => morph.cancel())
            morphAnimations = []
            Object.assign(bubble.style, {
              transform: `scale(${scale})`,
              willChange: 'transform, border-radius',
            })
            if (radius) bubble.style.borderRadius = radius
            if (opacity) dot.style.opacity = opacity
            dot.style.willChange = 'opacity'
          }
          clearBody()
          if (panel) {
            geometry = panelGeometry(origin, innerWidth, innerHeight)
            if (document.activeElement instanceof HTMLButtonElement)
              document.activeElement.blur()
            Object.assign(surfaceRoot.style, {
              transformOrigin: geometry.origin,
              willChange: 'transform, opacity',
            })
            if (expanded) {
              surfaceRoot.style.opacity = '0'
              // Scaling would squeeze text towards the ball; reduced motion only fades.
              if (!reduced)
                surfaceRoot.style.transform = `scale(${geometry.expand})`
            } else surfaceRoot.style.pointerEvents = 'none'
          } else if (fadeIn) {
            Object.assign(surfaceRoot.style, {
              opacity: '0',
              willChange: 'opacity',
              pointerEvents: 'none',
            })
          }
          root.dataset.presentation = `${direction}-prepared`
        } else if (stage === 'animate') {
          root.dataset.presentation = `${direction}-animating`
          if (bubble && dot) {
            // Releasing the press is the animation's job: it takes over from the
            // pressed size, which `prepare` wrote down.
            bubble.parentElement?.removeAttribute('data-pressed')
            if (reduced) finishMorph(expanded)
            else {
              const from = currentScale(bubble.style.transform)
              const spring = springKeyframes(from, expanded ? DOT_SCALE : 1, {
                ...BALL_SPRING,
                response: BALL_SPRING.response * timeScale,
              })
              // The ball catches the panel: it only springs once the panel is on its way out.
              const delay = expanded ? 0 : 100 * timeScale
              const shape =
                bubble.style.borderRadius ||
                (expanded ? BALL_RADIUS : DOT_RADIUS)
              morphAnimations = [
                bubble.animate(scaleFrames(spring.values), {
                  duration: spring.duration,
                  delay,
                  easing: 'linear',
                  fill: 'both',
                }),
                bubble.animate(
                  [
                    { borderRadius: shape },
                    { borderRadius: expanded ? DOT_RADIUS : BALL_RADIUS },
                  ],
                  {
                    duration: 140 * timeScale,
                    delay,
                    easing: 'ease-out',
                    fill: 'both',
                  }
                ),
                dot.animate(
                  [
                    { opacity: dot.style.opacity || (expanded ? 1 : 0) },
                    { opacity: expanded ? 0 : 1 },
                  ],
                  {
                    duration: (expanded ? 90 : 140) * timeScale,
                    delay: expanded ? 0 : 140 * timeScale,
                    easing: 'ease-out',
                    fill: 'both',
                  }
                ),
              ]
              const mine = generation
              void Promise.all(
                morphAnimations.map((morph) => morph.finished)
              ).then(
                () => {
                  if (mine === generation) finishMorph(expanded)
                },
                () => {
                  /* Cancelled by a newer presentation, which owns the ball now. */
                }
              )
            }
          }
          if (fadeIn) {
            const fade = surfaceRoot.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: reduced ? 0 : 100 * timeScale,
              easing: 'ease-out',
              fill: 'forwards',
            })
            bodyAnimations = [fade]
            // Nothing else keeps the handshake back for a ball that appears on its own (no panel
            // shrinking beside it), and `reset` cancels the fade: wait for it to run out.
            const mine = generation
            await fade.finished.catch(() => {})
            // A newer presentation cancelled it and owns the styles and the state now.
            if (mine !== generation) return
          } else if (panel && geometry) {
            if (reduced) {
              // No movement at all: a short fade in, a shorter one out.
              const fade = surfaceRoot.animate(
                expanded
                  ? [{ opacity: 0 }, { opacity: 1 }]
                  : [{ opacity: 1 }, { opacity: 0 }],
                {
                  duration: expanded ? 100 : 60,
                  easing: 'ease-out',
                  fill: 'forwards',
                }
              )
              bodyAnimations = [fade]
              const mine = generation
              await fade.finished.catch(() => {})
              if (expanded && mine === generation) clearBody()
            } else if (expanded) {
              const spring = springKeyframes(geometry.expand, 1, {
                ...PANEL_SPRING,
                response: PANEL_SPRING.response * timeScale,
              })
              const scale = surfaceRoot.animate(scaleFrames(spring.values), {
                duration: spring.duration,
                easing: 'linear',
                fill: 'forwards',
              })
              const fade = surfaceRoot.animate(
                [{ opacity: 0 }, { opacity: 1 }],
                {
                  duration: 90 * timeScale,
                  easing: 'ease-out',
                  fill: 'forwards',
                }
              )
              bodyAnimations = [scale, fade]
              const mine = generation
              // The tail is almost invisible, but it is a real animation: it ends the
              // presentation's styles on its own, long after the handshake.
              void Promise.all([scale.finished, fade.finished]).then(
                () => {
                  if (mine === generation) clearBody()
                },
                () => {
                  /* Cancelled by a newer presentation. */
                }
              )
              await wait(Math.round(270 * timeScale))
              root.dataset.presentation = `${direction}-complete`
              return
            } else {
              const shrink = surfaceRoot.animate(
                [
                  { transform: 'scale(1)', opacity: 1 },
                  { transform: `scale(${geometry.collapse})`, opacity: 0 },
                ],
                {
                  duration: 160 * timeScale,
                  easing: 'cubic-bezier(0.4, 0, 1, 1)',
                  fill: 'forwards',
                }
              )
              bodyAnimations = [shrink]
              await shrink.finished.catch(() => {})
            }
          }
          root.dataset.presentation = `${direction}-complete`
        } else if (stage === 'reset') {
          // A panel that just opened keeps its spring running; it clears its own styles.
          if (panel && expanded && !reduced)
            surfaceRoot.style.pointerEvents = ''
          else clearBody()
          delete root.dataset.presentation
        }
        // Hidden Windows surfaces can suspend RAF despite backgroundThrottling=false.
        // Prepare/reset only update styles; the shown stage paints at native
        // opacity zero before the compositor reveals the incoming surface.
        if (stage === 'shown' || stage === 'animate') await painted()
      }
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
}
