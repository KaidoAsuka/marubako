import { motionTimeScale } from '../../../shared/motion-scale'

/** The durations the stylesheets read at the default motion setting, in milliseconds. */
const BASE_FAST = 120
const BASE_NORMAL = 180
const BASE_SPRING = 600

export interface MotionDurations {
  fast: number
  normal: number
  spring: number
}

/**
 * `--motion-fast`, `--motion-normal` and `--motion-spring` for a motion setting, in milliseconds.
 * The same time scale drives the ball and the panel, so the whole app speeds up and slows down
 * together. `--motion-instant` (hover and press feedback) does not scale.
 */
export function motionDurations(motion: number): MotionDurations {
  const scale = motionTimeScale(motion)

  return {
    fast: Math.round(BASE_FAST * scale),
    normal: Math.round(BASE_NORMAL * scale),
    spring: Math.round(BASE_SPRING * scale),
  }
}

export function applyMotionTokens(root: HTMLElement, motion: number): void {
  const { fast, normal, spring } = motionDurations(motion)

  root.style.setProperty('--motion-fast', `${fast}ms`)
  root.style.setProperty('--motion-normal', `${normal}ms`)
  root.style.setProperty('--motion-spring', `${spring}ms`)
}
