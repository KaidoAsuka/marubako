/**
 * The size of the floating ball, shared by the main process (which sizes and places its window)
 * and the interface (which draws it and aims the panel's animation at its centre). dock.css
 * carries the same numbers: a stylesheet cannot read them from here, and a test compares the two.
 */

/**
 * Side of the ball's native window, in pixels. Windows does not make a window lower than about 39
 * pixels (at any display scale; a smaller one comes out taller than it is wide, and off centre), so
 * the window is larger than the ball that is drawn in its middle.
 */
export const DOCK_SIZE = 40

/**
 * Side of the ball as drawn. The air around it is also what the spring needs that swells the ball
 * a little when it settles: nothing may be drawn outside the window.
 */
export const DOCK_BALL_SIZE = 30
