// Preset entry icons are coloured tiles: a filled Phosphor glyph on a coloured rounded square. They are
// stored in the ordinary `icon` string field as `tile:<glyph>:<colour index>` (for example
// `tile:folder:0`). Every other value is plain text or an emoji, exactly as before, so old data needs
// no migration and typing any emoji still works.
import catalog from '../assets/tile-catalog.json'
import { TILE_GLYPHS } from '../assets/tiles.generated'

export const TILE_PREFIX = 'tile:'

export type TileColor = { zh: string; hex: string }
export type TileGlyph = { phosphor: string; zh: string; en: string }
export type TileCategory = { zh: string; en: string; glyphs: TileGlyph[] }

export const TILE_COLORS: readonly TileColor[] = catalog.colors
export const TILE_CATEGORIES: readonly TileCategory[] = catalog.categories

/** A tile that is neither unknown nor malformed. */
export type TileSpec = { glyph: string; color: number }

/** What an invalid `tile:` value draws: a neutral grey-blue tile with a plain window. */
export const FALLBACK_TILE: TileSpec = {
  glyph: 'app-window',
  color: TILE_COLORS.length - 1,
}

export const GLYPH_ON_LIGHT = '#ffffff'
export const GLYPH_ON_DARK = '#16161d'

// White glyphs on the tile colours that carry them well (purple, blue, red, rose, brown, grey-blue);
// the lighter greens, yellows, oranges and pinks get a near-black glyph, which reads far better there.
const WHITE_GLYPH_MIN_CONTRAST = 3.6

function channel(value: number): number {
  const scaled = value / 255
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** The glyph colour that goes on a tile of the given background colour. */
export function tileForeground(background: string): string {
  return contrastRatio(background, GLYPH_ON_LIGHT) >= WHITE_GLYPH_MIN_CONTRAST
    ? GLYPH_ON_LIGHT
    : GLYPH_ON_DARK
}

export function formatTileIcon(glyph: string, color: number): string {
  return `${TILE_PREFIX}${glyph}:${color}`
}

const COLOR_INDEX = /^(0|[1-9]\d?)$/

function validColor(raw: string): number | null {
  if (!COLOR_INDEX.test(raw)) return null
  const color = Number(raw)

  return color < TILE_COLORS.length ? color : null
}

/** The tile a value names, or null unless the glyph is in the catalog and the colour index is 0-11. */
export function parseTileIcon(value: string): TileSpec | null {
  const match = /^tile:([a-z0-9-]+):(\d+)$/.exec(value)
  const glyph = match?.[1]
  const color = validColor(match?.[2] ?? '')

  if (!glyph || color === null || !Object.hasOwn(TILE_GLYPHS, glyph)) {
    return null
  }

  return { glyph, color }
}

/**
 * What to draw for a stored value: the tile it names, or null for every value that is not a tile
 * (plain text, an emoji, an empty string). A `tile:` value whose glyph or colour is unknown, for
 * instance after the catalog dropped a glyph, still draws a tile: each half falls back on its own, so
 * a bad colour keeps its glyph and an unknown glyph keeps its colour.
 */
export function resolveTile(value: string): TileSpec | null {
  if (!value.startsWith(TILE_PREFIX)) return null

  const parts = /^tile:([^:]*):([^:]*)$/.exec(value)
  const glyph = parts?.[1] ?? ''

  return {
    glyph: Object.hasOwn(TILE_GLYPHS, glyph) ? glyph : FALLBACK_TILE.glyph,
    color: validColor(parts?.[2] ?? '') ?? FALLBACK_TILE.color,
  }
}

export function tileBackground(color: number): string {
  return (
    TILE_COLORS[color]?.hex ??
    TILE_COLORS[FALLBACK_TILE.color]?.hex ??
    '#647995'
  )
}

/** A catalog category with the glyphs that matched a search; `index` is its position in the catalog. */
export type TileCategoryMatch = TileCategory & { index: number }

/**
 * The catalog narrowed to the glyphs matching a search. Every word of the query must appear (case
 * insensitive) in the glyph's Chinese keywords, English keywords or Phosphor name, so "文件夹" finds the
 * folder glyphs and "open folder" finds the open one; a hyphen counts as a space, so a Phosphor name
 * like "terminal-window" works as typed. An empty query returns the whole catalog;
 * categories without a match are left out.
 */
export function searchTileCategories(query: string): TileCategoryMatch[] {
  const words = query
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('-', ' ')
    .split(/\s+/)
    .filter(Boolean)

  return TILE_CATEGORIES.map((category, index) => ({
    ...category,
    index,
    glyphs: category.glyphs.filter((glyph) => {
      const haystack =
        `${glyph.zh} ${glyph.en} ${glyph.phosphor.replaceAll('-', ' ')}`.toLowerCase()

      return words.every((word) => haystack.includes(word))
    }),
  })).filter((category) => category.glyphs.length > 0)
}
