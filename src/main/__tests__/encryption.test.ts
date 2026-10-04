import { beforeEach, describe, expect, it, vi } from 'vitest'

// A reversible stand-in for Electron's safeStorage: "encryption" is a prefix, and anything that
// does not carry the prefix is treated as ciphertext from another key.
const { safeStorage, keychain } = vi.hoisted(() => {
  const keychain = { available: true }
  return {
    keychain,
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => keychain.available),
      encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`)),
      decryptString: vi.fn((buffer: Buffer) => {
        const text = buffer.toString()
        if (!text.startsWith('enc:')) throw new Error('wrong key')
        return text.slice(4)
      }),
    },
  }
})

vi.mock('electron', () => ({
  safeStorage,
}))

import {
  DataDecryptError,
  decryptString,
  encryptString,
  isLegacyEnvelope,
} from '../encryption'

describe('encryptString', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keychain.available = true
  })

  it('returns null, and never calls safeStorage.encryptString, when encryption is unavailable', () => {
    keychain.available = false

    expect(encryptString('secret')).toBeNull()
    expect(safeStorage.encryptString).not.toHaveBeenCalled()
  })

  it('returns the base64 form of the ciphertext', () => {
    const result = encryptString('secret')

    expect(safeStorage.encryptString).toHaveBeenCalledWith('secret')
    expect(result).toBe(Buffer.from('enc:secret').toString('base64'))
  })

  it('does not leak the plaintext into the returned string', () => {
    expect(encryptString('hunter2-hunter2')).not.toContain('hunter2')
  })

  it('encrypts the empty string like any other value', () => {
    expect(encryptString('')).toBe(Buffer.from('enc:').toString('base64'))
  })
})

describe('decryptString', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keychain.available = true
  })

  it('round-trips what encryptString produced, including non-ASCII text', () => {
    for (const value of [
      'secret',
      '',
      'pässwörd 密码 🔑',
      '  spaced\n\ttext  ',
    ]) {
      const ciphertext = encryptString(value)
      expect(ciphertext).not.toBeNull()
      expect(decryptString(ciphertext as string)).toBe(value)
    }
  })

  it('passes the decoded bytes to safeStorage', () => {
    const ciphertext = Buffer.from('enc:abc').toString('base64')

    decryptString(ciphertext)

    const argument = safeStorage.decryptString.mock.calls[0]?.[0]
    expect(Buffer.isBuffer(argument)).toBe(true)
    expect(argument?.toString()).toBe('enc:abc')
  })

  it('throws DataDecryptError for ciphertext made with another key', () => {
    const foreign = Buffer.from('other-key:secret').toString('base64')

    const attempt = (): string => decryptString(foreign)

    expect(attempt).toThrow(DataDecryptError)
    try {
      attempt()
    } catch (error) {
      expect(error).toBeInstanceOf(DataDecryptError)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe('DataDecryptError')
    }
  })

  it('throws DataDecryptError for garbage that is not even base64', () => {
    expect(() => decryptString('!!! not base64 !!!')).toThrow(DataDecryptError)
    expect(() => decryptString('')).toThrow(DataDecryptError)
  })

  it('throws DataDecryptError when encryption is unavailable, without calling safeStorage', () => {
    const ciphertext = Buffer.from('enc:secret').toString('base64')
    keychain.available = false

    try {
      decryptString(ciphertext)
      expect.unreachable('decryptString should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DataDecryptError)
      expect((error as Error).name).toBe('DataDecryptError')
    }
    expect(safeStorage.decryptString).not.toHaveBeenCalled()
  })

  it('does not expose the underlying safeStorage error text', () => {
    const foreign = Buffer.from('other-key:secret').toString('base64')

    expect(() => decryptString(foreign)).toThrow(
      'Stored data cannot be decrypted on this computer'
    )
  })
})

describe('DataDecryptError', () => {
  it('has a default message and can carry a custom one', () => {
    expect(new DataDecryptError().message).toMatch(/cannot be decrypted/)
    expect(new DataDecryptError('custom').message).toBe('custom')
    expect(new DataDecryptError().name).toBe('DataDecryptError')
  })
})

describe('isLegacyEnvelope', () => {
  it('accepts the 2.5.8 envelope shape', () => {
    expect(
      isLegacyEnvelope({ version: 1, encrypted: true, payload: 'x' })
    ).toBe(true)
    expect(
      isLegacyEnvelope({ version: 1, encrypted: false, payload: '{"a":1}' })
    ).toBe(true)
  })

  it('accepts an empty payload string', () => {
    expect(isLegacyEnvelope({ version: 1, encrypted: true, payload: '' })).toBe(
      true
    )
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 5],
    ['a boolean', true],
    ['an array', []],
    ['an array of envelope-like objects', [{ version: 1, encrypted: true }]],
    ['an empty object', {}],
    ['a missing payload', { version: 1, encrypted: true }],
    ['a missing version', { encrypted: true, payload: 'x' }],
    ['a missing encrypted flag', { version: 1, payload: 'x' }],
    ['a numeric payload', { version: 1, encrypted: true, payload: 5 }],
    ['a null payload', { version: 1, encrypted: true, payload: null }],
    ['an object payload', { version: 1, encrypted: true, payload: { a: 1 } }],
    [
      'a data file in the current format',
      { format: 'quicklaunch-data', version: 2, data: {} },
    ],
    ['plain app data', { schemaVersion: 2, prefs: {}, folders: [] }],
  ])('rejects %s', (_label, value) => {
    expect(isLegacyEnvelope(value)).toBe(false)
  })
})
