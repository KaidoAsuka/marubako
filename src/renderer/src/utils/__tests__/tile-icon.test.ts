import { describe, expect, it } from 'vitest'

import { TILE_GLYPHS } from '../../assets/tiles.generated'
import {
  FALLBACK_TILE,
  GLYPH_ON_DARK,
  GLYPH_ON_LIGHT,
  TILE_CATEGORIES,
  TILE_COLORS,
  contrastRatio,
  formatTileIcon,
  parseTileIcon,
  resolveTile,
  searchTileCategories,
  tileBackground,
  tileForeground,
} from '../tile-icon'

describe('parseTileIcon', () => {
  it('reads a valid tile value', () => {
    expect(parseTileIcon('tile:folder:0')).toEqual({
      glyph: 'folder',
      color: 0,
    })
    expect(parseTileIcon('tile:terminal-window:11')).toEqual({
      glyph: 'terminal-window',
      color: 11,
    })
  })

  it('rejects a glyph that is not in the catalog', () => {
    expect(parseTileIcon('tile:no-such-glyph:3')).toBeNull()
    // Object prototype names are not glyphs either.
    expect(parseTileIcon('tile:constructor:3')).toBeNull()
    expect(parseTileIcon('tile:toString:3')).toBeNull()
  })

  it.each([
    'tile:folder:12',
    'tile:folder:99',
    'tile:folder:-1',
    'tile:folder:03',
    'tile:folder:1.5',
    'tile:folder:abc',
    'tile:folder:',
    'tile:folder',
    'tile:folder:1:2',
  ])('rejects the bad colour index in %s', (value) => {
    expect(parseTileIcon(value)).toBeNull()
  })

  it('does not take emoji, text or the empty string for a tile', () => {
    for (const value of ['📁', '🧪', 'ab', 'tile', 'Tile:folder:0', '']) {
      expect(parseTileIcon(value)).toBeNull()
    }
  })

  it('round-trips every glyph and colour through formatTileIcon', () => {
    for (const glyph of Object.keys(TILE_GLYPHS)) {
      for (let color = 0; color < TILE_COLORS.length; color += 1) {
        expect(parseTileIcon(formatTileIcon(glyph, color))).toEqual({
          glyph,
          color,
        })
      }
    }
  })
})

describe('resolveTile', () => {
  it('is null for everything that is not a tile value', () => {
    for (const value of [
      '📁',
      '⌘',
      '🏷️',
      'AB',
      '',
      ' ',
      'tile',
      'tiles:folder:0',
    ]) {
      expect(resolveTile(value)).toBeNull()
    }
  })

  it('returns the named tile for a valid value', () => {
    expect(resolveTile('tile:globe:2')).toEqual({ glyph: 'globe', color: 2 })
  })

  it('falls back per half: an unknown glyph keeps its colour, a bad colour keeps its glyph', () => {
    expect(resolveTile('tile:gone-from-catalog:4')).toEqual({
      glyph: FALLBACK_TILE.glyph,
      color: 4,
    })
    expect(resolveTile('tile:folder:40')).toEqual({
      glyph: 'folder',
      color: FALLBACK_TILE.color,
    })
    expect(resolveTile('tile:')).toEqual(FALLBACK_TILE)
    expect(resolveTile('tile:::')).toEqual(FALLBACK_TILE)
    expect(resolveTile('tile:constructor:x')).toEqual(FALLBACK_TILE)
  })

  it('uses a fallback glyph that exists in the catalog', () => {
    expect(Object.hasOwn(TILE_GLYPHS, FALLBACK_TILE.glyph)).toBe(true)
    expect(FALLBACK_TILE.color).toBe(TILE_COLORS.length - 1)
  })
})

describe('tile colours', () => {
  it('has twelve colours and a catalog of searchable glyph categories', () => {
    expect(TILE_COLORS).toHaveLength(12)
    expect(TILE_CATEGORIES).toHaveLength(10)
    expect(tileBackground(0)).toBe(TILE_COLORS[0]?.hex)
    expect(tileBackground(99)).toBe(TILE_COLORS[FALLBACK_TILE.color]?.hex)
  })

  it('puts a glyph colour on every tile that reads clearly (at least 3.6:1)', () => {
    for (const { hex } of TILE_COLORS) {
      const glyph = tileForeground(hex)

      expect([GLYPH_ON_LIGHT, GLYPH_ON_DARK]).toContain(glyph)
      expect(contrastRatio(hex, glyph), hex).toBeGreaterThanOrEqual(3.6)
    }
  })

  it('uses a white glyph only where white is clear, and the dark glyph where it is not', () => {
    for (const { hex } of TILE_COLORS) {
      const whiteIsClear = contrastRatio(hex, GLYPH_ON_LIGHT) >= 3.6

      expect(tileForeground(hex), hex).toBe(
        whiteIsClear ? GLYPH_ON_LIGHT : GLYPH_ON_DARK
      )
    }
    expect(tileForeground('#7C6CF0')).toBe(GLYPH_ON_LIGHT)
    expect(tileForeground('#719C27')).toBe(GLYPH_ON_DARK)
  })

  it('keeps every tile visible against both the lightest and the darkest surface (3:1)', () => {
    for (const { hex } of TILE_COLORS) {
      expect(contrastRatio(hex, '#ffffff'), `${hex} on white`).toBeGreaterThan(
        3
      )
      expect(contrastRatio(hex, '#16161d'), `${hex} on dark`).toBeGreaterThan(3)
    }
  })
})

describe('searchTileCategories', () => {
  const found = (query: string): string[] =>
    searchTileCategories(query).flatMap((category) =>
      category.glyphs.map((glyph) => glyph.phosphor)
    )

  it('returns the whole catalog for an empty or blank query', () => {
    expect(found('')).toHaveLength(150)
    expect(found('   ')).toHaveLength(150)
    expect(searchTileCategories('').map((category) => category.index)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  it('finds the folder glyphs by the Chinese keyword 文件夹', () => {
    const result = found('文件夹')

    expect(result).toEqual(
      expect.arrayContaining([
        'folder',
        'folder-open',
        'folder-lock',
        'folders',
      ])
    )
    expect(result).not.toContain('globe')
  })

  it('finds glyphs by English keywords, ignoring case, and needs every word', () => {
    expect(found('FOLDER')).toContain('folder')
    expect(found('open folder')).toEqual(['folder-open'])
    expect(found('folder rocket')).toEqual([])
  })

  it('also matches the Phosphor glyph name', () => {
    expect(found('terminal-window')).toEqual(['terminal-window'])
    expect(found('rocket launch')).toEqual(['rocket-launch'])
  })

  it('keeps the catalog index of the categories that still have a match', () => {
    const result = searchTileCategories('terminal')

    expect(result.length).toBeGreaterThan(0)
    for (const category of result) {
      expect(TILE_CATEGORIES[category.index]?.zh).toBe(category.zh)
    }
    expect(result.map((category) => category.index)).toContain(2)
  })

  it('returns nothing for a query nothing matches', () => {
    expect(searchTileCategories('zzzz-no-such-icon')).toEqual([])
  })
})
