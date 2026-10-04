import type { CSSProperties } from 'react'

import { TILE_GLYPHS, TILE_VIEW_BOX } from '../../assets/tiles.generated'
import {
  resolveTile,
  tileBackground,
  tileForeground,
} from '../../utils/tile-icon'

type Props = {
  /** The stored icon value: `tile:<glyph>:<colour>`, an emoji, or any text. */
  icon: string
  /** A real icon (a program's own icon) that wins over the stored value when there is one. */
  imageSrc?: string | null | undefined
}

type TileStyle = CSSProperties & { '--tile-bg': string; '--tile-fg': string }

/**
 * The one place that draws the icon of an entry, group or task: the real icon when there is one, a
 * coloured tile for a `tile:` value, and anything else as text exactly as it always was. The size comes
 * from the slot it sits in (`--entry-tile-size`, see entry-icon.css), so the same value looks the same in
 * a card, a list row, the search results and the drag preview.
 */
export default function EntryIcon({ icon, imageSrc }: Props): JSX.Element {
  if (imageSrc) {
    return <img alt="" src={imageSrc} />
  }

  const tile = resolveTile(icon)
  if (!tile) {
    return <span>{icon}</span>
  }

  const background = tileBackground(tile.color)
  const style: TileStyle = {
    '--tile-bg': background,
    '--tile-fg': tileForeground(background),
  }

  return (
    <span
      className="entry-tile"
      data-tile-glyph={tile.glyph}
      data-tile-color={tile.color}
      style={style}
      aria-hidden="true"
    >
      <svg viewBox={TILE_VIEW_BOX} fill="currentColor" focusable="false">
        {(TILE_GLYPHS[tile.glyph] ?? []).map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  )
}
