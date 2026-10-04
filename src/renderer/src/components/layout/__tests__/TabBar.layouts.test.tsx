import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import {
  ROW_MIN_WIDTH,
  STACKED_MIN_WIDTH,
} from '../../../../../shared/layout-widths'
import type { Lang } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import { INITIAL_WINDOW_WIDTH, resizeWindow } from '../../../test/resize-window'
import TabBar from '../TabBar'

function load(lang: Lang): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({ data, currentTab: 'folders' })
}

const row = () => document.querySelector('.workspace-nav')!

describe('TabBar layouts', () => {
  beforeEach(() => {
    load('zh')
  })

  afterEach(() => {
    cleanup()
    resizeWindow(INITIAL_WINDOW_WIDTH)
  })

  // The widths at which the tabs change are constants per language (shared/layout-widths.ts).
  it.each([
    [STACKED_MIN_WIDTH.zh - 1, 'icons'],
    [STACKED_MIN_WIDTH.zh, 'stacked'],
    [400, 'stacked'],
    [ROW_MIN_WIDTH.zh - 1, 'stacked'],
    [ROW_MIN_WIDTH.zh, 'row'],
    [1000, 'row'],
  ] as const)('is %i px wide: the tabs are %s (Chinese)', (width, mode) => {
    resizeWindow(width)
    render(<TabBar />)

    expect(row()).toHaveAttribute('data-tab-mode', mode)
  })

  it('switches layout when the window is resized, without remounting the tabs', () => {
    resizeWindow(400)
    render(<TabBar />)
    const folders = screen.getByTestId('tab-folders')
    expect(row()).toHaveAttribute('data-tab-mode', 'stacked')

    resizeWindow(800)

    expect(row()).toHaveAttribute('data-tab-mode', 'row')
    expect(screen.getByTestId('tab-folders')).toBe(folders)
  })

  it('keeps every name in the document, and in the accessible name, when only icons are drawn', () => {
    resizeWindow(280)
    render(<TabBar />)

    expect(row()).toHaveAttribute('data-tab-mode', 'icons')
    for (const [id, name] of [
      ['folders', '文件夹'],
      ['commands', '命令'],
      ['tasks', '任务'],
    ] as const) {
      expect(screen.getByTestId(`tab-${id}`)).toHaveTextContent(name)
      expect(screen.getByTestId(`tab-${id}`)).toHaveAttribute(
        'aria-label',
        expect.stringContaining(name)
      )
    }
  })

  it('draws the icons a little larger when they stand above the names', () => {
    resizeWindow(400)
    const { unmount } = render(<TabBar />)
    const stacked = screen
      .getByTestId('tab-folders')
      .querySelector('svg')!
      .getAttribute('width')
    unmount()

    resizeWindow(800)
    render(<TabBar />)
    const beside = screen
      .getByTestId('tab-folders')
      .querySelector('svg')!
      .getAttribute('width')

    expect(stacked).toBe('18')
    expect(beside).toBe('16')
  })

  it('keeps "new group" and "add" out of the category row until the names stand beside the icons', () => {
    resizeWindow(400)
    const { unmount } = render(<TabBar />)
    expect(row().querySelector('.section-actions')).toBeNull()
    unmount()

    resizeWindow(700)
    render(<TabBar />)
    expect(row().querySelector('.section-actions')).not.toBeNull()
    expect(
      row().querySelector('[data-testid="add-loose-item-folders"]')
    ).not.toBeNull()
    // The layout switch of the page travels with them.
    expect(
      row().querySelector('.section-actions [data-testid="toggle-view-mode"]')
    ).not.toBeNull()
  })

  it('moves the actions into the row as the window widens, and out again', () => {
    resizeWindow(400)
    render(<TabBar />)
    expect(screen.queryByTestId('add-loose-item-folders')).toBeNull()

    resizeWindow(900)
    expect(screen.getByTestId('add-loose-item-folders')).toBeInTheDocument()

    resizeWindow(400)
    expect(screen.queryByTestId('add-loose-item-folders')).toBeNull()
  })

  it('uses the English thresholds in English', () => {
    load('en')
    expect(STACKED_MIN_WIDTH.en).toBeGreaterThan(STACKED_MIN_WIDTH.zh)
    resizeWindow(STACKED_MIN_WIDTH.en - 1)
    const { unmount } = render(<TabBar />)
    expect(row()).toHaveAttribute('data-tab-mode', 'icons')
    unmount()

    resizeWindow(STACKED_MIN_WIDTH.en)
    const stacked = render(<TabBar />)
    expect(row()).toHaveAttribute('data-tab-mode', 'stacked')
    stacked.unmount()

    // The row of names beside their icons, with the three buttons of a page at its end.
    resizeWindow(ROW_MIN_WIDTH.en - 1)
    const narrow = render(<TabBar />)
    expect(row()).toHaveAttribute('data-tab-mode', 'stacked')
    narrow.unmount()

    resizeWindow(ROW_MIN_WIDTH.en)
    render(<TabBar />)
    expect(row()).toHaveAttribute('data-tab-mode', 'row')
  })

  it('moves the marker to the new place when the layout changes', () => {
    const offsetLeft = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetLeft'
    )
    // The tabs are 50px apart while stacked and 100px apart beside their icons.
    Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get(this: HTMLElement) {
        const parent = this.parentElement
        if (!parent || !this.classList.contains('tab-button')) return 0
        const mode =
          this.closest('.workspace-nav')!.getAttribute('data-tab-mode')

        return (
          Array.from(parent.children).indexOf(this) *
          (mode === 'row' ? 100 : 50)
        )
      },
    })
    try {
      useAppStore.setState({ currentTab: 'notes' })
      resizeWindow(400)
      render(<TabBar />)
      const nav = screen.getByRole('navigation')
      expect(nav.style.getPropertyValue('--tab-x')).toBe('250px')

      resizeWindow(800)

      expect(nav.style.getPropertyValue('--tab-x')).toBe('500px')
    } finally {
      if (offsetLeft)
        Object.defineProperty(HTMLElement.prototype, 'offsetLeft', offsetLeft)
    }
  })
})
