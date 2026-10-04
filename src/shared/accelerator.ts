/**
 * The global shortcut that brings the panel up from any application. Electron names a shortcut by an
 * "accelerator" string such as `CommandOrControl+Shift+Space`; this module is the one place that knows
 * which accelerators the app accepts, how they are written canonically, how they read to the user
 * (`Ctrl + Shift + Space`) and how a key press becomes one. Both processes use it: the main process to
 * validate what is stored and registered, the settings dialog to record a new combination.
 */

export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space'

export type Modifier = 'CommandOrControl' | 'Alt' | 'Shift' | 'Super'

/** In the order a canonical accelerator lists them, and in which the label reads. */
const MODIFIER_ORDER: readonly Modifier[] = [
  'CommandOrControl',
  'Alt',
  'Shift',
  'Super',
]

const MODIFIER_NAMES: Record<string, Modifier> = {
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  control: 'CommandOrControl',
  ctrl: 'CommandOrControl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  win: 'Super',
  windows: 'Super',
}

const MODIFIER_LABELS: Record<Modifier, string> = {
  CommandOrControl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Super: 'Win',
}

// The keys a global shortcut may use: letters, digits, function keys, Space, the arrows and the
// navigation block. Punctuation depends on the keyboard layout and is left out on purpose.
const NAMED_KEYS = [
  'Space',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
] as const

const KEY_PATTERN = /^(?:[A-Z]|[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/

export interface ParsedAccelerator {
  modifiers: Modifier[]
  key: string
}

export type AcceleratorProblem =
  /** Not a string, empty, or not made of modifiers and exactly one key a shortcut can use. */
  | 'format'
  /** Fewer than two modifiers, or only Shift: it would take over typing in every program. */
  | 'modifiers'
  /** Belongs to Windows itself. */
  | 'reserved'

export type AcceleratorCheck =
  | { ok: true; accelerator: string }
  | { ok: false; problem: AcceleratorProblem }

function canonicalKey(token: string): string | null {
  const upper = token.toUpperCase()
  if (KEY_PATTERN.test(upper)) return upper
  const named = NAMED_KEYS.find(
    (name) => name.toLowerCase() === token.toLowerCase()
  )
  if (named) return named
  // Names Electron also knows for the same keys.
  const aliases: Record<string, string> = {
    arrowup: 'Up',
    arrowdown: 'Down',
    arrowleft: 'Left',
    arrowright: 'Right',
    pgup: 'PageUp',
    pgdn: 'PageDown',
    del: 'Delete',
    ins: 'Insert',
    spacebar: 'Space',
  }

  return aliases[token.toLowerCase()] ?? null
}

/**
 * Splits an accelerator into its modifiers (possibly none) and its one key, or null when it is not
 * one. It does not judge whether the combination is a good global shortcut (`validateAccelerator`).
 */
export function parseAccelerator(input: unknown): ParsedAccelerator | null {
  if (typeof input !== 'string') return null
  const tokens = input.split('+').map((token) => token.trim())
  if (tokens.some((token) => token === '')) return null

  const modifiers = new Set<Modifier>()
  let key: string | null = null
  for (const token of tokens) {
    const modifier = MODIFIER_NAMES[token.toLowerCase()]
    if (modifier) {
      modifiers.add(modifier)
      continue
    }
    const candidate = canonicalKey(token)
    // Two keys, or a token that is neither a modifier nor a usable key.
    if (!candidate || key !== null) return null
    key = candidate
  }
  if (key === null) return null

  return {
    modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    key,
  }
}

function writeAccelerator(parsed: ParsedAccelerator): string {
  return [...parsed.modifiers, parsed.key].join('+')
}

/**
 * Whether the app accepts this accelerator as the launch shortcut, and its canonical spelling.
 * A global shortcut works in every program, so one that a program already uses for typing or editing
 * (Ctrl+C, Alt+F, a bare F-key) is refused: it needs at least two modifiers, one of them not Shift.
 */
export function validateAccelerator(input: unknown): AcceleratorCheck {
  const parsed = parseAccelerator(input)
  if (!parsed) return { ok: false, problem: 'format' }
  if (parsed.modifiers.length < 2) return { ok: false, problem: 'modifiers' }
  if (parsed.modifiers.every((modifier) => modifier === 'Shift')) {
    return { ok: false, problem: 'modifiers' }
  }
  const accelerator = writeAccelerator(parsed)
  // Ctrl+Alt+Delete is the secure attention sequence; Windows never lets a program have it.
  if (accelerator === 'CommandOrControl+Alt+Delete') {
    return { ok: false, problem: 'reserved' }
  }

  return { ok: true, accelerator }
}

/** The canonical accelerator, or null when it is not an acceptable launch shortcut. */
export function normalizeAccelerator(input: unknown): string | null {
  const check = validateAccelerator(input)

  return check.ok ? check.accelerator : null
}

/** How the shortcut reads to the user: `Ctrl + Shift + Space`. Falls back to the text itself. */
export function formatAccelerator(accelerator: string): string {
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return accelerator

  return [...parsed.modifiers.map((m) => MODIFIER_LABELS[m]), parsed.key].join(
    ' + '
  )
}

const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
}

/** The key of a physical key code (`KeyA`, `Digit1`, `F5`, `ArrowUp`), independent of the layout. */
function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]!
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]!
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code

  return CODE_KEYS[code] ?? null
}

export interface KeyPress {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * The accelerator a key press spells, or null while only modifiers are down (or the key is one a
 * shortcut cannot use). It is not checked for being a good shortcut, a bare key included: use
 * `validateAccelerator`.
 */
export function acceleratorFromKeyPress(press: KeyPress): string | null {
  const key = keyFromCode(press.code)
  if (!key) return null
  const modifiers: Modifier[] = []
  if (press.ctrlKey) modifiers.push('CommandOrControl')
  if (press.altKey) modifiers.push('Alt')
  if (press.shiftKey) modifiers.push('Shift')
  if (press.metaKey) modifiers.push('Super')

  return writeAccelerator({ modifiers, key })
}
