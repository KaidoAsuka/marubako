// The scale moved to src/shared so the renderer's CSS motion tokens use the very same function as the
// ball and panel animations. This module keeps the main-process import path.
export { DEFAULT_MOTION, motionTimeScale } from '../shared/motion-scale'
