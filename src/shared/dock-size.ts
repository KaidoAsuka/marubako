/**
 * The size of the floating ball, shared by the main process (which sizes and places its window)
 * and the interface (which draws it and aims the panel's animation at its centre). The ball is as
 * large as the user set it (Prefs.ballSize); dock.css draws it from a variable the ball's window
 * is given, with the default below as its fallback, and a test compares the two.
 */

/** Side of the ball as drawn when nothing else is set, in pixels. */
export const DOCK_BALL_SIZE = 30
/** The range the setting offers. */
export const MIN_BALL_SIZE = 24
export const MAX_BALL_SIZE = 64
export const BALL_SIZE_STEP = 2

/**
 * The least air around the ball inside its window. Nothing may be drawn outside the window, and
 * the spring swells the ball a little when it settles: by up to 12.6% of its size (rounded up
 * here), the hairline around it included. For a large ball that is more than the ten pixels.
 */
const BALL_AIR = 10
const BALL_RING = 1
const BALL_SPRING_PEAK = 1.13
/**
 * The side of the window is a multiple of this. At the display scales of Windows (125%, 150%,
 * 175%) such a length is a whole number of screen pixels; a window of any other size comes out a
 * pixel larger than it was asked to be, and the ball in it is drawn between two pixels.
 */
const DOCK_SIZE_STEP = 4
/**
 * Windows does not make a window lower than about 39 pixels (at any display scale; a smaller one
 * comes out taller than it is wide, and off centre), so the window of a small ball is larger than
 * the air alone would make it.
 */
const MIN_DOCK_SIZE = 40

/**
 * A ball size that can be drawn: one of the steps of the setting inside its range, else the
 * default. An odd size would leave half a pixel of air on each side of the ball.
 */
export function clampBallSize(
  value: unknown,
  fallback = DOCK_BALL_SIZE
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const inRange = Math.min(MAX_BALL_SIZE, Math.max(MIN_BALL_SIZE, value))
  return Math.round(inRange / BALL_SIZE_STEP) * BALL_SIZE_STEP
}

/** Side of the ball's native window for a ball of that size, in pixels. */
export function dockWindowSize(ballSize: number): number {
  const ball = clampBallSize(ballSize)
  const needed = Math.max(
    ball + BALL_AIR,
    Math.ceil((ball + 2 * BALL_RING) * BALL_SPRING_PEAK)
  )
  return Math.max(
    MIN_DOCK_SIZE,
    Math.ceil(needed / DOCK_SIZE_STEP) * DOCK_SIZE_STEP
  )
}

/** Side of the native window of a ball of the default size. */
export const DOCK_SIZE = dockWindowSize(DOCK_BALL_SIZE)
