import { beforeEach, describe, expect, it, vi } from 'vitest'

// data-file imports encryption, which imports electron. This stand-in for safeStorage is reversible
// and can be switched off, like a computer without a usable keychain.
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

import { createDefaultAppData } from '../../shared/default-data'
import type { AppData, PasswordItem } from '../../shared/types'
import {
  InvalidBackupError,
  UnsupportedSchemaError,
  normalizeAppData,
} from '../data-normalize'
import {
  FILE_FORMAT,
  FILE_VERSION,
  PASSWORDS_OMITTED_KEY,
  contentKey,
  hasStoredPasswords,
  parseDataFile,
  serializeDataFile,
  stringifyExport,
} from '../data-file'
import type { PasswordCodec } from '../data-file'
import { DataDecryptError } from '../encryption'

const SECRET_GROUPED = 's3cret-grouped-ONE'
const SECRET_LOOSE = 'l00se-secret-TWO'
const SPACED_NOTE = '  indented\n\ttabbed  \r\n\n'
const SCRIPT = '# 世界\nif x < 2:\n\tprint("<&>")\n\n'

/** A codec whose "key" is a prefix: ciphertext made with one key is garbage to another. */
function createCodec(key = 'enc'): PasswordCodec {
  return {
    encrypt: (plain) => Buffer.from(`${key}:${plain}`).toString('base64'),
    decrypt: (ciphertext) => {
      const text = Buffer.from(ciphertext, 'base64').toString()
      if (!text.startsWith(`${key}:`)) throw new Error('bad')
      return text.slice(key.length + 1)
    },
  }
}

function sampleData(): AppData {
  return normalizeAppData({
    prefs: { lang: 'en', theme: 'light', zoom: 1.2, lastTab: 'passwords' },
    window: {
      bounds: { x: 10, y: 20, w: 800, h: 600 },
      opacity: 0.8,
      alwaysOnTop: true,
      collapsed: false,
      preCollapseHeight: 650,
    },
    notes: [
      {
        id: 'note-group',
        name: 'Notes',
        items: [{ id: 'note-1', name: 'Spaced', content: SPACED_NOTE }],
      },
    ],
    commands: [
      {
        id: 'command-group',
        name: 'Commands',
        items: [
          {
            id: 'command-1',
            name: 'Run',
            content: SCRIPT,
            language: 'python',
            description: 'Usage',
          },
        ],
      },
    ],
    passwords: [
      {
        id: 'password-group',
        name: 'Work',
        items: [
          {
            id: 'pw-grouped',
            name: 'Mail',
            username: 'alice',
            password: SECRET_GROUPED,
            note: 'primary',
          },
        ],
      },
    ],
    loose: {
      passwords: [
        {
          id: 'pw-loose',
          name: 'Bank',
          username: 'bob',
          password: SECRET_LOOSE,
        },
      ],
      websites: [{ id: 'site-1', name: 'Site', url: 'https://example.com' }],
    },
    tasks: {
      '2026-01-05': [
        {
          id: 'task-1',
          name: 'Write tests',
          status: 'doing',
          subtasks: [{ id: 'sub-1', name: 'Unit', status: 'done' }],
        },
      ],
    },
  })
}

function groupedPassword(data: AppData): PasswordItem {
  return data.passwords[0]!.items[0]!
}

function loosePassword(data: AppData): PasswordItem {
  return data.loose.passwords[0]!
}

function withoutWindow(data: AppData): Partial<AppData> {
  const copy: Partial<AppData> = { ...data }
  delete copy.window
  return copy
}

/** The parsed file; typed loosely because the point is to look at raw JSON. */
function readFile(text: string): any {
  return JSON.parse(text)
}

function legacyEnvelope(
  codec: PasswordCodec,
  inner: unknown,
  encrypted = true
): string {
  const payload = JSON.stringify(inner)
  return JSON.stringify({
    version: 1,
    encrypted,
    payload: encrypted ? codec.encrypt(payload) : payload,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  keychain.available = true
})

describe('serializeDataFile', () => {
  const codec = createCodec()

  it('writes plain JSON in the quicklaunch-data format, version 2, around the data', () => {
    const text = serializeDataFile(sampleData(), codec)
    const file = readFile(text)

    expect(FILE_FORMAT).toBe('quicklaunch-data')
    expect(FILE_VERSION).toBe(2)
    expect(file.format).toBe('quicklaunch-data')
    expect(file.version).toBe(2)
    expect(file.data).toEqual(expect.objectContaining({ schemaVersion: 2 }))
    expect(Object.keys(file).sort()).toEqual(['data', 'format', 'version'])
    expect(text).toContain('\n  "format": "quicklaunch-data"')
  })

  it('does not write the window position', () => {
    const file = readFile(serializeDataFile(sampleData(), codec))

    expect('window' in file.data).toBe(false)
    expect(JSON.stringify(file)).not.toContain('"window"')
    expect(JSON.stringify(file)).not.toContain('alwaysOnTop')
  })

  it('stores each password as ciphertext, in groups and loose, with no plaintext field', () => {
    const file = readFile(serializeDataFile(sampleData(), codec))

    const grouped = file.data.passwords[0].items[0]
    const loose = file.data.loose.passwords[0]
    expect(grouped.passwordCiphertext).toBe(codec.encrypt(SECRET_GROUPED))
    expect(loose.passwordCiphertext).toBe(codec.encrypt(SECRET_LOOSE))
    for (const item of [grouped, loose]) {
      expect(item).not.toHaveProperty('password')
      expect(item).not.toHaveProperty('passwordLost')
    }
    // Everything else about the password item is still there.
    expect(grouped).toMatchObject({
      id: 'pw-grouped',
      kind: 'password',
      name: 'Mail',
      username: 'alice',
      note: 'primary',
    })
  })

  it('never lets a plaintext password appear anywhere in the text', () => {
    const text = serializeDataFile(sampleData(), codec)

    expect(text).not.toContain(SECRET_GROUPED)
    expect(text).not.toContain(SECRET_LOOSE)
    expect(text).not.toContain(Buffer.from(SECRET_GROUPED).toString('base64'))
  })

  it('keeps everything that is not a password readable and exact', () => {
    const data = sampleData()
    const text = serializeDataFile(data, codec)
    const file = readFile(text)

    expect(file.data.notes[0].items[0].content).toBe(SPACED_NOTE)
    expect(file.data.commands[0].items[0].content).toBe(SCRIPT)
    expect(file.data.commands[0].items[0].language).toBe('python')
    expect(file.data.prefs).toEqual(data.prefs)
    expect(file.data.tasks).toEqual(data.tasks)
    expect(file.data.loose.websites).toEqual(data.loose.websites)
    expect(file.data.topOrder).toEqual(data.topOrder)
    expect(text).toContain('"name": "Spaced"')
  })

  it('writes neither field for an empty password without a preserved ciphertext', () => {
    const data = sampleData()
    groupedPassword(data).password = ''
    loosePassword(data).password = ''
    groupedPassword(data).passwordLost = true

    const file = readFile(serializeDataFile(data, codec))

    for (const item of [
      file.data.passwords[0].items[0],
      file.data.loose.passwords[0],
    ]) {
      expect(item).not.toHaveProperty('password')
      expect(item).not.toHaveProperty('passwordCiphertext')
      expect(item).not.toHaveProperty('passwordLost')
    }
  })

  it('writes a preserved ciphertext back exactly for an empty password', () => {
    const data = sampleData()
    groupedPassword(data).password = ''
    loosePassword(data).password = ''
    const preserved = new Map([
      ['pw-grouped', 'LOCKED-GROUPED=='],
      ['pw-loose', 'LOCKED-LOOSE=='],
      ['unrelated-id', 'NOT-USED=='],
    ])

    const text = serializeDataFile(data, codec, preserved)
    const file = readFile(text)

    expect(file.data.passwords[0].items[0].passwordCiphertext).toBe(
      'LOCKED-GROUPED=='
    )
    expect(file.data.loose.passwords[0].passwordCiphertext).toBe(
      'LOCKED-LOOSE=='
    )
    expect(file.data.passwords[0].items[0]).not.toHaveProperty('password')
    expect(text).not.toContain('NOT-USED==')
  })

  it('does not use a preserved ciphertext once the user has typed a new password', () => {
    const data = sampleData()
    groupedPassword(data).password = 'brand-new'

    const file = readFile(
      serializeDataFile(data, codec, new Map([['pw-grouped', 'OLD-LOCKED==']]))
    )

    expect(file.data.passwords[0].items[0].passwordCiphertext).toBe(
      codec.encrypt('brand-new')
    )
    expect(JSON.stringify(file)).not.toContain('OLD-LOCKED==')
  })

  it('only asks the codec to encrypt passwords that are not empty', () => {
    const data = sampleData()
    loosePassword(data).password = ''
    const encrypt = vi.fn(codec.encrypt)

    serializeDataFile(data, { encrypt, decrypt: codec.decrypt })

    expect(encrypt).toHaveBeenCalledTimes(1)
    expect(encrypt).toHaveBeenCalledWith(SECRET_GROUPED)
  })

  it('falls back to a plain password field when encryption is unavailable', () => {
    const data = sampleData()
    loosePassword(data).password = ''
    const unavailable: PasswordCodec = {
      encrypt: () => null,
      decrypt: codec.decrypt,
    }

    const file = readFile(serializeDataFile(data, unavailable))

    const grouped = file.data.passwords[0].items[0]
    expect(grouped.password).toBe(SECRET_GROUPED)
    expect(grouped).not.toHaveProperty('passwordCiphertext')
    expect(file.data.loose.passwords[0]).not.toHaveProperty('password')
    expect(file.data.loose.passwords[0]).not.toHaveProperty(
      'passwordCiphertext'
    )
  })

  it('does not modify the data it is given', () => {
    const data = sampleData()
    const before = structuredClone(data)

    serializeDataFile(data, codec, new Map([['pw-grouped', 'x']]))

    expect(data).toEqual(before)
    expect(groupedPassword(data).password).toBe(SECRET_GROUPED)
    expect(data.window.bounds).toEqual({ x: 10, y: 20, w: 800, h: 600 })
  })

  it('handles data without any passwords', () => {
    const data = createDefaultAppData()

    const file = readFile(serializeDataFile(data, codec))

    expect(file.data.passwords[0].items).toEqual([])
    expect(file.data.loose.passwords).toEqual([])
  })

  it('uses the system codec (safeStorage) by default', () => {
    const file = readFile(serializeDataFile(sampleData()))

    expect(file.data.passwords[0].items[0].passwordCiphertext).toBe(
      Buffer.from(`enc:${SECRET_GROUPED}`).toString('base64')
    )
    expect(safeStorage.encryptString).toHaveBeenCalledTimes(2)
  })

  it('writes plain passwords by default when the system has no encryption', () => {
    keychain.available = false

    const file = readFile(serializeDataFile(sampleData()))

    expect(file.data.passwords[0].items[0].password).toBe(SECRET_GROUPED)
    expect(file.data.loose.passwords[0].password).toBe(SECRET_LOOSE)
  })
})

describe('parseDataFile', () => {
  const codec = createCodec()

  describe('files written by serializeDataFile', () => {
    it('round-trips everything except the window position', () => {
      const data = sampleData()

      const parsed = parseDataFile(serializeDataFile(data, codec), { codec })

      expect(withoutWindow(parsed.data)).toEqual(withoutWindow(data))
      expect(parsed.format).toBe('file')
      expect(parsed.lostPasswords.size).toBe(0)
      expect(parsed.hadWindowState).toBe(false)
    })

    it('decrypts passwords back to what the user typed, grouped and loose', () => {
      const parsed = parseDataFile(serializeDataFile(sampleData(), codec), {
        codec,
      })

      expect(groupedPassword(parsed.data).password).toBe(SECRET_GROUPED)
      expect(loosePassword(parsed.data).password).toBe(SECRET_LOOSE)
    })

    it('hands back default window state because the file has none', () => {
      const parsed = parseDataFile(serializeDataFile(sampleData(), codec), {
        codec,
      })

      expect(parsed.data.window.bounds).toBeUndefined()
      expect(parsed.data.window.alwaysOnTop).toBe(false)
    })

    it('round-trips default data', () => {
      const data = createDefaultAppData()

      const parsed = parseDataFile(serializeDataFile(data, codec), { codec })

      expect(parsed.data).toEqual(data)
    })

    it('keeps text with exact whitespace and non-ASCII characters', () => {
      const parsed = parseDataFile(serializeDataFile(sampleData(), codec), {
        codec,
      })

      expect(parsed.data.notes[0]?.items[0]?.content).toBe(SPACED_NOTE)
      expect(parsed.data.commands[0]?.items[0]?.content).toBe(SCRIPT)
    })

    it('reads a file with plain password fields written when encryption was unavailable', () => {
      const unavailable: PasswordCodec = {
        encrypt: () => null,
        decrypt: codec.decrypt,
      }
      const text = serializeDataFile(sampleData(), unavailable)
      const decrypt = vi.fn(codec.decrypt)

      const parsed = parseDataFile(text, { codec: { ...codec, decrypt } })

      expect(groupedPassword(parsed.data).password).toBe(SECRET_GROUPED)
      expect(loosePassword(parsed.data).password).toBe(SECRET_LOOSE)
      expect(decrypt).not.toHaveBeenCalled()
      expect(parsed.lostPasswords.size).toBe(0)
    })

    it('reports window state when the file still carries it', () => {
      const text = JSON.stringify({
        format: 'quicklaunch-data',
        version: 2,
        data: {
          schemaVersion: 2,
          prefs: {},
          tasks: {},
          window: { x: 1, y: 2, width: 3, height: 4 },
        },
      })

      const parsed = parseDataFile(text, { codec })

      expect(parsed.format).toBe('file')
      expect(parsed.hadWindowState).toBe(true)
      expect(parsed.data.window.bounds).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    })

    it.each([[1], [2]])('accepts file format version %s', (version) => {
      const text = JSON.stringify({
        format: 'quicklaunch-data',
        version,
        data: { schemaVersion: 2, prefs: {}, tasks: {} },
      })

      expect(parseDataFile(text, { codec }).format).toBe('file')
    })

    it('uses the system codec (safeStorage) by default', () => {
      const text = serializeDataFile(sampleData())

      const parsed = parseDataFile(text)

      expect(groupedPassword(parsed.data).password).toBe(SECRET_GROUPED)
      expect(parsed.lostPasswords.size).toBe(0)
    })
  })

  describe('passwords that cannot be decrypted here', () => {
    it('are empty in the data and listed with their raw ciphertext', () => {
      const text = serializeDataFile(sampleData(), createCodec('key-A'))
      const file = readFile(text)

      const parsed = parseDataFile(text, { codec: createCodec('key-B') })

      expect(groupedPassword(parsed.data).password).toBe('')
      expect(loosePassword(parsed.data).password).toBe('')
      expect(parsed.lostPasswords).toEqual(
        new Map([
          [
            'pw-grouped',
            file.data.passwords[0].items[0].passwordCiphertext as string,
          ],
          [
            'pw-loose',
            file.data.loose.passwords[0].passwordCiphertext as string,
          ],
        ])
      )
      expect(parsed.format).toBe('file')
    })

    it('do not stop the rest of the data from loading', () => {
      const data = sampleData()
      const text = serializeDataFile(data, createCodec('key-A'))

      const parsed = parseDataFile(text, { codec: createCodec('key-B') })

      expect(parsed.data.notes).toEqual(data.notes)
      expect(parsed.data.tasks).toEqual(data.tasks)
      expect(parsed.data.prefs).toEqual(data.prefs)
      expect(groupedPassword(parsed.data)).toMatchObject({
        id: 'pw-grouped',
        name: 'Mail',
        username: 'alice',
        note: 'primary',
      })
    })

    it('only lists the lost ones when other passwords are fine', () => {
      const good = createCodec('key-A')
      const data = sampleData()
      const text = serializeDataFile(data, good)
      const lostCiphertext = readFile(text).data.loose.passwords[0]
        .passwordCiphertext as string
      const picky: PasswordCodec = {
        encrypt: good.encrypt,
        decrypt: (ciphertext) => {
          if (ciphertext === lostCiphertext) throw new Error('lost')
          return good.decrypt(ciphertext)
        },
      }

      const parsed = parseDataFile(text, { codec: picky })

      expect(groupedPassword(parsed.data).password).toBe(SECRET_GROUPED)
      expect(loosePassword(parsed.data).password).toBe('')
      expect([...parsed.lostPasswords.keys()]).toEqual(['pw-loose'])
    })

    it('come back after a save that preserves the ciphertext, once the key is back', () => {
      const keyA = createCodec('key-A')
      const keyB = createCodec('key-B')
      const original = serializeDataFile(sampleData(), keyA)

      // Opened on a computer with another key; the app saves again.
      const opened = parseDataFile(original, { codec: keyB })
      const resaved = serializeDataFile(opened.data, keyB, opened.lostPasswords)

      expect(resaved).not.toContain(SECRET_GROUPED)
      // Back on the first computer: the passwords are readable again.
      const reopened = parseDataFile(resaved, { codec: keyA })
      expect(groupedPassword(reopened.data).password).toBe(SECRET_GROUPED)
      expect(loosePassword(reopened.data).password).toBe(SECRET_LOOSE)
      expect(reopened.lostPasswords.size).toBe(0)
    })

    it('are all lost when the system cannot decrypt, which is how a moved file looks', () => {
      const text = serializeDataFile(sampleData())
      keychain.available = false

      const parsed = parseDataFile(text)

      expect(groupedPassword(parsed.data).password).toBe('')
      expect(parsed.lostPasswords.size).toBe(2)
      expect(parsed.data.notes[0]?.items[0]?.content).toBe(SPACED_NOTE)
    })
  })

  describe('plain exported JSON', () => {
    it('is recognised as plain, keeps the window and plaintext passwords', () => {
      const data = sampleData()
      const decrypt = vi.fn(codec.decrypt)

      const parsed = parseDataFile(JSON.stringify(data), {
        codec: { ...codec, decrypt },
      })

      expect(parsed.format).toBe('plain')
      expect(parsed.hadWindowState).toBe(true)
      expect(parsed.data).toEqual(data)
      expect(decrypt).not.toHaveBeenCalled()
      expect(parsed.lostPasswords.size).toBe(0)
    })

    it('reads files written by the old app as { version: 1, data }', () => {
      const data = sampleData()

      const parsed = parseDataFile(JSON.stringify({ version: 1, data }), {
        codec,
      })

      expect(parsed.data).toEqual(data)
      expect(parsed.format).toBe('plain')
      expect(parsed.hadWindowState).toBe(true)
    })

    it('reports no window state for exports without one', () => {
      const data = sampleData()
      const text = JSON.stringify(withoutWindow(data))

      const parsed = parseDataFile(text, { codec })

      expect(parsed.hadWindowState).toBe(false)
      expect(parsed.format).toBe('plain')
    })

    it('repairs damaged values inside otherwise valid data instead of failing', () => {
      const parsed = parseDataFile(
        JSON.stringify({
          schemaVersion: 2,
          prefs: { lang: 'fr', zoom: 99 },
          folders: [null],
          loose: { notes: [null] },
          tasks: { d: [{ status: 'finished' }] },
        }),
        { codec }
      )

      expect(parsed.data.prefs.lang).toBe('zh')
      expect(parsed.data.prefs.zoom).toBe(1.4)
      expect(parsed.data.folders).toHaveLength(1)
      expect(parsed.data.loose.notes).toHaveLength(1)
      expect(parsed.data.tasks.d?.[0]?.status).toBe('todo')
    })
  })

  describe('the 2.5.8 encrypted envelope', () => {
    it('is decrypted, parsed and flagged as legacy-envelope', () => {
      const data = sampleData()
      const decrypt = vi.fn(codec.decrypt)
      const text = legacyEnvelope(codec, data)
      const payload = readFile(text).payload as string

      const parsed = parseDataFile(text, { codec: { ...codec, decrypt } })

      expect(decrypt).toHaveBeenCalledTimes(1)
      expect(decrypt).toHaveBeenCalledWith(payload)
      expect(parsed.format).toBe('legacy-envelope')
      expect(parsed.data).toEqual(data)
      expect(parsed.hadWindowState).toBe(true)
      expect(parsed.lostPasswords.size).toBe(0)
    })

    it('also unwraps { version, data } inside the payload', () => {
      const data = sampleData()

      const parsed = parseDataFile(
        legacyEnvelope(codec, { version: 1, data }),
        { codec }
      )

      expect(parsed.format).toBe('legacy-envelope')
      expect(parsed.data).toEqual(data)
    })

    it('reads an envelope that says encrypted: false without calling the codec', () => {
      const data = sampleData()
      const decrypt = vi.fn(codec.decrypt)

      const parsed = parseDataFile(legacyEnvelope(codec, data, false), {
        codec: { ...codec, decrypt },
      })

      expect(decrypt).not.toHaveBeenCalled()
      expect(parsed.format).toBe('legacy-envelope')
      expect(parsed.data).toEqual(data)
    })

    it('lets the decrypt error through when this computer cannot decrypt it', () => {
      const failure = new DataDecryptError()
      const stuck: PasswordCodec = {
        encrypt: codec.encrypt,
        decrypt: () => {
          throw failure
        },
      }

      let thrown: unknown
      try {
        parseDataFile(legacyEnvelope(codec, sampleData()), { codec: stuck })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBe(failure)
      expect(thrown).toBeInstanceOf(DataDecryptError)
    })

    it('fails with SyntaxError when the decrypted payload is not JSON', () => {
      const text = JSON.stringify({
        version: 1,
        encrypted: true,
        payload: codec.encrypt('{broken'),
      })

      expect(() => parseDataFile(text, { codec })).toThrow(SyntaxError)
    })

    it('still checks that the decrypted payload is Marubako data', () => {
      expect(() =>
        parseDataFile(legacyEnvelope(codec, { name: 'x', version: '1.0.0' }), {
          codec,
        })
      ).toThrow(InvalidBackupError)
    })

    it('passes the system codec through safeStorage by default', () => {
      const data = sampleData()
      const payload = Buffer.from(`enc:${JSON.stringify(data)}`).toString(
        'base64'
      )
      const text = JSON.stringify({ version: 1, encrypted: true, payload })

      expect(parseDataFile(text).data).toEqual(data)
    })

    it('raises DataDecryptError by default when the system cannot decrypt', () => {
      const text = JSON.stringify({
        version: 1,
        encrypted: true,
        payload: Buffer.from('enc:{}').toString('base64'),
      })
      keychain.available = false

      expect(() => parseDataFile(text)).toThrow(DataDecryptError)
    })
  })

  describe('invalid input', () => {
    it.each([
      ['an empty string', ''],
      ['broken JSON', '{broken'],
      ['truncated JSON', '{"format":"quicklaunch-data","version":2,"da'],
      ['whitespace', '   '],
    ])('throws SyntaxError for %s', (_label, text) => {
      expect(() => parseDataFile(text, { codec })).toThrow(SyntaxError)
    })

    it.each([3, 4, 99])(
      'throws UnsupportedSchemaError for file format version %s',
      (version) => {
        const text = JSON.stringify({
          format: 'quicklaunch-data',
          version,
          data: { schemaVersion: 2, prefs: {} },
        })

        try {
          parseDataFile(text, { codec })
          expect.unreachable('should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedSchemaError)
          expect((error as UnsupportedSchemaError).version).toBe(version)
        }
      }
    )

    it('throws UnsupportedSchemaError for a newer data.schemaVersion, in any format', () => {
      const inner = { schemaVersion: 3, folders: [] }
      const variants = [
        JSON.stringify(inner),
        JSON.stringify({ version: 1, data: inner }),
        JSON.stringify({ format: 'quicklaunch-data', version: 2, data: inner }),
        legacyEnvelope(codec, inner),
      ]

      for (const text of variants) {
        try {
          parseDataFile(text, { codec })
          expect.unreachable('should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedSchemaError)
          expect((error as UnsupportedSchemaError).version).toBe(3)
        }
      }
    })

    it('checks the schema version before it checks the file looks like data', () => {
      // A newer file must say "too new", not "not a Marubako file".
      const text = JSON.stringify({
        format: 'quicklaunch-data',
        version: 3,
        data: {},
      })

      expect(() => parseDataFile(text, { codec })).toThrow(
        UnsupportedSchemaError
      )
    })

    it.each([
      ['an empty array', '[]'],
      ['an empty object', '{}'],
      ['a package.json', '{"name":"x","version":"1.0.0","dependencies":{}}'],
      ['null', 'null'],
      ['a string', '"hello"'],
      ['a number', '5'],
      ['an array of data', '[{"schemaVersion":2}]'],
      ['a wrapper around something else', '{"version":1,"data":{"name":"x"}}'],
      ['a malformed collection', '{"schemaVersion":2,"folders":{}}'],
      ['a malformed prefs', '{"prefs":[]}'],
      [
        'a file-format wrapper around a malformed collection',
        '{"format":"quicklaunch-data","version":2,"data":{"folders":{}}}',
      ],
    ])('rejects %s with InvalidBackupError by default', (_label, text) => {
      try {
        parseDataFile(text, { codec })
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidBackupError)
        expect((error as Error).name).toBe('InvalidBackupError')
      }
    })

    it('accepts everything that is JSON when strict is false, returning default-shaped data', () => {
      const parsed = parseDataFile('{}', { codec, strict: false })

      expect(parsed.data.schemaVersion).toBe(2)
      expect(parsed.data.prefs).toEqual(createDefaultAppData().prefs)
      expect(parsed.data.folders).toEqual([])
      expect(parsed.data.loose.passwords).toEqual([])
      expect(parsed.format).toBe('plain')
      expect(parsed.hadWindowState).toBe(false)
    })

    it.each(['[]', 'null', '"x"', '5', '{"name":"x","version":"1.0.0"}'])(
      'returns usable data for %s when strict is false',
      (text) => {
        const parsed = parseDataFile(text, { codec, strict: false })

        expect(parsed.data.schemaVersion).toBe(2)
        expect(parsed.data.prefs).toEqual(createDefaultAppData().prefs)
      }
    )

    it('is strict unless told otherwise', () => {
      expect(() => parseDataFile('{}')).toThrow(InvalidBackupError)
      expect(() => parseDataFile('{}', {})).toThrow(InvalidBackupError)
      expect(() => parseDataFile('{}', { strict: true })).toThrow(
        InvalidBackupError
      )
    })

    it('still rejects broken JSON and newer versions when strict is false', () => {
      expect(() => parseDataFile('{broken', { codec, strict: false })).toThrow(
        SyntaxError
      )
      expect(() =>
        parseDataFile('{"schemaVersion":3}', { codec, strict: false })
      ).toThrow(UnsupportedSchemaError)
    })
  })
})

describe('contentKey', () => {
  it('is the same for data that differs only in the window position', () => {
    const first = sampleData()
    const second = sampleData()
    second.window = {
      bounds: undefined,
      opacity: 0.3,
      alwaysOnTop: false,
      collapsed: true,
      preCollapseHeight: 500,
      dockEdge: 'left',
    }

    expect(contentKey(first)).toBe(contentKey(second))
  })

  it('is the same for a deep copy', () => {
    const data = sampleData()

    expect(contentKey(structuredClone(data))).toBe(contentKey(data))
    expect(contentKey(data)).toBe(contentKey(data))
  })

  it('does not change the data it is given', () => {
    const data = sampleData()

    contentKey(data)

    expect(data.window.bounds).toEqual({ x: 10, y: 20, w: 800, h: 600 })
  })

  it('is a string and does not contain the window position', () => {
    const key = contentKey(sampleData())

    expect(typeof key).toBe('string')
    expect(key).not.toContain('alwaysOnTop')
  })

  it.each<[string, (data: AppData) => void]>([
    [
      'a group name',
      (data) => {
        data.notes[0]!.name = 'Renamed'
      },
    ],
    [
      'whitespace in a note',
      (data) => {
        data.notes[0]!.items[0]!.content += ' '
      },
    ],
    [
      'a collapsed group',
      (data) => {
        data.notes[0]!.open = false
      },
    ],
    [
      'a preference',
      (data) => {
        data.prefs.zoom = 1.3
      },
    ],
    [
      'a task status',
      (data) => {
        data.tasks['2026-01-05']![0]!.status = 'done'
      },
    ],
    [
      'a new task day',
      (data) => {
        data.tasks['2026-02-01'] = []
      },
    ],
    [
      'a new loose item',
      (data) => {
        data.loose.websites.push({
          id: 'site-2',
          kind: 'website',
          name: 'More',
          icon: '🌐',
          url: 'https://more.test',
        })
      },
    ],
    [
      'the top order',
      (data) => {
        data.topOrder.notes = []
      },
    ],
    [
      'a grouped password',
      (data) => {
        groupedPassword(data).password = 'changed'
      },
    ],
    [
      'a loose password',
      (data) => {
        loosePassword(data).password = 'changed'
      },
    ],
    [
      'a password emptied',
      (data) => {
        loosePassword(data).password = ''
      },
    ],
    [
      'a username',
      (data) => {
        groupedPassword(data).username = 'carol'
      },
    ],
  ])('changes when %s changes', (_label, mutate) => {
    const before = sampleData()
    const after = sampleData()
    mutate(after)

    expect(contentKey(after)).not.toBe(contentKey(before))
  })
})

describe('parseDataFile with a byte order mark', () => {
  const BOM = String.fromCharCode(0xfeff)
  const codec = createCodec()

  it('reads a file that an editor saved as UTF-8 with a BOM', () => {
    const text = serializeDataFile(sampleData(), codec)

    const parsed = parseDataFile(BOM + text, { codec })

    expect(parsed.format).toBe('file')
    expect(groupedPassword(parsed.data).password).toBe(SECRET_GROUPED)
  })

  it('reads a plain export and a legacy envelope with a BOM too', () => {
    const data = sampleData()
    expect(parseDataFile(BOM + JSON.stringify(data), { codec }).format).toBe(
      'plain'
    )

    expect(
      parseDataFile(BOM + legacyEnvelope(codec, data), { codec }).format
    ).toBe('legacy-envelope')
  })

  it('still rejects text that is not JSON after the BOM', () => {
    expect(() => parseDataFile(BOM + '{broken', { codec })).toThrow(SyntaxError)
  })
})

describe('exporting without passwords (data-security-7)', () => {
  const codec = createCodec()

  it('writes every password in plain text when they are included, with no marker', () => {
    const text = stringifyExport(sampleData(), true)

    expect(text).toContain(SECRET_GROUPED)
    expect(text).toContain(SECRET_LOOSE)
    expect(JSON.parse(text)).not.toHaveProperty(PASSWORDS_OMITTED_KEY)
  })

  it('blanks every password, grouped and loose, and says so in the file', () => {
    const text = stringifyExport(sampleData(), false)

    expect(text).not.toContain(SECRET_GROUPED)
    expect(text).not.toContain(SECRET_LOOSE)
    const written = JSON.parse(text)
    expect(written[PASSWORDS_OMITTED_KEY]).toBe(true)
    expect(written.passwords[0].items[0].password).toBe('')
    expect(written.loose.passwords[0].password).toBe('')
    // Everything else is as it was: the usernames and notes are what the user wants to keep.
    expect(written.passwords[0].items[0].username).toBe(
      groupedPassword(sampleData()).username
    )
  })

  it('does not change the data it was given', () => {
    const data = sampleData()
    stringifyExport(data, false)

    expect(groupedPassword(data).password).toBe(SECRET_GROUPED)
  })

  it('is recognised when the file is read back, and only then', () => {
    const without = parseDataFile(stringifyExport(sampleData(), false), {
      codec,
    })
    const withPasswords = parseDataFile(stringifyExport(sampleData(), true), {
      codec,
    })

    expect(without.passwordsOmitted).toBe(true)
    expect(groupedPassword(without.data).password).toBe('')
    expect(withPasswords.passwordsOmitted).toBe(false)
    expect(groupedPassword(withPasswords.data).password).toBe(SECRET_GROUPED)
    // The app's own data file never carries the marker.
    expect(
      parseDataFile(serializeDataFile(sampleData(), codec), { codec })
        .passwordsOmitted
    ).toBe(false)
  })

  it('does not take any other value of the marker for the real thing', () => {
    for (const value of ['true', 1, null, false]) {
      const source = { ...sampleData(), [PASSWORDS_OMITTED_KEY]: value }

      expect(
        parseDataFile(JSON.stringify(source), { codec }).passwordsOmitted,
        String(value)
      ).toBe(false)
    }
  })

  it('reports whether there is anything to protect', () => {
    expect(hasStoredPasswords(sampleData())).toBe(true)

    const grouped = sampleData()
    groupedPassword(grouped).password = ''
    expect(hasStoredPasswords(grouped)).toBe(true) // the loose one is still there

    const none = sampleData()
    groupedPassword(none).password = ''
    none.loose.passwords.forEach((item) => (item.password = ''))
    expect(hasStoredPasswords(none)).toBe(false)
    expect(hasStoredPasswords(createDefaultAppData())).toBe(false)
  })
})
