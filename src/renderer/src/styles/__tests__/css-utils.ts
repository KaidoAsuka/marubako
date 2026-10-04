// Helpers for tests that assert on the real stylesheets. Vitest does not load .css files, so these
// read them from disk and answer the few questions the design-token tests ask: which value does a
// selector end up with, and what is the contrast between two resolved colours.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type CssRule = {
  /** The raw selector list (or at-rule prelude such as `@keyframes foo`). */
  selector: string
  body: string
  /** Enclosing at-rule preludes, outermost first, e.g. `@media (max-width: 480px)`. */
  at: string[]
}

const STYLES_DIR = resolve(process.cwd(), 'src/renderer/src/styles')

export function readStyle(name: string): string {
  return readFileSync(resolve(STYLES_DIR, name), 'utf8')
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseBlock(text: string, at: string[]): CssRule[] {
  const rules: CssRule[] = []
  let index = 0

  while (index < text.length) {
    const open = text.indexOf('{', index)
    if (open === -1) break
    const prelude = text.slice(index, open).trim()
    let depth = 1
    let cursor = open + 1
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === '{') depth += 1
      else if (text[cursor] === '}') depth -= 1
      cursor += 1
    }
    const inner = text.slice(open + 1, cursor - 1)

    if (/^@(media|supports|layer)\b/.test(prelude)) {
      rules.push(...parseBlock(inner, [...at, prelude]))
    } else {
      rules.push({ selector: prelude, body: inner, at })
    }
    index = cursor
  }

  return rules
}

/** Every rule of a stylesheet in source order, with @media/@supports flattened into `at`. */
export function parseRules(css: string): CssRule[] {
  const clean = stripComments(css).replace(/@import[^;]*;/g, '')

  return parseBlock(clean, [])
}

/** Splits a selector list on top-level commas (`:is(.a, .b)` stays in one piece). */
export function splitSelectors(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (const char of list) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())

  // Whitespace is not significant, and Prettier breaks long :is() lists over several lines.
  return parts.map((part) =>
    part.replace(/\s+/g, ' ').replace(/\(\s/g, '(').replace(/\s\)/g, ')')
  )
}

export function declarations(body: string): Array<[string, string]> {
  const result: Array<[string, string]> = []
  let depth = 0
  let current = ''

  // Declarations are split on `;` outside parentheses (url(data:...;base64) and the like).
  for (const char of body) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ';' && depth === 0) {
      result.push(splitDeclaration(current))
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) result.push(splitDeclaration(current))

  return result.filter(([name]) => name !== '')
}

function splitDeclaration(text: string): [string, string] {
  const colon = text.indexOf(':')
  if (colon === -1) return ['', '']

  return [
    text.slice(0, colon).trim(),
    text
      .slice(colon + 1)
      .replace(/\s+/g, ' ')
      .trim(),
  ]
}

export function loadRules(file: string): CssRule[] {
  return parseRules(readStyle(file))
}

/** The order main.tsx imports the stylesheets in; global.css pulls themes.css in first. */
export const CASCADE_ORDER = [
  'themes.css',
  'global.css',
  'workspace.css',
  'code.css',
  'collection.css',
  'tasks.css',
  'item-editor.css',
  'motion.css',
  'dock.css',
  'data-notice.css',
  'entry-icon.css',
  'icon-picker.css',
  'chrome.css',
  'feedback.css',
  'onboarding.css',
]

/** Every stylesheet's rules concatenated in cascade order, for "which value wins" questions. */
export function loadCascade(): CssRule[] {
  return CASCADE_ORDER.flatMap((file) => loadRules(file))
}

/**
 * The value `property` ends up with for exactly `selector` in a stylesheet: the last matching
 * declaration in source order (the cascade for equal specificity). `at` filters by the enclosing
 * at-rules; the default is "top level only".
 */
export function lastValue(
  rules: CssRule[],
  selector: string,
  property: string,
  at: string[] = []
): string | undefined {
  let value: string | undefined

  for (const rule of rules) {
    if (rule.at.join('|') !== at.join('|')) continue
    if (!splitSelectors(rule.selector).includes(selector)) continue
    for (const [name, declared] of declarations(rule.body)) {
      if (name === property) value = declared
    }
  }

  return value
}

/** Every rule whose selector list mentions `fragment` (substring match on any selector). */
export function rulesMatching(rules: CssRule[], fragment: string): CssRule[] {
  return rules.filter((rule) =>
    splitSelectors(rule.selector).some((part) => part.includes(fragment))
  )
}

export type Rgba = { r: number; g: number; b: number; a: number }

export function parseColor(value: string): Rgba {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)

  if (hex) {
    const raw = hex[1] ?? ''
    const digits =
      raw.length === 3
        ? raw
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : raw

    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    }
  }

  const fn =
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(
      text
    )
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : parseAlpha(fn[4])

    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: alpha }
  }

  // What getComputedStyle reports for color-mix() results.
  const srgb =
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
      text
    )
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: srgb[4] === undefined ? 1 : parseAlpha(srgb[4]),
    }
  }

  throw new Error(`Unsupported colour: ${value}`)
}

function parseAlpha(text: string): number {
  return text.endsWith('%') ? Number.parseFloat(text) / 100 : Number(text)
}

/** `top` painted over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  }
}

export function luminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio. Both colours must be opaque (use `over` first). */
export function contrast(a: Rgba | string, b: Rgba | string): number {
  const first = luminance(typeof a === 'string' ? parseColor(a) : a)
  const second = luminance(typeof b === 'string' ? parseColor(b) : b)
  const [light, dark] = first >= second ? [first, second] : [second, first]

  return (light + 0.05) / (dark + 0.05)
}

export type Hsl = { h: number; s: number; l: number }

export function toHsl({ r, g, b }: Rgba): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, s: 0, l }

  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === red) h = ((green - blue) / delta) % 6
  else if (max === green) h = (blue - red) / delta + 2
  else h = (red - green) / delta + 4
  h = (h * 60 + 360) % 360

  return { h, s, l }
}

/**
 * "Blue" as the people who complained about it mean it: a clearly coloured pixel between cyan-blue
 * and pure blue. Violet (the brand, 247-252 degrees), slate greys and the near-black navy of the
 * dark surfaces carry too little chroma to read as blue.
 */
export function isBlue(color: Rgba): boolean {
  const { h } = toHsl(color)
  const chroma =
    (Math.max(color.r, color.g, color.b) -
      Math.min(color.r, color.g, color.b)) /
    255

  return h >= 190 && h < 242 && chroma >= 0.2
}

/** Every colour literal (hex, rgb/rgba or a computed color(srgb ...)) in a piece of text. */
export function colorLiterals(text: string): string[] {
  return (
    text.match(
      /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|color\(srgb[^)]*\)/g
    ) ?? []
  )
}

export type Specificity = [ids: number, classes: number, elements: number]

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * CSS specificity of one selector (not a list). `:is()`, `:not()` and `:has()` count as their most
 * specific argument, `::pseudo-elements` as elements, `:where()` as nothing.
 */
export function specificity(selector: string): Specificity {
  let ids = 0
  let classes = 0
  let elements = 0
  let index = 0

  const argument = (open: number): [string, number] => {
    let depth = 1
    let cursor = open + 1
    while (cursor < selector.length && depth > 0) {
      if (selector[cursor] === '(') depth += 1
      if (selector[cursor] === ')') depth -= 1
      cursor += 1
    }

    return [selector.slice(open + 1, cursor - 1), cursor]
  }

  while (index < selector.length) {
    const char = selector[index]!

    if (char === '#') {
      ids += 1
      index += 1
    } else if (char === '.') {
      classes += 1
      index += 1
    } else if (char === '[') {
      classes += 1
      index = selector.indexOf(']', index) + 1
    } else if (char === ':') {
      if (selector[index + 1] === ':') {
        elements += 1
        index += 2
      } else {
        const name = /^:([a-z-]+)/.exec(selector.slice(index))![1]!
        index += name.length + 1
        if (selector[index] === '(') {
          const [inner, next] = argument(index)
          index = next
          if (name === 'where') continue
          if (name === 'is' || name === 'not' || name === 'has') {
            const best = splitSelectors(inner)
              .map((part) => specificity(part))
              .sort(compareSpecificity)
              .pop()
            if (best) {
              ids += best[0]
              classes += best[1]
              elements += best[2]
            }
            continue
          }
        }
        classes += 1
      }
    } else if (/[a-zA-Z]/.test(char)) {
      const word = /^[a-zA-Z][\w-]*/.exec(selector.slice(index))![0]
      elements += 1
      index += word.length
    } else {
      index += 1
    }
  }

  return [ids, classes, elements]
}

/** `color-mix(in srgb, top share%, bottom)` of two opaque colours; `share` is 0 to 1. */
export function mixOpaque(top: Rgba, share: number, bottom: Rgba): Rgba {
  return {
    r: top.r * share + bottom.r * (1 - share),
    g: top.g * share + bottom.g * (1 - share),
    b: top.b * share + bottom.b * (1 - share),
    a: 1,
  }
}

/**
 * What a theme's `--accent-solid-hover` formula makes of a solid fill: themes.css derives it as a
 * mix of `var(--accent-solid)` with white (dark) or black (light) instead of listing a value.
 */
export function hoverFill(formula: string, solid: string): Rgba {
  const match =
    /^color-mix\(in srgb, var\(--accent-solid\), (#[0-9a-f]{3,6}) (\d+)%\)$/.exec(
      formula
    )
  if (!match) throw new Error(`Not the expected hover formula: ${formula}`)

  return mixOpaque(
    parseColor(match[1]!),
    Number(match[2]) / 100,
    parseColor(solid)
  )
}
