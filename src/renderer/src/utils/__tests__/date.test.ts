import { describe, expect, it } from 'vitest'

import { addDays, isValidDateKey, toDateKey } from '../date'

describe('isValidDateKey', () => {
  it.each(['2000-01-01', '2026-03-10', '2024-02-29', '2100-12-31'])(
    'accepts the real day %s',
    (key) => {
      expect(isValidDateKey(key)).toBe(true)
    }
  )

  it.each([
    '0026-10-05',
    '20271-10-05',
    '26-10-05',
    '1999-12-31',
    '2101-01-01',
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-3-10',
    ' 2026-03-10',
    'NaN-NaN-NaN',
    '',
  ])('rejects %j', (key) => {
    expect(isValidDateKey(key)).toBe(false)
  })

  it('accepts everything the date helpers produce around today', () => {
    const today = toDateKey(new Date())
    for (const offset of [-400, -1, 0, 1, 400]) {
      expect(isValidDateKey(addDays(today, offset))).toBe(true)
    }
  })
})
