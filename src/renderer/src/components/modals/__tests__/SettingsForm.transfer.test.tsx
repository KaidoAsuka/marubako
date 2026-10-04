import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang } from '../../../../../shared/types'
import { safetyStrings } from '../../../i18n/safety'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

function openDataPage(lang: Lang = 'en'): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    toast: null,
    modal: { kind: 'settings' },
  })
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-data'))
}

describe('exporting and importing from the settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('goes straight to the main process to import: it asks, once the file is chosen', async () => {
    openDataPage()

    fireEvent.click(screen.getByTestId('settings-import'))

    await vi.waitFor(() =>
      expect(window.quickLaunch.importData).toHaveBeenCalledTimes(1)
    )
    // No browser confirm() with the system's button words, ahead of the file picker.
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('says "exported" after an export with the passwords', async () => {
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-export'))

    await vi.waitFor(() =>
      expect(useAppStore.getState().toast?.message).toBe('Backup exported')
    )
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'says the passwords were left out after an export without them (%s)',
    async (lang) => {
      vi.mocked(window.quickLaunch.exportData).mockResolvedValueOnce({
        ok: true,
        data: {
          canceled: false,
          filePath: 'C:\\backup\\export.json',
          exportedAt: new Date().toISOString(),
          passwordsIncluded: false,
        },
      })
      openDataPage(lang)

      fireEvent.click(screen.getByTestId('settings-export'))

      await vi.waitFor(() =>
        expect(useAppStore.getState().toast?.message).toBe(
          safetyStrings[lang].export_success_no_passwords
        )
      )
    }
  )

  it('says nothing after an export that was canceled', async () => {
    vi.mocked(window.quickLaunch.exportData).mockResolvedValueOnce({
      ok: true,
      data: { canceled: true },
    })
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-export'))

    await vi.waitFor(() =>
      expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    )
    await vi.waitFor(() =>
      expect(screen.getByTestId('settings-export')).toBeEnabled()
    )
    expect(useAppStore.getState().toast).toBeNull()
  })
})
