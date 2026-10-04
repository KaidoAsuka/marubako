import { describe, expect, it } from 'vitest'

import {
  acceleratorFromKeyPress,
  DEFAULT_SHORTCUT,
  formatAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  validateAccelerator,
} from '../accelerator'

const press = (
  code: string,
  modifiers: Partial<{
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    metaKey: boolean
  }> = {}
) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
})

describe('the default shortcut', () => {
  it('is Ctrl+Alt+Space and is itself a valid launch shortcut in its canonical spelling', () => {
    expect(DEFAULT_SHORTCUT).toBe('CommandOrControl+Alt+Space')
    expect(normalizeAccelerator(DEFAULT_SHORTCUT)).toBe(DEFAULT_SHORTCUT)
    expect(formatAccelerator(DEFAULT_SHORTCUT)).toBe('Ctrl + Alt + Space')
  })
})

describe('parseAccelerator', () => {
  it('splits modifiers from the key and orders the modifiers', () => {
    expect(parseAccelerator('Alt+Ctrl+K')).toEqual({
      modifiers: ['CommandOrControl', 'Alt'],
      key: 'K',
    })
  })

  it.each([
    ['Ctrl', 'CommandOrControl'],
    ['Control', 'CommandOrControl'],
    ['CmdOrCtrl', 'CommandOrControl'],
    ['commandorcontrol', 'CommandOrControl'],
    ['Win', 'Super'],
    ['Meta', 'Super'],
    ['Option', 'Alt'],
  ])('knows %s as %s', (name, modifier) => {
    expect(parseAccelerator(`${name}+Alt+X`)?.modifiers).toContain(modifier)
  })

  it('reads letters in either case and function keys', () => {
    expect(parseAccelerator('Ctrl+Alt+q')?.key).toBe('Q')
    expect(parseAccelerator('Ctrl+Alt+F11')?.key).toBe('F11')
    expect(parseAccelerator('Ctrl+Alt+f24')?.key).toBe('F24')
  })

  it('accepts a bare key (so a later check can say what is missing)', () => {
    expect(parseAccelerator('K')).toEqual({ modifiers: [], key: 'K' })
  })

  it.each([
    undefined,
    null,
    42,
    {},
    '',
    '   ',
    '+',
    'Ctrl+',
    '+K',
    'Ctrl+Alt',
    'Ctrl+Alt+Shift',
    'Ctrl+Alt+K+L',
    'Ctrl+Alt+Escape',
    'Ctrl+Alt+Tab',
    'Ctrl+Alt+,',
    'Ctrl+Alt+F25',
    'Ctrl+Alt+F0',
    'Ctrl+Alt+Nonsense',
  ])('rejects %j', (input) => {
    expect(parseAccelerator(input)).toBeNull()
  })
})

describe('validateAccelerator', () => {
  it.each([
    'Ctrl+Alt+Space',
    'CommandOrControl+Alt+Q',
    'Ctrl+Shift+Space',
    'Alt+Shift+K',
    'Ctrl+Alt+F10',
    'Ctrl+Alt+Shift+9',
    'Ctrl+Win+Left',
    'Ctrl+Alt+PageUp',
  ])('accepts %s', (input) => {
    expect(validateAccelerator(input).ok).toBe(true)
  })

  it('returns the canonical spelling, whatever the input used', () => {
    expect(validateAccelerator('alt+control+space')).toEqual({
      ok: true,
      accelerator: 'CommandOrControl+Alt+Space',
    })
    expect(validateAccelerator('Shift+Win+Ctrl+arrowup')).toEqual({
      ok: true,
      accelerator: 'CommandOrControl+Shift+Super+Up',
    })
  })

  it.each([
    ['a bare key', 'K'],
    ['a function key alone', 'F5'],
    ['one modifier', 'Ctrl+K'],
    ['Alt and a key', 'Alt+F'],
    ['Shift and a key', 'Shift+A'],
    ['Win and a key', 'Win+E'],
    ['Shift only, twice', 'Shift+Shift+A'],
  ])(
    'refuses %s: too little to keep out of typing and editing',
    (_label, input) => {
      expect(validateAccelerator(input)).toEqual({
        ok: false,
        problem: 'modifiers',
      })
    }
  )

  it('refuses Ctrl+Alt+Delete: Windows keeps it', () => {
    expect(validateAccelerator('Ctrl+Alt+Delete')).toEqual({
      ok: false,
      problem: 'reserved',
    })
  })

  it.each(['', 'Ctrl+Alt', 'Ctrl+Alt+?', 'nonsense', null, 5])(
    'refuses %j as not an accelerator',
    (input) => {
      expect(validateAccelerator(input)).toEqual({
        ok: false,
        problem: 'format',
      })
    }
  )

  it('is idempotent: a canonical accelerator validates to itself', () => {
    for (const input of [
      'Ctrl+Alt+Space',
      'Alt+Shift+K',
      'Ctrl+Win+Left',
      'Ctrl+Alt+Shift+F12',
    ]) {
      const first = normalizeAccelerator(input)!
      expect(normalizeAccelerator(first)).toBe(first)
    }
  })
})

describe('formatAccelerator', () => {
  it.each([
    ['CommandOrControl+Alt+Space', 'Ctrl + Alt + Space'],
    ['CommandOrControl+Shift+Space', 'Ctrl + Shift + Space'],
    ['CommandOrControl+Alt+Q', 'Ctrl + Alt + Q'],
    ['CommandOrControl+Super+Left', 'Ctrl + Win + Left'],
    ['Alt+Shift+F10', 'Alt + Shift + F10'],
  ])('reads %s as %s', (accelerator, label) => {
    expect(formatAccelerator(accelerator)).toBe(label)
  })

  it('returns text that is not an accelerator as it is', () => {
    expect(formatAccelerator('whatever')).toBe('whatever')
  })
})

describe('acceleratorFromKeyPress', () => {
  it('spells a recorded combination from the physical key, not the typed character', () => {
    expect(
      acceleratorFromKeyPress(press('KeyQ', { ctrlKey: true, altKey: true }))
    ).toBe('CommandOrControl+Alt+Q')
    expect(
      acceleratorFromKeyPress(
        press('Digit7', { ctrlKey: true, shiftKey: true })
      )
    ).toBe('CommandOrControl+Shift+7')
    expect(
      acceleratorFromKeyPress(press('Space', { ctrlKey: true, altKey: true }))
    ).toBe(DEFAULT_SHORTCUT)
    expect(
      acceleratorFromKeyPress(press('ArrowUp', { altKey: true, metaKey: true }))
    ).toBe('Alt+Super+Up')
    expect(
      acceleratorFromKeyPress(press('F12', { ctrlKey: true, altKey: true }))
    ).toBe('CommandOrControl+Alt+F12')
  })

  it('says nothing while only a modifier is down', () => {
    for (const code of [
      'ControlLeft',
      'AltRight',
      'ShiftLeft',
      'MetaLeft',
      'OSLeft',
    ])
      expect(
        acceleratorFromKeyPress(press(code, { ctrlKey: true })),
        code
      ).toBeNull()
  })

  it('says nothing for a key a shortcut cannot use', () => {
    for (const code of [
      'Escape',
      'Tab',
      'Enter',
      'Comma',
      'Numpad1',
      'Backquote',
    ])
      expect(
        acceleratorFromKeyPress(press(code, { ctrlKey: true, altKey: true })),
        code
      ).toBeNull()
  })

  it('spells a bare key too, which validation then refuses', () => {
    const bare = acceleratorFromKeyPress(press('KeyA'))

    expect(bare).toBe('A')
    expect(validateAccelerator(bare)).toEqual({
      ok: false,
      problem: 'modifiers',
    })
  })

  it('always spells something validateAccelerator knows how to read', () => {
    const accelerator = acceleratorFromKeyPress(
      press('KeyZ', { ctrlKey: true, altKey: true, shiftKey: true })
    )

    expect(normalizeAccelerator(accelerator)).toBe(
      'CommandOrControl+Alt+Shift+Z'
    )
  })
})
