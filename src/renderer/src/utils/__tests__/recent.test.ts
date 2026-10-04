import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readRecent, recordUse } from '../recent'

describe('recent uses', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts empty', () => {
    expect(readRecent()).toEqual([])
  })

  it('puts the entry used last first', () => {
    recordUse('websites', 'a')
    recordUse('notes', 'b')

    expect(readRecent()).toEqual([
      { tab: 'notes', id: 'b' },
      { tab: 'websites', id: 'a' },
    ])
  })

  it('moves an entry used again to the front instead of listing it twice', () => {
    recordUse('websites', 'a')
    recordUse('notes', 'b')
    recordUse('websites', 'a')

    expect(readRecent()).toEqual([
      { tab: 'websites', id: 'a' },
      { tab: 'notes', id: 'b' },
    ])
  })

  it('keeps the twelve most recent', () => {
    for (let i = 0; i < 20; i += 1) recordUse('websites', `site-${i}`)

    const recent = readRecent()

    expect(recent).toHaveLength(12)
    expect(recent[0]).toEqual({ tab: 'websites', id: 'site-19' })
    expect(recent[11]).toEqual({ tab: 'websites', id: 'site-8' })
  })

  it('stores nothing but the category and the id, never what the entry holds', () => {
    recordUse('passwords', 'p1')

    expect(JSON.parse(localStorage.getItem('recent-opens-v1')!)).toEqual([
      { tab: 'passwords', id: 'p1' },
    ])
  })

  it('ignores an empty id', () => {
    recordUse('websites', '')

    expect(readRecent()).toEqual([])
  })

  it('drops stored entries that are damaged, and reads past stored junk', () => {
    localStorage.setItem(
      'recent-opens-v1',
      JSON.stringify([
        { tab: 'websites', id: 'ok' },
        { tab: 'tasks', id: 'not-a-group-tab' },
        { tab: 'notes' },
        { id: 'no-tab' },
        null,
        'text',
        { tab: 'notes', id: '' },
        { tab: 'notes', id: 'also-ok', extra: 'dropped' },
      ])
    )

    expect(readRecent()).toEqual([
      { tab: 'websites', id: 'ok' },
      { tab: 'notes', id: 'also-ok' },
    ])

    localStorage.setItem('recent-opens-v1', '{not json')
    expect(readRecent()).toEqual([])
    localStorage.setItem('recent-opens-v1', '{"a":1}')
    expect(readRecent()).toEqual([])
  })

  it('does not break when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readRecent()).toEqual([])
    expect(() => recordUse('websites', 'a')).not.toThrow()
  })
})
