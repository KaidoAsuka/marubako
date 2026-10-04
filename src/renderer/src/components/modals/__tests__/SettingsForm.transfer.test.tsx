import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang } from '../../../../../shared/types'
import { extraStrings } from '../../../i18n/extras'
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

  it('asks for the backup, the file that can be imported again, with "Export data"', async () => {
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-export'))

    await vi.waitFor(() =>
      expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    )
    expect(window.quickLaunch.exportData).toHaveBeenCalledWith(
      useAppStore.getState().data,
      'json'
    )
  })

  it('asks for the list for reading with "Export as Markdown"', async () => {
    openDataPage('en')
    const button = screen.getByTestId('settings-export-markdown')
    expect(button).toHaveTextContent('Export as Markdown')

    fireEvent.click(button)

    await vi.waitFor(() =>
      expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    )
    expect(window.quickLaunch.exportData).toHaveBeenCalledWith(
      useAppStore.getState().data,
      'markdown'
    )
    // The question about the passwords and the file dialog are the main process's.
    expect(window.confirm).not.toHaveBeenCalled()
    expect(window.quickLaunch.importData).not.toHaveBeenCalled()
  })

  it('says the list was exported, not the backup', async () => {
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-export-markdown'))

    await vi.waitFor(() =>
      expect(useAppStore.getState().toast).toMatchObject({
        message: 'Markdown list exported',
        tone: 'success',
      })
    )
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'names the button, and says the passwords were left out of the list (%s)',
    async (lang) => {
      vi.mocked(window.quickLaunch.exportData).mockResolvedValueOnce({
        ok: true,
        data: {
          canceled: false,
          filePath: 'C:\\backup\\list.md',
          exportedAt: new Date().toISOString(),
          passwordsIncluded: false,
        },
      })
      openDataPage(lang)
      const button = screen.getByTestId('settings-export-markdown')
      expect(button).toHaveTextContent(extraStrings[lang].export_markdown!)

      fireEvent.click(button)

      await vi.waitFor(() =>
        expect(useAppStore.getState().toast?.message).toBe(
          extraStrings[lang].export_markdown_success_no_passwords
        )
      )
    }
  )

  it('says nothing after a list export that was canceled', async () => {
    vi.mocked(window.quickLaunch.exportData).mockResolvedValueOnce({
      ok: true,
      data: { canceled: true },
    })
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-export-markdown'))

    await vi.waitFor(() =>
      expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    )
    await vi.waitFor(() =>
      expect(screen.getByTestId('settings-export-markdown')).toBeEnabled()
    )
    expect(useAppStore.getState().toast).toBeNull()
  })

  it('says why when the list could not be written', async () => {
    vi.mocked(window.quickLaunch.exportData).mockResolvedValueOnce({
      ok: false,
      error: 'EACCES: permission denied',
    })
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-export-markdown'))

    await vi.waitFor(() =>
      expect(useAppStore.getState().toast).toMatchObject({
        message: 'EACCES: permission denied',
        tone: 'danger',
      })
    )
  })

  it('holds every transfer button while the list is being written, so that nothing starts twice', async () => {
    let finish: (value: unknown) => void = () => undefined
    vi.mocked(window.quickLaunch.exportData).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }) as never
    )
    openDataPage('en')
    const transfer = ['export', 'import', 'export-markdown'].map((name) =>
      screen.getByTestId(`settings-${name}`)
    )

    fireEvent.click(screen.getByTestId('settings-export-markdown'))

    await vi.waitFor(() =>
      expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    )
    for (const button of transfer) expect(button).toBeDisabled()
    fireEvent.click(screen.getByTestId('settings-export-markdown'))
    fireEvent.click(screen.getByTestId('settings-export'))
    expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)

    finish({ ok: true, data: { canceled: true } })
    await vi.waitFor(() => {
      for (const button of transfer) expect(button).toBeEnabled()
    })
  })

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
