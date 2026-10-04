import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    exe: '',
    getPath: (name: string): string => {
      if (name !== 'exe') throw new Error(`unexpected path: ${name}`)
      return mocks.app.exe
    },
  },
}))

vi.mock('electron', () => ({ app: mocks.app }))

import {
  getPortableDataDir,
  guardPortableKey,
  isPortable,
  resetPortableForTests,
} from '../portable'
import {
  KEY_FILENAME,
  KEY_OWNER_FILENAME,
  PortableKeyError,
} from '../portable-key'
import {
  PORTABLE_MARKER_FILENAME,
  UNINSTALLER_FILENAME,
} from '../user-data-path'

let folder: string
let dataDir: string
const markAsPortable = (): void =>
  fs.writeFileSync(path.join(folder, PORTABLE_MARKER_FILENAME), 'read me')

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'marubako-portable-test-'))
  dataDir = path.join(folder, 'data')
  mocks.app.isPackaged = true
  mocks.app.exe = path.join(folder, 'Marubako.exe')
  resetPortableForTests()
})
afterEach(() => {
  fs.rmSync(folder, { recursive: true, force: true })
})

describe('a portable copy', () => {
  it('is a packaged program with the marker file beside it', () => {
    markAsPortable()

    expect(getPortableDataDir()).toBe(dataDir)
    expect(isPortable()).toBe(true)
  })

  it('is not one without that file, data folder or not', () => {
    fs.mkdirSync(dataDir)

    expect(getPortableDataDir()).toBeNull()
    expect(isPortable()).toBe(false)
  })

  it('is not one where the installer put the program', () => {
    markAsPortable()
    fs.writeFileSync(path.join(folder, UNINSTALLER_FILENAME), '')

    expect(isPortable()).toBe(false)
  })

  it('is not one when the program runs from source', () => {
    markAsPortable()
    mocks.app.isPackaged = false

    expect(isPortable()).toBe(false)
  })

  it('is decided once: a marker made while the program runs changes nothing', () => {
    expect(isPortable()).toBe(false)
    markAsPortable()

    expect(isPortable()).toBe(false)
  })
})

describe('guardPortableKey', () => {
  const owner = (): { host: string; disk: string } =>
    JSON.parse(
      fs.readFileSync(path.join(dataDir, KEY_OWNER_FILENAME), 'utf8')
    ) as { host: string; disk: string }
  const there = { host: '0123456789abcdef', disk: 'fedcba9876543210' }

  // The zip carries no data folder, so that unpacking a new version over an old one leaves the
  // data alone.
  it('makes the data folder and records this PC as the owner of its key', () => {
    markAsPortable()

    expect(guardPortableKey(dataDir)).toBe('claimed')
    expect(owner().host).toMatch(/^[0-9a-f]{16}$/)
    expect(owner().disk).toMatch(/^[0-9a-f]{16}$/)
    expect(guardPortableKey(dataDir)).toBe('unchanged')
  })

  it('keeps the key of another PC before Chromium can replace it', () => {
    markAsPortable()
    fs.mkdirSync(dataDir)
    const state = JSON.stringify({ os_crypt: { encrypted_key: 'of there' } })
    fs.writeFileSync(path.join(dataDir, KEY_FILENAME), state)
    fs.writeFileSync(
      path.join(dataDir, KEY_OWNER_FILENAME),
      JSON.stringify(there)
    )

    expect(guardPortableKey(dataDir)).toBe('set-aside')
    expect(
      fs.readFileSync(
        path.join(dataDir, `${KEY_FILENAME}.${there.host}-${there.disk}`),
        'utf8'
      )
    ).toBe(state)
    expect(fs.existsSync(path.join(dataDir, KEY_FILENAME))).toBe(false)
  })

  // QUICKLAUNCH_USER_DATA wins over the data folder: then that folder is not in use.
  it('does nothing when the program runs on another folder', () => {
    markAsPortable()
    const elsewhere = path.join(folder, 'elsewhere')
    fs.mkdirSync(elsewhere)

    expect(guardPortableKey(elsewhere)).toBeNull()
    expect(guardPortableKey(undefined)).toBeNull()
    expect(fs.existsSync(dataDir)).toBe(false)
    expect(fs.readdirSync(elsewhere)).toEqual([])
  })

  it('does nothing for an installed copy', () => {
    expect(guardPortableKey(dataDir)).toBeNull()
    expect(fs.existsSync(dataDir)).toBe(false)
  })

  it('hands back an error that does not keep an unused folder from starting', () => {
    markAsPortable()
    // A file where the data folder should be: the folder cannot be made.
    fs.writeFileSync(dataDir, '')

    const result = guardPortableKey(dataDir)

    expect(result).toBeInstanceOf(PortableKeyError)
    expect((result as PortableKeyError).fatal).toBe(false)
  })

  it('hands back a fatal error when the key of another PC cannot be kept', () => {
    markAsPortable()
    fs.mkdirSync(dataDir)
    fs.writeFileSync(
      path.join(dataDir, KEY_FILENAME),
      JSON.stringify({ os_crypt: { encrypted_key: 'of there' } })
    )
    fs.writeFileSync(
      path.join(dataDir, KEY_OWNER_FILENAME),
      JSON.stringify(there)
    )
    // A folder where the copy should go: the copy cannot be written.
    fs.mkdirSync(
      path.join(
        dataDir,
        `${KEY_FILENAME}.${there.host}-${there.disk}.${process.pid}.tmp`
      )
    )

    const result = guardPortableKey(dataDir)

    expect(result).toBeInstanceOf(PortableKeyError)
    expect((result as PortableKeyError).fatal).toBe(true)
    expect(fs.existsSync(path.join(dataDir, KEY_FILENAME))).toBe(true)
  })
})
