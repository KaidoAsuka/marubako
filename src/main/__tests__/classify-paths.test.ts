import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { classifyPaths, readInternetShortcut } from '../classify-paths'

let root: string
const at = (...parts: string[]) => path.join(root, ...parts)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-classify-'))
  await fs.mkdir(at('folder.v2'))
  await fs.writeFile(at('tool.EXE'), 'MZ')
  await fs.writeFile(at('link.lnk'), 'lnk')
  await fs.writeFile(at('run.bat'), '@echo off')
  await fs.writeFile(at('run.cmd'), '@echo off')
  await fs.writeFile(at('notes.txt'), 'hello')
  await fs.writeFile(at('noext'), 'x')
  await fs.writeFile(
    at('site.url'),
    '[InternetShortcut]\r\nURL=https://example.com/docs?a=1\r\nIconIndex=0\r\n'
  )
  await fs.writeFile(
    at('local.url'),
    '[InternetShortcut]\nURL=http://localhost:3000\n'
  )
  await fs.writeFile(
    at('bad.url'),
    '[InternetShortcut]\nURL=javascript:alert(1)\n'
  )
  await fs.writeFile(
    at('local-file.url'),
    '[InternetShortcut]\nURL=file:///C:/x\n'
  )
  await fs.writeFile(at('empty.url'), '[InternetShortcut]\n')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('classifyPaths', () => {
  it('tells a folder from a program from another file', async () => {
    expect(
      await classifyPaths([
        at('folder.v2'),
        at('tool.EXE'),
        at('link.lnk'),
        at('run.bat'),
        at('run.cmd'),
        at('notes.txt'),
        at('noext'),
      ])
    ).toEqual([
      { kind: 'folder', target: at('folder.v2') },
      { kind: 'app', target: at('tool.EXE') },
      { kind: 'app', target: at('link.lnk') },
      { kind: 'app', target: at('run.bat') },
      { kind: 'app', target: at('run.cmd') },
      { kind: 'file', target: at('notes.txt') },
      { kind: 'file', target: at('noext') },
    ])
  })

  it('reads the address out of an internet shortcut and keeps the shortcut itself out', async () => {
    expect(await classifyPaths([at('site.url'), at('local.url')])).toEqual([
      { kind: 'website', target: 'https://example.com/docs?a=1' },
      { kind: 'website', target: 'http://localhost:3000/' },
    ])
  })

  it('drops a shortcut that points anywhere but the web', async () => {
    expect(
      await classifyPaths([
        at('bad.url'),
        at('local-file.url'),
        at('empty.url'),
      ])
    ).toEqual([])
  })

  it('leaves out what does not exist, is not absolute, or is not a path at all', async () => {
    expect(
      await classifyPaths([
        at('missing'),
        'relative\\path',
        '',
        42,
        null,
        { path: at('notes.txt') },
        'x'.repeat(40_000),
        at('notes.txt'),
      ])
    ).toEqual([{ kind: 'file', target: at('notes.txt') }])
  })

  it('keeps the order it was given', async () => {
    const result = await classifyPaths([at('notes.txt'), at('folder.v2')])
    expect(result.map((entry) => entry.kind)).toEqual(['file', 'folder'])
  })

  it('refuses anything that is not a list', async () => {
    await expect(classifyPaths('C:\\Work')).rejects.toThrow('Invalid paths')
    await expect(classifyPaths(undefined)).rejects.toThrow('Invalid paths')
    await expect(classifyPaths({ length: 1 })).rejects.toThrow('Invalid paths')
  })

  it('looks at no more than 200 paths', async () => {
    const many = Array.from({ length: 250 }, () => at('notes.txt'))
    expect(await classifyPaths(many)).toHaveLength(200)
  })
})

describe('readInternetShortcut', () => {
  it('is null for a file that cannot be read', async () => {
    expect(await readInternetShortcut(at('missing.url'))).toBeNull()
  })

  it('reads a shortcut whose line has no CR', async () => {
    expect(await readInternetShortcut(at('local.url'))).toBe(
      'http://localhost:3000/'
    )
  })
})
