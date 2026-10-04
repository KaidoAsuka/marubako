import { DEFAULT_PANEL_WIDTH } from '../shared/layout-widths'
import type { Lang } from '../shared/types'
import {
  DEFAULT_WINDOW_HEIGHT,
  MIN_EXPANDED_HEIGHT,
  MIN_EXPANDED_WIDTH,
  WINDOW_MARGIN,
} from './config'

type Size = { width: number; height: number }

function between(value: number, min: number, max: number): number {
  return max < min ? min : Math.max(min, Math.min(max, value))
}

/**
 * The size of the panel on a new installation: slender, never square. The width belongs to the
 * language (400 for Chinese, wide enough for every category name to stand whole under its icon in the
 * others, see shared/layout-widths.ts); the height is 720, or what the screen leaves once the margins
 * are taken off. A window the user has sized before is never given this size.
 */
export function getDefaultWindowSize(lang: Lang, workArea: Size): Size {
  const maxWidth = Math.max(
    MIN_EXPANDED_WIDTH,
    workArea.width - WINDOW_MARGIN * 2
  )
  const maxHeight = Math.max(
    MIN_EXPANDED_HEIGHT,
    workArea.height - WINDOW_MARGIN * 2
  )

  return {
    width: between(DEFAULT_PANEL_WIDTH[lang], MIN_EXPANDED_WIDTH, maxWidth),
    height: between(
      DEFAULT_WINDOW_HEIGHT,
      Math.min(MIN_EXPANDED_HEIGHT, maxHeight),
      maxHeight
    ),
  }
}
