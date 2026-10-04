// The loading screen is painted before any script has run, so it cannot ask which theme is saved.
// It is dark by its fallbacks; for a light first frame the main process adds `#startup-light` to the
// window's address, and startup.css gives the loading screen the light theme's values through
// `:target`. Vitest does not load .css files, so the stylesheets and index.html are read from disk.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  declarations,
  lastValue,
  loadRules,
  readStyle,
  splitSelectors,
} from './css-utils'

const LIGHT_RULE = '#startup-light:target ~ #root .startup-shell'
const startup = loadRules('startup.css')
const themes = loadRules('themes.css')
const html = readFileSync(
  resolve(process.cwd(), 'src/renderer/index.html'),
  'utf8'
)
const page = new DOMParser().parseFromString(html, 'text/html')

/** The tokens the light rule sets, by name. */
const light = new Map(
  startup
    .filter((rule) => splitSelectors(rule.selector).includes(LIGHT_RULE))
    .flatMap((rule) => declarations(rule.body))
)

/** Every `var(--token, fallback)` of startup.css: the value drawn while no stylesheet defines it. */
function fallbacks(): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = /var\(\s*(--[\w-]+)\s*,\s*((?:[^()]|\([^()]*\))+)\)/g

  for (const match of readStyle('startup.css').matchAll(pattern)) {
    found.set(match[1]!, match[2]!.replace(/\s+/g, ' ').trim())
  }

  return found
}

describe('the marker in index.html', () => {
  const marker = page.getElementById('startup-light')
  const root = page.getElementById('root')

  it('is an empty, hidden element with the id the address names', () => {
    expect(marker).not.toBeNull()
    expect(marker!.hasAttribute('hidden')).toBe(true)
    expect(marker!.textContent).toBe('')
    expect(marker!.children).toHaveLength(0)
  })

  it('comes before #root with the same parent, which is what `~` needs', () => {
    expect(root).not.toBeNull()
    expect(marker!.parentElement).toBe(page.body)
    expect(root!.parentElement).toBe(page.body)
    expect(
      marker!.compareDocumentPosition(root!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    // The same selector without `:target` (which a parsed document has no address for) finds the
    // loading screen that index.html ships.
    expect(
      page.querySelector('#startup-light ~ #root .startup-shell')
    ).not.toBeNull()
  })

  it('is outside #root, so React replacing the loading screen does not remove it', () => {
    expect(root!.contains(marker)).toBe(false)
  })
})

describe('the light loading screen in startup.css', () => {
  it('is one rule on the loading screen, switched on by the address alone', () => {
    expect(
      startup.filter((rule) =>
        splitSelectors(rule.selector).includes(LIGHT_RULE)
      )
    ).toHaveLength(1)
    expect(light.size).toBeGreaterThan(0)
    // Nothing else in the stylesheet depends on the marker, or on a theme class a script would add.
    for (const rule of startup) {
      if (splitSelectors(rule.selector).includes(LIGHT_RULE)) continue
      expect(rule.selector).not.toContain('startup-light')
      expect(rule.selector).not.toContain('theme-')
    }
  })

  it('sets the surfaces, the line and the text of the light theme, with the values of themes.css', () => {
    expect([...light.keys()].sort()).toEqual([
      '--card-bg',
      '--line',
      '--text',
      '--text-dim',
      '--workspace-bg',
    ])
    for (const [name, value] of light) {
      expect(value, name).toBe(lastValue(themes, '.theme-light', name))
    }
  })

  it('only sets tokens the loading screen draws with', () => {
    const used = fallbacks()

    for (const name of light.keys()) {
      expect(used.has(name), name).toBe(true)
    }
  })

  it('keeps the dark fallbacks of those tokens equal to the dark theme, the other first frame', () => {
    const used = fallbacks()

    for (const name of light.keys()) {
      expect(used.get(name), name).toBe(lastValue(themes, ':root', name))
    }
  })

  it('comes after the rule that draws the loading screen, and outranks it', () => {
    const order = startup.map((rule) => rule.selector)

    expect(order.indexOf(LIGHT_RULE)).toBeGreaterThan(
      order.indexOf('.startup-shell')
    )
    expect(lastValue(startup, '.startup-shell', 'background')).toBe(
      'var(--workspace-bg, #15171e)'
    )
    expect(lastValue(startup, '.startup-shell', 'color')).toBe(
      'var(--text, #f1f5f9)'
    )
  })
})
