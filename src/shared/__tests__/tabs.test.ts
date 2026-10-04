import { describe, expect, it } from 'vitest'

import {
  firstVisibleTab,
  isTabVisible,
  normalizeHiddenTabs,
  resolveVisibleTab,
  visibleTabs,
} from '../tabs'
import { ALL_TABS } from '../types'

describe('normalizeHiddenTabs', () => {
  it('hides nothing when the setting is missing or not a list (old data, a damaged file)', () => {
    for (const input of [
      undefined,
      null,
      'notes',
      7,
      { notes: true },
      true,
    ] as const) {
      expect(normalizeHiddenTabs(input), String(input)).toEqual([])
    }
  })

  it('keeps known categories, each once, in the fixed category order', () => {
    expect(normalizeHiddenTabs(['tasks', 'notes', 'tasks', 'folders'])).toEqual(
      ['folders', 'notes', 'tasks']
    )
  })

  it('drops values that are not categories', () => {
    expect(
      normalizeHiddenTabs(['bookmarks', 3, null, 'notes', {}, 'Notes'])
    ).toEqual(['notes'])
  })

  it('never hides all seven: the first category stays', () => {
    expect(normalizeHiddenTabs([...ALL_TABS])).toEqual(ALL_TABS.slice(1))
    expect(normalizeHiddenTabs([...ALL_TABS].reverse())).toEqual(
      ALL_TABS.slice(1)
    )
  })

  it('allows hiding six', () => {
    const six = ALL_TABS.slice(0, 6)

    expect(normalizeHiddenTabs(six)).toEqual(six)
  })
})

describe('visible categories', () => {
  it('are all seven by default, in the fixed order', () => {
    expect(visibleTabs([])).toEqual([...ALL_TABS])
    expect(visibleTabs(undefined)).toEqual([...ALL_TABS])
  })

  it('leave out the hidden ones and keep the order of the rest', () => {
    expect(visibleTabs(['apps', 'notes'])).toEqual([
      'folders',
      'websites',
      'passwords',
      'commands',
      'tasks',
    ])
  })

  it('are never empty', () => {
    expect(visibleTabs([...ALL_TABS])).toEqual(['folders'])
  })

  it('say whether a category is shown', () => {
    expect(isTabVisible('notes', ['notes'])).toBe(false)
    expect(isTabVisible('tasks', ['notes'])).toBe(true)
  })

  it('open on the first one that is shown', () => {
    expect(firstVisibleTab([])).toBe('folders')
    expect(firstVisibleTab(['folders', 'websites'])).toBe('apps')
  })

  it('send a hidden category to the first shown one and leave a shown one alone', () => {
    expect(resolveVisibleTab('notes', ['notes'])).toBe('folders')
    expect(resolveVisibleTab('notes', ['folders', 'notes'])).toBe('websites')
    expect(resolveVisibleTab('tasks', ['notes'])).toBe('tasks')
  })
})
