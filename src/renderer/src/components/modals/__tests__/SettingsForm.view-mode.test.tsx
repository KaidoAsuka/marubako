import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang, ViewMode } from '../../../../../shared/types'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

function openAppearance(viewMode: ViewMode = 'grid', lang: Lang = 'en'): void {
  const data = createDefaultAppData()
  data.prefs.viewMode = viewMode
  data.prefs.lang = lang
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    modal: { kind: 'settings' },
  })
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-appearance'))
}

// The layout of the entries is a setting. The three pages that have the two layouts carry a switch
// for the same setting as well (SectionActions.test.tsx).
describe('SettingsForm item layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('offers grid and list as a segmented control with the current one selected', () => {
    openAppearance('list')

    const group = screen.getByRole('radiogroup', { name: 'Item layout' })
    expect(group).toHaveClass('segmented')
    expect(screen.getByRole('radio', { name: 'Grid' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('view-mode-list')).toHaveClass('active')
  })

  it('is one tab stop (the chosen option) and the arrow keys, Home and End choose and focus another', () => {
    openAppearance('grid')
    const grid = screen.getByTestId('view-mode-grid')
    const list = screen.getByTestId('view-mode-list')

    expect(grid).toHaveAttribute('tabindex', '0')
    expect(list).toHaveAttribute('tabindex', '-1')

    grid.focus()
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(list).toHaveAttribute('aria-checked', 'true')
    expect(list).toHaveAttribute('tabindex', '0')
    expect(grid).toHaveAttribute('tabindex', '-1')
    expect(document.activeElement).toBe(list)

    // Wraps at the ends.
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(grid).toHaveAttribute('aria-checked', 'true')
    expect(document.activeElement).toBe(grid)
    fireEvent.keyDown(grid, { key: 'End' })
    expect(list).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(grid).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(list).toHaveAttribute('aria-checked', 'true')
  })

  it('starts on the list for a fresh profile', () => {
    // The sample data as it is, with no layout chosen by the test.
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      error: null,
      modal: { kind: 'settings' },
    })
    render(<SettingsForm />)

    expect(screen.getByTestId('view-mode-list')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('view-mode-grid')).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('does not change the layout until the settings are saved, like the rest of the dialog', () => {
    openAppearance('grid')

    fireEvent.click(screen.getByTestId('view-mode-list'))

    expect(screen.getByTestId('view-mode-list')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(useAppStore.getState().data?.prefs.viewMode).toBe('grid')
  })

  it('saves the chosen layout into the preferences', async () => {
    openAppearance('grid')

    fireEvent.click(screen.getByTestId('view-mode-list'))
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() =>
      expect(useAppStore.getState().data?.prefs.viewMode).toBe('list')
    )
  })

  it('goes back to grid again', async () => {
    openAppearance('list')

    fireEvent.click(screen.getByTestId('view-mode-grid'))
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() =>
      expect(useAppStore.getState().data?.prefs.viewMode).toBe('grid')
    )
  })

  it.each(['zh', 'en', 'ja'] as const)('is labelled in %s', (lang) => {
    openAppearance('grid', lang)

    const strings = workspaceStrings[lang]
    expect(strings.view_mode).toBeTruthy()
    expect(
      screen.getByRole('radiogroup', { name: strings.view_mode! })
    ).toBeInTheDocument()
    expect(screen.getByTestId('view-mode-grid')).toHaveTextContent(
      strings.view_mode_grid!
    )
    expect(screen.getByTestId('view-mode-list')).toHaveTextContent(
      strings.view_mode_list!
    )
  })
})
