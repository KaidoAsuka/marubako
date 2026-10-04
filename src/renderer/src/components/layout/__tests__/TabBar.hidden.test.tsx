import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang, Tab } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import TabBar from '../TabBar'

function load(hiddenTabs: Tab[], lang: Lang = 'en'): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  data.prefs.hiddenTabs = hiddenTabs
  useAppStore.setState({ data, currentTab: 'folders' })
}

const ids = (): string[] =>
  screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('data-testid') ?? '')

describe('TabBar with hidden categories', () => {
  beforeEach(() => {
    load([])
  })

  afterEach(() => {
    cleanup()
  })

  it('shows all seven categories by default, in order', () => {
    render(<TabBar />)

    expect(ids().filter((id) => id.startsWith('tab-'))).toEqual([
      'tab-folders',
      'tab-websites',
      'tab-apps',
      'tab-passwords',
      'tab-commands',
      'tab-notes',
      'tab-tasks',
    ])
  })

  it('draws no tab for a hidden category', () => {
    load(['apps', 'notes'])
    render(<TabBar />)

    expect(screen.queryByTestId('tab-apps')).toBeNull()
    expect(screen.queryByTestId('tab-notes')).toBeNull()
    expect(ids().filter((id) => id.startsWith('tab-'))).toEqual([
      'tab-folders',
      'tab-websites',
      'tab-passwords',
      'tab-commands',
      'tab-tasks',
    ])
  })

  it('numbers the shortcut by position among the visible tabs', () => {
    load(['websites', 'passwords'])
    render(<TabBar />)

    expect(screen.getByTestId('tab-folders')).toHaveAttribute(
      'title',
      expect.stringContaining('Alt+1')
    )
    expect(screen.getByTestId('tab-apps')).toHaveAttribute(
      'title',
      expect.stringContaining('Alt+2')
    )
    expect(screen.getByTestId('tab-commands')).toHaveAttribute(
      'title',
      expect.stringContaining('Alt+3')
    )
    expect(screen.getByTestId('tab-tasks')).toHaveAttribute(
      'title',
      expect.stringContaining('Alt+5')
    )
  })

  it('follows a change of the setting without a reload', () => {
    render(<TabBar />)
    expect(screen.getByTestId('tab-notes')).toBeInTheDocument()

    cleanup()
    load(['notes'])
    render(<TabBar />)

    expect(screen.queryByTestId('tab-notes')).toBeNull()
  })

  it('still opens the visible categories on click', () => {
    load(['folders'])
    useAppStore.setState({ currentTab: 'websites' })
    render(<TabBar />)

    fireEvent.click(screen.getByTestId('tab-tasks'))

    expect(useAppStore.getState().currentTab).toBe('tasks')
  })

  it('keeps a single visible category on screen', () => {
    load([
      'folders',
      'websites',
      'apps',
      'passwords',
      'commands',
      'notes',
      'tasks',
    ])
    render(<TabBar />)

    // The list is normalised: the first category cannot be hidden.
    expect(ids().filter((id) => id.startsWith('tab-'))).toEqual(['tab-folders'])
  })

  it('reports the number of visible categories to the layout (data-tab-count)', () => {
    load(['apps', 'notes', 'tasks'])
    const { container } = render(<TabBar />)

    expect(
      container.querySelector('.workspace-nav')?.getAttribute('data-tab-count')
    ).toBe('4')
  })
})
