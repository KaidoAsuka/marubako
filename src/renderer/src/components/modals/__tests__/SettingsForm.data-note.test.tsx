import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

// SettingsForm reads the launch settings asynchronously; let that settle inside act().
async function renderSettings(): Promise<void> {
  await act(async () => {
    render(<SettingsForm />)
  })
}

describe('SettingsForm: where the status bar notes went', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      modal: { kind: 'settings' },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('says at the top of the data page that the data stays on this computer', async () => {
    await renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-data'))

    const note = screen.getByTestId('settings-local-data')
    expect(note).toHaveTextContent(workspaceStrings.en.local_data!)
    const panel = note.closest('.settings-panel')!
    expect(panel.firstElementChild).toBe(note)
  })

  it('does not say it on the other pages', async () => {
    await renderSettings()

    expect(screen.queryByTestId('settings-local-data')).toBeNull()
    fireEvent.click(screen.getByTestId('settings-tab-behavior'))
    expect(screen.queryByTestId('settings-local-data')).toBeNull()
  })

  it('keeps the global shortcut on the behaviour page', async () => {
    // The shortcut is a setting now: the page shows the one that is saved (and registered).
    useAppStore.setState({
      data: {
        ...useAppStore.getState().data!,
        prefs: {
          ...useAppStore.getState().data!.prefs,
          shortcut: 'CommandOrControl+Shift+Space',
        },
      },
    })
    vi.mocked(window.quickLaunch.getLaunchSettings).mockResolvedValue({
      ok: true,
      data: {
        openAtLogin: false,
        canAutoStart: true,
        shortcut: 'Ctrl + Shift + Space',
        shortcutAvailable: true,
      },
    })
    await renderSettings()
    fireEvent.click(screen.getByTestId('settings-tab-behavior'))

    expect(
      await screen.findByText('Ctrl + Shift + Space', { selector: 'kbd' })
    ).toBeInTheDocument()
  })
})
