/** The `prefs.motion` value at which the window animations run at their specified speed. */
export const DEFAULT_MOTION = 1.35

/**
 * Multiplier for every duration, delay and spring response of the ball and panel
 * animations, and of the CSS motion tokens. Amplitudes never scale with it, so the
 * overshoot in pixels is the same at every setting.
 */
export function motionTimeScale(motion: number): number {
  if (!Number.isFinite(motion)) return 1
  return Math.min(1.6, Math.max(0.6, motion / DEFAULT_MOTION))
}

/**
 * The settings slider shows the animation duration as a percentage of the standard one: 100% is the
 * standard, smaller is faster, larger is slower. `prefs.motion` keeps its old scale (1.35 is the
 * standard), so nothing stored needs converting. The slider spans exactly the range the time scale
 * can use, so no part of it does nothing.
 */
export const MOTION_PERCENT_MIN = 60
export const MOTION_PERCENT_MAX = 160
export const MOTION_PERCENT_STEP = 5

/** The slider position for a stored `prefs.motion`, snapped to the slider's steps and range. */
export function motionToPercent(motion: number): number {
  const percent = Number.isFinite(motion)
    ? (motion / DEFAULT_MOTION) * 100
    : 100
  const snapped =
    Math.round(percent / MOTION_PERCENT_STEP) * MOTION_PERCENT_STEP

  return Math.min(MOTION_PERCENT_MAX, Math.max(MOTION_PERCENT_MIN, snapped))
}

/** The `prefs.motion` for a slider position. */
export function percentToMotion(percent: number): number {
  const clamped = Math.min(
    MOTION_PERCENT_MAX,
    Math.max(MOTION_PERCENT_MIN, percent)
  )

  return Math.round((clamped / 100) * DEFAULT_MOTION * 100) / 100
}
