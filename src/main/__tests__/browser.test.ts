import { EventEmitter } from 'node:events'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserPreference } from '../../shared/types'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  access: vi.fn(),
  openExternal: vi.fn(async () => {}),
  openPath: vi.fn(async () => ''),
  getFileIcon: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
  default: { spawn: mocks.spawn },
}))
vi.mock('node:fs/promises', () => ({
  default: { access: mocks.access },
}))
vi.mock('electron-log/main', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('electron', () => ({
  app: { getFileIcon: mocks.getFileIcon },
  shell: { openExternal: mocks.openExternal, openPath: mocks.openPath },
}))

import { AppError } from '../app-error'
import {
  getFileIcon,
  isValidHttpUrl,
  openApp,
  openPath,
  openUrl,
} from '../browser'

const PROGRAM_FILES = 'C:\\Program Files'
const PROGRAM_FILES_X86 = 'C:\\Program Files (x86)'
const LOCAL_APP_DATA = 'C:\\Users\\tester\\AppData\\Local'

const EDGE_SUFFIX = path.join('Microsoft', 'Edge', 'Application', 'msedge.exe')
const CHROME_SUFFIX = path.join('Google', 'Chrome', 'Application', 'chrome.exe')

/** A child process stand-in that reports a successful or failed launch on the next tick. */
function fakeChild(outcome: 'spawn' | 'error') {
  const child = new EventEmitter() as EventEmitter & { unref: () => void }
  child.unref = vi.fn()
  setImmediate(() => {
    if (outcome === 'spawn') child.emit('spawn')
    else child.emit('error', new Error('spawn ENOENT'))
  })
  return child
}

function onlyExistingPaths(existing: string[]): void {
  mocks.access.mockImplementation(async (candidate: string) => {
    if (!existing.includes(candidate)) throw new Error('ENOENT')
  })
}

describe('isValidHttpUrl', () => {
  it('accepts http and https urls', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true)
    expect(isValidHttpUrl('http://example.com')).toBe(true)
  })

  it('rejects non-http schemes', () => {
    expect(isValidHttpUrl('file:///C:/temp')).toBe(false)
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('openUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ProgramFiles', PROGRAM_FILES)
    vi.stubEnv('ProgramFiles(x86)', PROGRAM_FILES_X86)
    vi.stubEnv('LOCALAPPDATA', LOCAL_APP_DATA)
    mocks.access.mockResolvedValue(undefined)
    mocks.spawn.mockImplementation(() => fakeChild('spawn'))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['edge', 'chrome'] as const)(
    'launches %s directly without going through cmd or a shell',
    async (browser) => {
      await openUrl('https://example.com/', browser)

      expect(mocks.spawn).toHaveBeenCalledOnce()
      const [command, , options] = mocks.spawn.mock.calls[0] as unknown as [
        string,
        string[],
        Record<string, unknown>,
      ]
      expect(command.toLowerCase()).not.toBe('cmd')
      expect(command).toMatch(
        browser === 'edge' ? /msedge\.exe$/ : /chrome\.exe$/
      )
      expect(options['shell']).not.toBe(true)
      expect(options).toMatchObject({
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      expect(mocks.openExternal).not.toHaveBeenCalled()
    }
  )

  it('passes a url containing & as one single argument after "--"', async () => {
    await openUrl('https://example.com/?a=1&b=2', 'edge')

    const [, args] = mocks.spawn.mock.calls[0] as unknown as [string, string[]]
    expect(args).toEqual(['--', 'https://example.com/?a=1&b=2'])
  })

  it('only ever hands the normalised href to the browser', async () => {
    await openUrl('HTTPS://Example.COM/a b?x=1&y=%22', 'chrome')

    const [, args] = mocks.spawn.mock.calls[0] as unknown as [string, string[]]
    expect(args).toEqual([
      '--',
      new URL('HTTPS://Example.COM/a b?x=1&y=%22').href,
    ])
    expect(args[1]).toBe('https://example.com/a%20b?x=1&y=%22')
  })

  it('detaches the child and listens for spawn errors', async () => {
    const child = fakeChild('spawn')
    mocks.spawn.mockReturnValueOnce(child)

    await openUrl('https://example.com/', 'edge')

    expect(child.listenerCount('error')).toBeGreaterThan(0)
    expect(child.unref).toHaveBeenCalled()
  })

  it('searches Program Files, Program Files (x86) and LocalAppData in order', async () => {
    const userInstall = path.join(LOCAL_APP_DATA, CHROME_SUFFIX)
    onlyExistingPaths([userInstall])

    await openUrl('https://example.com/', 'chrome')

    expect(mocks.access.mock.calls.map((call) => call[0])).toEqual([
      path.join(PROGRAM_FILES, CHROME_SUFFIX),
      path.join(PROGRAM_FILES_X86, CHROME_SUFFIX),
      userInstall,
    ])
    expect(mocks.spawn).toHaveBeenCalledWith(
      userInstall,
      ['--', 'https://example.com/'],
      expect.any(Object)
    )
  })

  it('prefers the machine-wide install over the per-user one', async () => {
    const machineInstall = path.join(PROGRAM_FILES, EDGE_SUFFIX)
    onlyExistingPaths([machineInstall, path.join(LOCAL_APP_DATA, EDGE_SUFFIX)])

    await openUrl('https://example.com/', 'edge')

    expect(mocks.spawn.mock.calls[0]?.[0]).toBe(machineInstall)
  })

  it.each(['edge', 'chrome'] as const)(
    'falls back to the default browser when %s cannot be found',
    async (browser) => {
      onlyExistingPaths([])

      await openUrl('https://example.com/?a=1&b=2', browser)

      expect(mocks.spawn).not.toHaveBeenCalled()
      expect(mocks.openExternal).toHaveBeenCalledWith(
        'https://example.com/?a=1&b=2'
      )
    }
  )

  it('falls back to the default browser when spawning fails asynchronously', async () => {
    mocks.spawn.mockImplementation(() => fakeChild('error'))

    await openUrl('https://example.com/?a=1&b=2', 'edge')

    expect(mocks.openExternal).toHaveBeenCalledWith(
      'https://example.com/?a=1&b=2'
    )
  })

  it('falls back to the default browser when spawn throws synchronously', async () => {
    mocks.spawn.mockImplementation(() => {
      throw new Error('EINVAL')
    })

    await openUrl('https://example.com/', 'chrome')

    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/')
  })

  it('uses the system default browser for "default" with the normalised href', async () => {
    await openUrl('HTTPS://Example.COM', 'default')

    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/')
  })

  it('treats an unknown browser value as the system default', async () => {
    await openUrl('https://example.com/', 'firefox' as BrowserPreference)

    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/')
  })

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'nope',
  ])('still rejects %s', async (target) => {
    await expect(openUrl(target, 'edge')).rejects.toThrow('Invalid URL')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })

  it('rejects a non-string url', async () => {
    await expect(
      openUrl({ href: 'https://example.com' } as unknown as string, 'edge')
    ).rejects.toThrow('Invalid URL')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
})

function errno(code: string): Error {
  return Object.assign(new Error(`${code}: failed`), { code })
}

async function failureOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (error) {
    return error as AppError
  }
  throw new Error('expected the open to fail')
}

describe('openUrl failures carry a code', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls an address that is not http(s) invalid_url, keeping the technical text', async () => {
    const error = await failureOf(openUrl('file:///C:/x', 'default'))

    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('invalid_url')
    expect(error.message).toContain('Invalid URL')
  })

  it('calls a system that refuses to open it open_failed', async () => {
    mocks.openExternal.mockRejectedValueOnce(new Error('no handler'))

    const error = await failureOf(openUrl('https://example.com/', 'default'))

    expect(error.code).toBe('open_failed')
    expect(error.message).toBe('no handler')
  })
})

describe('openPath and openApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue(undefined)
    mocks.openPath.mockResolvedValue('')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('open what exists and report success with an empty string', async () => {
    expect(await openPath('C:\\Work')).toBe('')
    expect(await openApp('C:\\Tools\\app.exe')).toBe('')

    expect(mocks.openPath).toHaveBeenNthCalledWith(1, 'C:\\Work')
    expect(mocks.openPath).toHaveBeenNthCalledWith(2, 'C:\\Tools\\app.exe')
  })

  it.each([
    ['ENOENT', 'path_missing'],
    ['ENOTDIR', 'not_a_folder'],
    ['EACCES', 'no_permission'],
    ['EPERM', 'no_permission'],
    ['EINVAL', 'invalid_path'],
    ['EIO', 'open_failed'],
  ] as const)(
    'tell a folder that fails with %s apart: %s',
    async (code, expected) => {
      mocks.access.mockRejectedValueOnce(errno(code))

      const error = await failureOf(openPath('D:\\Old'))

      expect(error).toBeInstanceOf(AppError)
      expect(error.code).toBe(expected)
      expect(mocks.openPath).not.toHaveBeenCalled()
    }
  )

  it('says a program that is not there is a missing program, not a missing path', async () => {
    mocks.access.mockRejectedValueOnce(errno('ENOENT'))

    expect((await failureOf(openApp('C:\\Gone\\app.exe'))).code).toBe(
      'app_missing'
    )
  })

  it('reports the operating system’s own refusal as open_failed, with its text', async () => {
    mocks.openPath.mockResolvedValueOnce('The file has no association')

    const error = await failureOf(openPath('C:\\x.unknown'))

    expect(error.code).toBe('open_failed')
    expect(error.message).toBe('The file has no association')
  })

  it('refuses an empty path without touching the disk', async () => {
    for (const empty of ['', '   ', '""', "''"]) {
      expect((await failureOf(openPath(empty))).code, empty).toBe(
        'invalid_path'
      )
    }
    expect(mocks.access).not.toHaveBeenCalled()
  })

  it('refuses a path that is not text', async () => {
    expect(
      (await failureOf(openPath(undefined as unknown as string))).code
    ).toBe('invalid_path')
  })

  it('cleans what was pasted before it looks: quotes, spaces, invisible marks (extra-3)', async () => {
    await openPath('  "C:\\Program Files\\App"  ')
    await openApp('\u202a"C:\\Tools\\app.exe"')

    expect(mocks.access).toHaveBeenNthCalledWith(1, 'C:\\Program Files\\App')
    expect(mocks.openPath).toHaveBeenNthCalledWith(1, 'C:\\Program Files\\App')
    expect(mocks.access).toHaveBeenNthCalledWith(2, 'C:\\Tools\\app.exe')
    expect(mocks.openPath).toHaveBeenNthCalledWith(2, 'C:\\Tools\\app.exe')
  })

  it('expands %VARIABLES% when it opens, whatever their case (extra-3)', async () => {
    vi.stubEnv('USERPROFILE', 'C:\\Users\\tester')

    await openPath('%USERPROFILE%\\Documents')
    await openApp('"%userprofile%\\bin\\tool.exe"')

    expect(mocks.openPath).toHaveBeenNthCalledWith(
      1,
      'C:\\Users\\tester\\Documents'
    )
    expect(mocks.openPath).toHaveBeenNthCalledWith(
      2,
      'C:\\Users\\tester\\bin\\tool.exe'
    )
  })

  it('leaves a variable that is not defined as it is, so the open says "not found"', async () => {
    mocks.access.mockRejectedValueOnce(errno('ENOENT'))

    const error = await failureOf(openPath('%NO_SUCH_VARIABLE_XYZ%\\x'))

    expect(mocks.access).toHaveBeenCalledWith('%NO_SUCH_VARIABLE_XYZ%\\x')
    expect(error.code).toBe('path_missing')
  })

  it('keeps UNC paths and turns file: addresses into paths (extra-3)', async () => {
    await openPath('"\\\\nas\\share\\docs"')
    await openPath('file:///C:/Users/me/My%20Files')

    expect(mocks.openPath).toHaveBeenNthCalledWith(1, '\\\\nas\\share\\docs')
    expect(mocks.openPath).toHaveBeenNthCalledWith(2, 'C:\\Users\\me\\My Files')
  })
})

describe('getFileIcon', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('asks for the icon of the path as it will be opened', async () => {
    vi.stubEnv('LOCALAPPDATA', 'C:\\Users\\tester\\AppData\\Local')
    mocks.getFileIcon.mockResolvedValueOnce({ toDataURL: () => 'data:icon' })

    expect(await getFileIcon('"%LOCALAPPDATA%\\App\\app.exe"')).toBe(
      'data:icon'
    )

    expect(mocks.getFileIcon).toHaveBeenCalledWith(
      'C:\\Users\\tester\\AppData\\Local\\App\\app.exe',
      { size: 'large' }
    )
  })

  it('gives null when there is no icon', async () => {
    mocks.getFileIcon.mockRejectedValueOnce(new Error('nope'))

    expect(await getFileIcon('C:\\x')).toBeNull()
  })
})
