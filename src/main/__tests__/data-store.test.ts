import { describe, expect, it } from 'vitest'

import { normalizeAppData, parseAppDataFile } from '../data-store'

describe('normalizeAppData', () => {
  it('adds command collections to older data without altering notes', () => {
    const data = normalizeAppData({
      loose: {
        notes: [{ id: 'n', name: 'Old', content: '  original\n\ttext\n' }],
      },
    })
    expect(data.commands).toEqual([])
    expect(data.loose.commands).toEqual([])
    expect(data.topOrder.commands).toEqual([])
    expect(data.loose.notes[0]?.content).toBe('  original\n\ttext\n')
  })
  it('preserves grouped and loose scripts through backup import with exact whitespace', () => {
    const script = '# 世界\nif x < 2:\n\tprint("<&>")\n\n'
    const item = {
      id: 'cmd',
      kind: 'command',
      name: 'Script',
      content: script,
      language: 'python',
      description: 'Usage',
      icon: '⌘',
    }
    const source = normalizeAppData({
      commands: [{ id: 'g', name: 'Dev', items: [item] }],
      loose: { commands: [{ ...item, id: 'loose' }] },
    })
    const restored = parseAppDataFile(JSON.stringify(source))
    expect(restored.commands[0]?.items[0]).toEqual(item)
    expect(restored.loose.commands[0]?.content).toBe(script)
    expect(restored.topOrder.commands).toEqual([
      { type: 'group', id: 'g' },
      { type: 'loose', id: 'loose' },
    ])
  })
  it('repairs unsupported script language labels', () => {
    expect(
      normalizeAppData({ loose: { commands: [{ language: 'unknown' }] } }).loose
        .commands[0]?.language
    ).toBe('powershell')
  })
  it('fills required structural defaults', () => {
    const data = normalizeAppData({})

    expect(data.schemaVersion).toBe(2)
    expect(data.loose.apps).toEqual([])
    expect(data.loose.passwords).toEqual([])
    expect(data.topOrder.passwords).toEqual([])
    expect(data.prefs.opacity).toBe(1)
    expect(data.prefs.motion).toBe(1.35)
    expect(data.window.alwaysOnTop).toBe(false)
  })

  it('repairs missing ids inside groups', () => {
    const data = normalizeAppData({
      folders: [
        {
          name: 'Docs',
          icon: '📁',
          open: true,
          items: [{ name: 'One', path: 'C:\\Docs' }],
        },
      ],
    })

    expect(data.folders[0]?.id).toBeTruthy()
    expect(data.folders[0]?.items[0]?.id).toBeTruthy()
  })

  it('migrates legacy window coordinates and opacity into the current schema', () => {
    const data = normalizeAppData({
      prefs: {
        opacity: 0.72,
        motion: 1.4,
      },
      window: {
        x: 16,
        y: 24,
        width: 420,
        height: 680,
        alwaysOnTop: false,
      },
    })

    expect(data.prefs.opacity).toBe(0.72)
    expect(data.prefs.motion).toBe(1.4)
    expect(data.window.bounds).toEqual({
      x: 16,
      y: 24,
      w: 420,
      h: 680,
    })
    expect(data.window.opacity).toBe(0.72)
    expect(data.window.alwaysOnTop).toBe(false)
  })

  it('unwraps V2 envelopes and preserves 5-tab loose/topOrder data', () => {
    const data = normalizeAppData({
      version: 1,
      data: {
        prefs: {
          motion: 1.35,
        },
        loose: {
          passwords: [
            {
              id: 'loose-password',
              name: 'Mail',
              username: 'user@example.com',
              password: 'secret',
              icon: '🔑',
            },
          ],
          notes: [
            {
              id: 'loose-note',
              name: 'Scratch',
              content: 'Remember this',
              icon: '📝',
            },
          ],
        },
        topOrder: {
          passwords: [{ type: 'loose', id: 'loose-password' }],
          notes: [{ type: 'loose', id: 'loose-note' }],
        },
      },
    })

    expect(data.loose.passwords[0]?.kind).toBe('password')
    expect(data.loose.notes[0]?.kind).toBe('note')
    expect(data.topOrder.passwords).toContainEqual({
      type: 'loose',
      id: 'loose-password',
    })
    expect(data.topOrder.notes).toContainEqual({
      type: 'loose',
      id: 'loose-note',
    })
  })

  it('parses plain exported json backups', () => {
    const source = {
      ...normalizeAppData({}),
      prefs: {
        ...normalizeAppData({}).prefs,
        lang: 'en' as const,
      },
    }

    const data = parseAppDataFile(JSON.stringify(source, null, 2))

    expect(data.schemaVersion).toBe(2)
    expect(data.prefs.lang).toBe('en')
  })

  it('parses unencrypted saved envelopes for import', () => {
    const data = parseAppDataFile(
      JSON.stringify({
        version: 1,
        encrypted: false,
        payload: JSON.stringify({
          loose: {
            notes: [
              {
                id: 'note-imported',
                name: 'Imported',
                content: 'From backup',
                icon: '📝',
              },
            ],
          },
          topOrder: {
            notes: [{ type: 'loose', id: 'note-imported' }],
          },
        }),
      })
    )

    expect(data.loose.notes[0]?.id).toBe('note-imported')
    expect(data.topOrder.notes).toContainEqual({
      type: 'loose',
      id: 'note-imported',
    })
  })
})
