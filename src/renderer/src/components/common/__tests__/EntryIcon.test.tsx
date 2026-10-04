import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { TILE_GLYPHS } from '../../../assets/tiles.generated'
import { FALLBACK_TILE } from '../../../utils/tile-icon'
import EntryIcon from '../EntryIcon'

function draw(icon: string, imageSrc?: string | null): HTMLElement {
  const { container } = render(<EntryIcon icon={icon} imageSrc={imageSrc} />)

  return container
}

describe('EntryIcon', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws a tile value as a coloured tile with the glyph inside', () => {
    const tile = draw('tile:folder:0').querySelector('.entry-tile')

    expect(tile).not.toBeNull()
    expect(tile).toHaveAttribute('data-tile-glyph', 'folder')
    expect(tile).toHaveAttribute('data-tile-color', '0')
    expect(tile).toHaveAttribute('aria-hidden', 'true')
    expect(tile).toHaveStyle({ '--tile-bg': '#7C6CF0', '--tile-fg': '#ffffff' })
    expect(tile?.textContent).toBe('')

    const svg = tile?.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 256 256')
    expect(
      Array.from(svg?.querySelectorAll('path') ?? []).map((path) =>
        path.getAttribute('d')
      )
    ).toEqual(TILE_GLYPHS['folder'])
  })

  it('picks a dark glyph for the light tile colours', () => {
    const tile = draw('tile:key:4').querySelector('.entry-tile')

    expect(tile).toHaveStyle({ '--tile-bg': '#719C27', '--tile-fg': '#16161d' })
  })

  it('draws every path of a multi-part glyph', () => {
    const tile = draw('tile:hard-drives:1').querySelector('.entry-tile')

    expect(tile?.querySelectorAll('path')).toHaveLength(
      TILE_GLYPHS['hard-drives']?.length ?? 0
    )
    expect(TILE_GLYPHS['hard-drives']?.length).toBeGreaterThan(1)
  })

  it('draws an unknown glyph or a bad colour as the neutral fallback instead of raw text', () => {
    const unknown = draw('tile:not-in-catalog:2').querySelector('.entry-tile')
    expect(unknown).toHaveAttribute('data-tile-glyph', FALLBACK_TILE.glyph)
    expect(unknown).toHaveAttribute('data-tile-color', '2')
    cleanup()

    const badColor = draw('tile:folder:77').querySelector('.entry-tile')
    expect(badColor).toHaveAttribute('data-tile-glyph', 'folder')
    expect(badColor).toHaveAttribute(
      'data-tile-color',
      String(FALLBACK_TILE.color)
    )
    expect(badColor?.textContent).toBe('')
  })

  it('draws old emoji and plain text exactly as before: a bare text span', () => {
    expect(draw('📁').innerHTML).toBe('<span>📁</span>')
    cleanup()
    expect(draw('🏷️').innerHTML).toBe('<span>🏷️</span>')
    cleanup()
    expect(draw('⌘').innerHTML).toBe('<span>⌘</span>')
    cleanup()
    expect(draw('AB').innerHTML).toBe('<span>AB</span>')
    expect(draw('AB').querySelector('.entry-tile')).toBeNull()
  })

  it('draws the empty string as an empty span, as before', () => {
    expect(draw('').innerHTML).toBe('<span></span>')
  })

  it('lets a real icon win over the stored value', () => {
    const container = draw('tile:folder:0', 'data:image/png;base64,AAAA')

    expect(container.innerHTML).toBe(
      '<img alt="" src="data:image/png;base64,AAAA">'
    )
    expect(container.querySelector('.entry-tile')).toBeNull()
  })

  it('falls back to the stored value when there is no real icon', () => {
    expect(draw('📂', null).innerHTML).toBe('<span>📂</span>')
    cleanup()
    expect(draw('📂', '').innerHTML).toBe('<span>📂</span>')
    cleanup()
    expect(
      draw('tile:globe:2', null).querySelector('.entry-tile')
    ).not.toBeNull()
  })
})
