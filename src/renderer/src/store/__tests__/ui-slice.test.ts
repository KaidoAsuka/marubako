import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from '../use-app-store'

const state = () => useAppStore.getState()

describe('setSelectedDate', () => {
  beforeEach(() => {
    useAppStore.setState({ selectedDate: '2026-04-10' })
  })

  it('moves to a valid day', () => {
    state().setSelectedDate('2026-05-01')
    expect(state().selectedDate).toBe('2026-05-01')
  })

  it.each([
    '0026-10-05',
    '20271-10-05',
    '26-10-02',
    '2026-02-30',
    '2026-13-01',
    '1999-12-31',
    '2101-01-01',
    'NaN-NaN-NaN',
    '',
  ])('ignores the unusable key %j and keeps the current day', (key) => {
    state().setSelectedDate(key)
    expect(state().selectedDate).toBe('2026-04-10')
  })
})
