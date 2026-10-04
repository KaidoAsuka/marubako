import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import type * as FsModule from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

// The synchronous variant imports renameSync by name, and the test runner captures named imports of
// Node builtins when a module is loaded, so neither vi.mock nor vi.spyOn on the module can reach
// it afterwards. Instead a delegating wrapper is installed on the real fs module before the module
// under test is imported; it behaves like the real renameSync unless a test overrides it.
const nodeFs = createRequire(import.meta.url)('node:fs') as typeof FsModule
const realRenameSync = nodeFs.renameSync
const renameSyncMock = vi.fn(realRenameSync)
nodeFs.renameSync = renameSyncMock as typeof realRenameSync
syncBuiltinESMExports()

const { atomicWriteFile, atomicWriteFileSync, removeStaleTempFiles } =
  await import('../atomic-file')

afterAll(() => {
  nodeFs.renameSync = realRenameSync
  syncBuiltinESMExports()
})

function errorWithCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated`), { code })
}

let dir: string
let target: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-atomic-'))
  target = path.join(dir, 'data.json')
})

afterEach(async () => {
  vi.restoreAllMocks()
  renameSyncMock.mockReset()
  renameSyncMock.mockImplementation(realRenameSync)
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 })
})

function listDir(directory = dir): string[] {
  return readdirSync(directory).sort()
}

/** Wraps fs.open so the test sees the temp path and can sabotage the file handle. */
function spyOnOpen(
  decorate?: (handle: Awaited<ReturnType<typeof fs.open>>) => void
): { tempPaths: string[] } {
  const realOpen = fs.open.bind(fs)
  const tempPaths: string[] = []
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    tempPaths.push(String(args[0]))
    const handle = await realOpen(...args)
    decorate?.(handle)
    return handle
  })
  return { tempPaths }
}

describe('atomicWriteFile', () => {
  it('creates missing parent directories and writes the content', async () => {
    const nested = path.join(dir, 'a', 'b', 'c', 'data.json')

    await atomicWriteFile(nested, '{"ok":true}')

    expect(readFileSync(nested, 'utf8')).toBe('{"ok":true}')
  })

  it('writes the exact text, including non-ASCII characters and line endings', async () => {
    const content = '# 世界 🔑\r\n\tindented\n\n'

    await atomicWriteFile(target, content)

    expect(readFileSync(target, 'utf8')).toBe(content)
  })

  it('replaces an existing file completely, leaving no tail of the old content', async () => {
    writeFileSync(
      target,
      'old content that is clearly much longer than the new one'
    )

    await atomicWriteFile(target, 'new')

    expect(readFileSync(target, 'utf8')).toBe('new')
  })

  it('can write an empty file over a non-empty one', async () => {
    writeFileSync(target, 'something')

    await atomicWriteFile(target, '')

    expect(readFileSync(target, 'utf8')).toBe('')
  })

  it('leaves no temporary file behind after a successful write', async () => {
    await atomicWriteFile(target, 'one')
    await atomicWriteFile(target, 'two')

    expect(listDir()).toEqual(['data.json'])
  })

  it('writes through a temporary file next to the target, with a different name every time', async () => {
    const { tempPaths } = spyOnOpen()

    await atomicWriteFile(target, 'one')
    await atomicWriteFile(target, 'two')

    expect(tempPaths).toHaveLength(2)
    expect(tempPaths[0]).not.toBe(tempPaths[1])
    for (const tempPath of tempPaths) {
      expect(path.dirname(tempPath)).toBe(dir)
      expect(path.basename(tempPath)).toMatch(
        new RegExp(`^data\\.json\\.${process.pid}-\\d+\\.tmp$`)
      )
    }
  })

  it('flushes the temporary file to disk before renaming it over the target', async () => {
    const events: string[] = []
    spyOnOpen((handle) => {
      const sync = handle.sync.bind(handle)
      vi.spyOn(handle, 'sync').mockImplementation(async () => {
        events.push('sync')
        await sync()
      })
    })
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      events.push('rename')
      await rename(from, to)
    })

    await atomicWriteFile(target, 'data')

    expect(events).toEqual(['sync', 'rename'])
  })

  describe('when writing the temporary file fails', () => {
    it('propagates the error, keeps the original and removes the partial temporary file', async () => {
      writeFileSync(target, 'original')
      const failure = new Error('disk full')
      const { tempPaths } = spyOnOpen((handle) => {
        const writeFile = handle.writeFile.bind(handle)
        vi.spyOn(handle, 'writeFile').mockImplementation(async () => {
          await writeFile('part', 'utf8') // a partial write reaches the disk first
          throw failure
        })
      })

      await expect(atomicWriteFile(target, 'brand new content')).rejects.toBe(
        failure
      )

      expect(tempPaths).toHaveLength(1)
      expect(readFileSync(target, 'utf8')).toBe('original')
      expect(listDir()).toEqual(['data.json'])
    })

    it('does not create the target when it did not exist before', async () => {
      spyOnOpen((handle) => {
        vi.spyOn(handle, 'writeFile').mockRejectedValue(new Error('disk full'))
      })

      await expect(atomicWriteFile(target, 'content')).rejects.toThrow(
        'disk full'
      )

      expect(listDir()).toEqual([])
    })

    it('still closes the file handle', async () => {
      let closed = false
      spyOnOpen((handle) => {
        vi.spyOn(handle, 'writeFile').mockRejectedValue(new Error('disk full'))
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => {
          closed = true
          await close()
        })
      })

      await expect(atomicWriteFile(target, 'content')).rejects.toThrow()

      expect(closed).toBe(true)
    })

    it('does not touch the original when the sync step fails', async () => {
      writeFileSync(target, 'original')
      spyOnOpen((handle) => {
        vi.spyOn(handle, 'sync').mockRejectedValue(new Error('flush failed'))
      })

      await expect(atomicWriteFile(target, 'new')).rejects.toThrow(
        'flush failed'
      )

      expect(readFileSync(target, 'utf8')).toBe('original')
      expect(listDir()).toEqual(['data.json'])
    })
  })

  describe('when the rename fails for real', () => {
    it('rejects, leaves the blocking directory alone and removes the temporary file', async () => {
      // A directory in the way makes the rename fail on every platform.
      mkdirSync(target)
      writeFileSync(path.join(target, 'keep.txt'), 'keep')

      await expect(atomicWriteFile(target, 'new')).rejects.toThrow()

      expect(listDir()).toEqual(['data.json'])
      expect(readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('keep')
    })
  })

  describe('rename retries', () => {
    function busy(code: string): Error {
      return errorWithCode(code)
    }

    it.each(['EBUSY', 'EPERM', 'EACCES'])(
      'retries once after a transient %s and then succeeds',
      async (code) => {
        writeFileSync(target, 'original')
        const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(busy(code))

        await atomicWriteFile(target, 'new')

        expect(rename).toHaveBeenCalledTimes(2)
        expect(readFileSync(target, 'utf8')).toBe('new')
        expect(listDir()).toEqual(['data.json'])
      }
    )

    it('retries with the same temporary file and the same target each time', async () => {
      const rename = vi
        .spyOn(fs, 'rename')
        .mockRejectedValueOnce(busy('EBUSY'))
        .mockRejectedValueOnce(busy('EPERM'))

      await atomicWriteFile(target, 'new')

      expect(rename).toHaveBeenCalledTimes(3)
      const [first, second, third] = rename.mock.calls
      expect(second).toEqual(first)
      expect(third).toEqual(first)
      expect(first?.[1]).toBe(target)
    })

    it('gives up after five attempts, keeps the original and removes the temporary file', async () => {
      writeFileSync(target, 'original')
      const failure = busy('EPERM')
      const rename = vi.spyOn(fs, 'rename').mockRejectedValue(failure)

      await expect(atomicWriteFile(target, 'new')).rejects.toBe(failure)

      expect(rename).toHaveBeenCalledTimes(5)
      expect(readFileSync(target, 'utf8')).toBe('original')
      expect(listDir()).toEqual(['data.json'])
    })

    it('waits between attempts instead of spinning', async () => {
      vi.spyOn(fs, 'rename')
        .mockRejectedValueOnce(busy('EBUSY'))
        .mockRejectedValueOnce(busy('EBUSY'))
      const started = performance.now()

      await atomicWriteFile(target, 'new')

      // Two retries at 50 ms each; allow for timer granularity.
      expect(performance.now() - started).toBeGreaterThanOrEqual(80)
    })

    it('does not retry other errors such as ENOSPC', async () => {
      writeFileSync(target, 'original')
      const failure = errorWithCode('ENOSPC')
      const rename = vi.spyOn(fs, 'rename').mockRejectedValue(failure)

      await expect(atomicWriteFile(target, 'new')).rejects.toBe(failure)

      expect(rename).toHaveBeenCalledTimes(1)
      expect(readFileSync(target, 'utf8')).toBe('original')
      expect(listDir()).toEqual(['data.json'])
    })

    it('does not retry errors without a code', async () => {
      const failure = new Error('no code')
      const rename = vi.spyOn(fs, 'rename').mockRejectedValue(failure)

      await expect(atomicWriteFile(target, 'new')).rejects.toBe(failure)

      expect(rename).toHaveBeenCalledTimes(1)
      expect(listDir()).toEqual([])
    })
  })
})

describe('atomicWriteFileSync', () => {
  it('creates missing parent directories and writes the content', () => {
    const nested = path.join(dir, 'x', 'y', 'data.json')

    atomicWriteFileSync(nested, '{"sync":true}')

    expect(readFileSync(nested, 'utf8')).toBe('{"sync":true}')
  })

  it('writes the exact text, including non-ASCII characters and line endings', () => {
    const content = '# 世界 🔑\r\n\tindented\n\n'

    atomicWriteFileSync(target, content)

    expect(readFileSync(target, 'utf8')).toBe(content)
  })

  it('replaces an existing file completely, leaving no tail of the old content', () => {
    writeFileSync(
      target,
      'old content that is clearly much longer than the new one'
    )

    atomicWriteFileSync(target, 'new')

    expect(readFileSync(target, 'utf8')).toBe('new')
  })

  it('leaves no temporary file behind after a successful write', () => {
    atomicWriteFileSync(target, 'one')
    atomicWriteFileSync(target, 'two')

    expect(listDir()).toEqual(['data.json'])
  })

  it('writes through a temporary file next to the target', () => {
    atomicWriteFileSync(target, 'content')

    const [from, to] = renameSyncMock.mock.calls[0] ?? []
    expect(to).toBe(target)
    expect(path.dirname(String(from))).toBe(dir)
    expect(path.basename(String(from))).toMatch(
      new RegExp(`^data\\.json\\.${process.pid}-\\d+\\.tmp$`)
    )
  })

  it('throws, and creates nothing, when the parent of the target is a file', () => {
    const blocker = path.join(dir, 'blocker')
    writeFileSync(blocker, 'I am a file')

    expect(() =>
      atomicWriteFileSync(path.join(blocker, 'data.json'), 'content')
    ).toThrow()

    expect(readFileSync(blocker, 'utf8')).toBe('I am a file')
    expect(listDir()).toEqual(['blocker'])
  })

  it('keeps the original and removes the temporary file when the rename fails', () => {
    writeFileSync(target, 'original')
    const failure = errorWithCode('ENOSPC')
    renameSyncMock.mockImplementation(() => {
      throw failure
    })

    expect(() => atomicWriteFileSync(target, 'new')).toThrow(failure)

    expect(renameSyncMock).toHaveBeenCalledTimes(1)
    expect(readFileSync(target, 'utf8')).toBe('original')
    expect(listDir()).toEqual(['data.json'])
  })

  it('retries a transient rename failure and then succeeds', () => {
    writeFileSync(target, 'original')
    renameSyncMock.mockImplementationOnce(() => {
      throw errorWithCode('EBUSY')
    })

    atomicWriteFileSync(target, 'new')

    expect(renameSyncMock).toHaveBeenCalledTimes(2)
    expect(readFileSync(target, 'utf8')).toBe('new')
    expect(listDir()).toEqual(['data.json'])
  })

  it('gives up after five attempts, keeps the original and removes the temporary file', () => {
    writeFileSync(target, 'original')
    const failure = errorWithCode('EPERM')
    renameSyncMock.mockImplementation(() => {
      throw failure
    })

    expect(() => atomicWriteFileSync(target, 'new')).toThrow(failure)

    expect(renameSyncMock).toHaveBeenCalledTimes(5)
    expect(readFileSync(target, 'utf8')).toBe('original')
    expect(listDir()).toEqual(['data.json'])
  })
})

describe('removeStaleTempFiles', () => {
  it('removes interrupted-write leftovers of that file and nothing else', async () => {
    const keep = [
      'data.json',
      'data.json.bak',
      'data.json.keep',
      'data.json2.1-1.tmp',
      'other.json.1-1.tmp',
      'other.json',
      'notes.tmp',
    ]
    const remove = ['data.json.123-1.tmp', 'data.json.99-42.tmp']
    for (const name of [...keep, ...remove]) {
      writeFileSync(path.join(dir, name), name)
    }

    await removeStaleTempFiles(target)

    expect(listDir()).toEqual([...keep].sort())
  })

  it('does not follow the file name into other directories', async () => {
    const sibling = path.join(dir, 'sub')
    mkdirSync(sibling)
    writeFileSync(path.join(sibling, 'data.json.1-1.tmp'), 'other directory')

    await removeStaleTempFiles(target)

    expect(listDir(sibling)).toEqual(['data.json.1-1.tmp'])
  })

  it('does nothing and does not throw when there are no leftovers', async () => {
    writeFileSync(target, 'content')

    await expect(removeStaleTempFiles(target)).resolves.toBeUndefined()

    expect(listDir()).toEqual(['data.json'])
  })

  it('does not throw when the directory does not exist', async () => {
    const missing = path.join(dir, 'does', 'not', 'exist', 'data.json')

    await expect(removeStaleTempFiles(missing)).resolves.toBeUndefined()
  })

  it('cleans up what a crashed write left behind', async () => {
    writeFileSync(target, 'original')
    const { tempPaths } = spyOnOpen((handle) => {
      // Simulates a kill during the write: the temp file stays because cleanup never ran.
      vi.spyOn(handle, 'writeFile').mockRejectedValue(new Error('boom'))
    })
    vi.spyOn(fs, 'rm').mockResolvedValue(undefined)

    await expect(atomicWriteFile(target, 'new')).rejects.toThrow('boom')
    expect(listDir()).toHaveLength(2)
    vi.restoreAllMocks()

    await removeStaleTempFiles(target)

    expect(tempPaths).toHaveLength(1)
    expect(listDir()).toEqual(['data.json'])
    expect(readFileSync(target, 'utf8')).toBe('original')
  })
})

describe('atomicWriteFile with shouldCommit', () => {
  it('commits and reports true when it is allowed to', async () => {
    writeFileSync(target, 'old')

    const committed = await atomicWriteFile(target, 'new', {
      shouldCommit: () => true,
    })

    expect(committed).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('new')
  })

  it('reports true without a check, as before', async () => {
    expect(await atomicWriteFile(target, 'plain')).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('plain')
  })

  it('abandons the write when it is no longer allowed: target untouched, no temp file', async () => {
    writeFileSync(target, 'old')
    const rename = vi.spyOn(fs, 'rename')

    const committed = await atomicWriteFile(target, 'new', {
      shouldCommit: () => false,
    })

    expect(committed).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('old')
    expect(listDir()).toEqual(['data.json'])
    expect(rename).not.toHaveBeenCalled()
  })

  it('asks after the content is written, right before the rename', async () => {
    writeFileSync(target, 'old')
    let seenBeforeRename: string[] = []
    const shouldCommit = vi.fn(() => {
      seenBeforeRename = listDir()
      return true
    })

    await atomicWriteFile(target, 'new', { shouldCommit })

    expect(shouldCommit).toHaveBeenCalledTimes(1)
    // The temporary file already exists at that moment, next to the untouched target.
    expect(seenBeforeRename).toHaveLength(2)
    expect(readFileSync(target, 'utf8')).toBe('new')
  })
})
