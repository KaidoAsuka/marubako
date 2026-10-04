import { describe, expect, it } from 'vitest'

import { rangeFill } from '../range-fill'

describe('rangeFill', () => {
  it('maps the value onto the 0..1 position of the thumb', () => {
    expect(rangeFill(80, 80, 140)).toEqual({ '--range-fill': 0 })
    expect(rangeFill(110, 80, 140)).toEqual({ '--range-fill': 0.5 })
    expect(rangeFill(140, 80, 140)).toEqual({ '--range-fill': 1 })
  })

  it('stays inside 0..1 for stale or degenerate input', () => {
    expect(rangeFill(10, 20, 100)).toEqual({ '--range-fill': 0 })
    expect(rangeFill(500, 20, 100)).toEqual({ '--range-fill': 1 })
    expect(rangeFill(5, 5, 5)).toEqual({ '--range-fill': 0 })
  })
})
