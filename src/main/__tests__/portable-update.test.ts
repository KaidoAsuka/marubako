import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  version: '3.1.0',
  fetch: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('electron', () => ({
  app: { getVersion: () => mocks.version },
  net: { fetch: mocks.fetch },
}))
vi.mock('electron-log/main', () => ({ default: mocks.log }))

import {
  checkPortableUpdate,
  isNewerVersion,
  LATEST_MANIFEST_URL,
  RELEASES_URL,
  versionInManifest,
} from '../portable-update'

/** The `latest.yml` electron-builder writes beside the installer of a release. */
function manifest(version: string): string {
  return [
    `version: ${version}`,
    'files:',
    `  - url: Marubako-Setup-${version}.exe`,
    '    sha512: 8mQ3mP1Zp1vX0Yb0cJ8tq2nN5oGk6h1lqgYB5m5n7h1x9yZJpX0e3r1tVw2c4b6a8d0f2h4j6l8n0p2r4t6v8w==',
    '    size: 84563201',
    `path: Marubako-Setup-${version}.exe`,
    'sha512: 8mQ3mP1Zp1vX0Yb0cJ8tq2nN5oGk6h1lqgYB5m5n7h1x9yZJpX0e3r1tVw2c4b6a8d0f2h4j6l8n0p2r4t6v8w==',
    "releaseDate: '2026-10-05T03:36:12.345Z'",
    '',
  ].join('\n')
}

beforeEach(() => {
  mocks.version = '3.1.0'
  mocks.fetch.mockReset()
  Object.values(mocks.log).forEach((fn) => fn.mockClear())
})

describe('the addresses a portable copy knows', () => {
  it('asks the manifest of the newest release of the project, over https', () => {
    expect(LATEST_MANIFEST_URL).toMatch(
      /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/marubako\/releases\/latest\/download\/latest\.yml$/
    )
  })

  it('sends the user to the page of the newest release of the same project', () => {
    expect(RELEASES_URL).toMatch(
      /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/marubako\/releases\/latest$/
    )
    expect(LATEST_MANIFEST_URL.startsWith(`${RELEASES_URL}/`)).toBe(true)
  })
})

describe('versionInManifest', () => {
  it('reads the version of a latest.yml as electron-builder writes it', () => {
    expect(versionInManifest(manifest('3.2.0'))).toBe('3.2.0')
  })

  it('reads it with Windows line endings too', () => {
    expect(versionInManifest(manifest('3.2.0').replace(/\n/g, '\r\n'))).toBe(
      '3.2.0'
    )
  })

  it.each([
    ['single quotes', "version: '3.10.2'"],
    ['double quotes', 'version: "3.10.2"'],
    ['no space after the colon', 'version:3.10.2'],
    ['spaces at the end of the line', 'version: 3.10.2   '],
  ])('reads a version written with %s', (_label, line) => {
    expect(versionInManifest(`${line}\npath: Marubako-Setup.exe\n`)).toBe(
      '3.10.2'
    )
  })

  it('finds the version line wherever it stands', () => {
    expect(
      versionInManifest('path: a.exe\nversion: 4.0.1\nsha512: abc\n')
    ).toBe('4.0.1')
  })

  it.each([
    ['an empty text', ''],
    ['a manifest without a version', 'path: Marubako-Setup.exe\nsha512: abc\n'],
    [
      'a page that is not a manifest',
      '<!doctype html><title>Not Found</title>',
    ],
    ['a version of two numbers', 'version: 3.2\n'],
    ['a version with a tag after it', 'version: 3.2.0-beta.1\n'],
    ['a word for a version', 'version: latest\n'],
    // Only a line of its own counts: this one belongs to another key.
    ['a version inside another line', 'minimumSystemVersion: 10.0.0\n'],
    [
      'an indented version line, which belongs to a file entry',
      '  version: 3.2.0\n',
    ],
  ])('answers null for %s', (_label, text) => {
    expect(versionInManifest(text)).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it.each([
    ['a later patch', '3.1.1', '3.1.0'],
    ['a later minor', '3.2.0', '3.1.9'],
    ['a later major', '4.0.0', '3.9.9'],
    // Numbers, not text: 10 comes after 9.
    ['3.10.0 after 3.9.0', '3.10.0', '3.9.0'],
    ['3.1.10 after 3.1.9', '3.1.10', '3.1.9'],
    ['10.0.0 after 9.9.9', '10.0.0', '9.9.9'],
  ])('knows %s as newer (%s, running %s)', (_label, candidate, current) => {
    expect(isNewerVersion(candidate, current)).toBe(true)
    expect(isNewerVersion(current, candidate)).toBe(false)
  })

  it('does not take the running version itself for a newer one', () => {
    expect(isNewerVersion('3.1.0', '3.1.0')).toBe(false)
    expect(isNewerVersion('0.0.0', '0.0.0')).toBe(false)
  })

  it.each([
    ['an earlier patch', '3.0.9', '3.1.0'],
    ['an earlier minor with a later patch', '3.0.99', '3.1.0'],
    ['an earlier major with later numbers after it', '2.99.99', '3.0.0'],
  ])('does not take %s for a newer one', (_label, candidate, current) => {
    expect(isNewerVersion(candidate, current)).toBe(false)
  })

  it('counts a number that is missing or not a number as 0', () => {
    expect(isNewerVersion('3.2', '3.1.9')).toBe(true)
    expect(isNewerVersion('3.1', '3.1.0')).toBe(false)
    expect(isNewerVersion('x.y.z', '0.0.1')).toBe(false)
  })
})

describe('checkPortableUpdate', () => {
  it('asks for the manifest of the newest release, and for nothing else', async () => {
    const fetchText = vi.fn(async () => manifest('3.1.0'))

    await checkPortableUpdate(fetchText)

    expect(fetchText).toHaveBeenCalledTimes(1)
    expect(fetchText).toHaveBeenCalledWith(LATEST_MANIFEST_URL)
  })

  it('says a newer version is available, naming it', async () => {
    await expect(
      checkPortableUpdate(async () => manifest('3.2.0'))
    ).resolves.toEqual({ status: 'available', version: '3.2.0' })
    expect(mocks.log.warn).not.toHaveBeenCalled()
  })

  it('says it is the latest version, naming the running one', async () => {
    await expect(
      checkPortableUpdate(async () => manifest('3.1.0'))
    ).resolves.toEqual({ status: 'latest', version: '3.1.0' })
  })

  it('says latest, with the running version, when the release is older than this copy', async () => {
    mocks.version = '3.3.0'

    await expect(
      checkPortableUpdate(async () => manifest('3.2.9'))
    ).resolves.toEqual({ status: 'latest', version: '3.3.0' })
  })

  it('compares the numbers, not the text: 3.10.0 is newer than 3.9.0', async () => {
    mocks.version = '3.9.0'

    await expect(
      checkPortableUpdate(async () => manifest('3.10.0'))
    ).resolves.toEqual({ status: 'available', version: '3.10.0' })
  })

  it('reports a request that failed as an error, never as a throw, and logs the reason', async () => {
    const offline = new Error('net::ERR_INTERNET_DISCONNECTED')

    await expect(
      checkPortableUpdate(async () => {
        throw offline
      })
    ).resolves.toEqual({ status: 'error' })
    expect(mocks.log.warn).toHaveBeenCalledWith(
      'Version check of the portable copy failed',
      offline
    )
  })

  it.each([
    ['names no version', 'path: Marubako-Setup.exe\n'],
    ['is a web page', '<!doctype html><title>Sign in</title>'],
    ['is empty', ''],
  ])(
    'reports an answer that %s as an error, not as "latest"',
    async (_label, text) => {
      await expect(checkPortableUpdate(async () => text)).resolves.toEqual({
        status: 'error',
      })
      expect(mocks.log.warn).toHaveBeenCalledWith(
        'Version check of the portable copy failed',
        expect.any(Error)
      )
    }
  )
})

// Without a function given, the manifest comes through Electron's net module (which follows the
// system proxy), fresh every time and with a time limit.
describe('checkPortableUpdate over the network', () => {
  it('fetches the manifest uncached, with a time limit, and reads the version from it', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => manifest('3.2.0'),
    })

    await expect(checkPortableUpdate()).resolves.toEqual({
      status: 'available',
      version: '3.2.0',
    })

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = mocks.fetch.mock.calls[0] as [
      string,
      { cache?: string; signal?: AbortSignal },
    ]
    expect(url).toBe(LATEST_MANIFEST_URL)
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports an answer that is not a success as an error', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    })

    await expect(checkPortableUpdate()).resolves.toEqual({ status: 'error' })
    expect(mocks.log.warn).toHaveBeenCalledTimes(1)
  })

  it('reports a request that could not be made as an error', async () => {
    mocks.fetch.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))

    await expect(checkPortableUpdate()).resolves.toEqual({ status: 'error' })
  })
})
