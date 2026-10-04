import type { CSSProperties } from 'react'

/**
 * Inline style that tells the slider styles in workspace.css how much of the track to paint in the
 * accent: `--range-fill` is the position of the thumb as a number from 0 to 1.
 */
export function rangeFill(
  value: number,
  min: number,
  max: number
): CSSProperties {
  const span = max - min
  const ratio = span > 0 ? (value - min) / span : 0
  const clamped = Math.min(1, Math.max(0, ratio))

  return { '--range-fill': clamped } as CSSProperties
}
