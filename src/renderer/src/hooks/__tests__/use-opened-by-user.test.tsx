import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useOpenedByUser } from '../use-opened-by-user'

// A card's body unfolds with an animation only when it was opened while the card was on screen. A
// body that is already open when its page arrives is part of that page (motion.css).
describe('useOpenedByUser', () => {
  afterEach(cleanup)

  const mount = (open: boolean) =>
    renderHook(({ open }) => useOpenedByUser(open), {
      initialProps: { open },
    })

  it('is false for a body that is open when its card appears', () => {
    const { result, rerender } = mount(true)

    expect(result.current).toBe(false)
    // Still not the user's doing when the card draws again for another reason.
    rerender({ open: true })
    expect(result.current).toBe(false)
  })

  it('is false while the body is closed', () => {
    const { result } = mount(false)

    expect(result.current).toBe(false)
  })

  it('is true once a card that appeared closed is opened', () => {
    const { result, rerender } = mount(false)

    rerender({ open: true })

    expect(result.current).toBe(true)
    // It stays true while the body is open, so the animation is not cut short by a redraw.
    rerender({ open: true })
    expect(result.current).toBe(true)
  })

  it('is true when a body that arrived open is closed and opened again', () => {
    const { result, rerender } = mount(true)

    rerender({ open: false })
    expect(result.current).toBe(false)
    rerender({ open: true })

    expect(result.current).toBe(true)
  })

  it('starts over for a card that appears anew, as after a switch of category', () => {
    const first = mount(false)
    first.rerender({ open: true })
    expect(first.result.current).toBe(true)
    first.unmount()

    // The same body, open, arriving with its page.
    const second = mount(true)

    expect(second.result.current).toBe(false)
  })
})
