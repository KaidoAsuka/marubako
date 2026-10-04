import { act } from '@testing-library/react'

/** The width jsdom starts with, to put back when a test is done. */
export const INITIAL_WINDOW_WIDTH = window.innerWidth

/** Resizes the (jsdom) window and tells the page, as the real one does. */
export function resizeWindow(width: number): void {
  act(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    })
    window.dispatchEvent(new Event('resize'))
  })
}
