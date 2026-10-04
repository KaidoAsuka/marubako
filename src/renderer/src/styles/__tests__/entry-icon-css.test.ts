import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const styles = resolve(__dirname, '..')
const css = readFileSync(resolve(styles, 'entry-icon.css'), 'utf8')
const main = readFileSync(resolve(styles, '..', 'main.tsx'), 'utf8')

function rules(): Array<{ selectors: string[]; body: string }> {
  return Array.from(
    css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)
  ).map((match) => ({
    selectors: (match[1] ?? '').split(',').map((selector) => selector.trim()),
    body: match[2] ?? '',
  }))
}

// Every slot that holds an EntryIcon (see entry-icon-sites.test.tsx).
const SLOTS = [
  '.group-card-icon',
  '.task-card-icon',
  '.item-icon',
  '.grid-ico',
  '.loose-icon-source',
  '.widget-folder-symbol',
  '.widget-popup-icon',
  '.snippet-icon',
  '.command-result-icon',
]

describe('entry icon styles', () => {
  it('is loaded by the app', () => {
    expect(main).toContain("import './styles/entry-icon.css'")
  })

  it('sizes the tile from the slot it sits in, with an em fallback', () => {
    const tile = rules().find((rule) => rule.selectors.includes('.entry-tile'))

    expect(tile?.body).toMatch(/width:\s*var\(--entry-tile-size,\s*1\.2em\)/)
    expect(tile?.body).toMatch(/height:\s*var\(--entry-tile-size,\s*1\.2em\)/)
    expect(tile?.body).toContain('background: var(--tile-bg)')
    expect(tile?.body).toContain('color: var(--tile-fg)')
  })

  it.each(SLOTS)('%s gives its tile a size in pixels', (slot) => {
    const sized = rules().filter(
      (rule) =>
        rule.selectors.includes(slot) &&
        /--entry-tile-size:\s*\d+px/.test(rule.body)
    )

    expect(sized).toHaveLength(1)
  })

  it('does not tint tiles per theme: the colours are the same in dark and light', () => {
    expect(css).not.toMatch(/theme-(?:dark|light)|data-theme/)
  })
})
