import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import catalog from '../tile-catalog.json'
import { TILE_GLYPHS, TILE_VIEW_BOX } from '../tiles.generated'

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
)
const generator = createRequire(import.meta.url)(
  path.join(projectDir, 'scripts', 'generate-tiles.cjs')
) as { generateTilesSource: () => string; outputPath: string }

const catalogGlyphs = catalog.categories.flatMap((category) =>
  category.glyphs.map((glyph) => glyph.phosphor)
)

describe('tile catalog', () => {
  it('lists 150 distinct glyphs in 10 categories and 12 colours', () => {
    expect(catalog.categories).toHaveLength(10)
    expect(catalogGlyphs).toHaveLength(150)
    expect(new Set(catalogGlyphs).size).toBe(150)
    expect(catalog.colors).toHaveLength(12)
    for (const colour of catalog.colors) {
      expect(colour.hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('gives every glyph Chinese and English search keywords', () => {
    for (const category of catalog.categories) {
      for (const glyph of category.glyphs) {
        expect(glyph.zh.trim(), glyph.phosphor).not.toBe('')
        expect(glyph.en.trim(), glyph.phosphor).not.toBe('')
      }
    }
  })
})

describe('generated tile glyphs', () => {
  it('has drawing data for every catalog glyph and for nothing else', () => {
    expect(TILE_VIEW_BOX).toBe('0 0 256 256')
    expect(Object.keys(TILE_GLYPHS).sort()).toEqual([...catalogGlyphs].sort())

    for (const name of catalogGlyphs) {
      const paths = TILE_GLYPHS[name]
      expect(paths?.length, name).toBeGreaterThan(0)
      for (const d of paths ?? []) {
        expect(d, name).toMatch(/^M[-\dMmLlHhVvCcSsQqTtAaZz.,\s]+$/)
      }
    }
  })

  it('is deterministic and matches what the generator writes today', () => {
    const first = generator.generateTilesSource()
    const second = generator.generateTilesSource()

    expect(second).toBe(first)
    expect(fs.readFileSync(generator.outputPath, 'utf8')).toBe(first)
  })
})
