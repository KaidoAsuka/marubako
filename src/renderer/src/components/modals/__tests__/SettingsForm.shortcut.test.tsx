import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SHORTCUT,
  formatAccelerator,
} from '../../../../../shared/accelerator'
import { createDefaultAppData } from '../../../../../shared/default-data'
import type {
  AppData,
  LaunchSettings,
  Lang,
  ShortcutCheckResult,
} from '../../../../../shared/types'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

const state = () => useAppStore.getState()
const text = (key: string, lang: Lang = 'en') => workspaceStrings[lang][key]!
// The shortcut of a new installation, as it is stored and as it reads.
const DEFAULT_TEXT = formatAccelerator(DEFAULT_SHORTCUT)

function reportLaunch(overrides: Partial<LaunchSettings> = {}): void {
  vi.mocked(window.quickLaunch.getLaunchSettings).mockResolvedValue({
    ok: true,
    data: {
      openAtLogin: false,
      canAutoStart: true,
      shortcut: DEFAULT_TEXT,
      shortcutAvailable: true,
      shortcutAccelerator: DEFAULT_SHORTCUT,
      shortcutEnabled: true,
      ...overrides,
    },
  })
}

function answerChecks(result: ShortcutCheckResult): void {
  vi.mocked(window.quickLaunch.checkShortcut).mockResolvedValue({
    ok: true,
    data: result,
  })
}

async function open(
  configure: (data: AppData) => void = () => {}
): Promise<void> {
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  configure(data)
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    modal: { kind: 'settings' },
    toast: null,
  })
  await act(async () => {
    render(<SettingsForm />)
  })
  fireEvent.click(screen.getByTestId('settings-tab-behavior'))
}

const change = () => screen.getByTestId('shortcut-change')
const status = () => screen.queryByTestId('shortcut-status')
const keys = (
  code: string,
  modifiers: Partial<{
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    metaKey: boolean
  }> = {}
) => fireEvent.keyDown(change(), { code, key: code, ...modifiers })

async function record(
  code: string,
  modifiers: Parameters<typeof keys>[1]
): Promise<void> {
  fireEvent.click(change())
  await act(async () => {
    keys(code, modifiers)
  })
}

const savedPrefs = () =>
  (vi.mocked(window.quickLaunch.saveData).mock.calls[0]![0] as AppData).prefs

describe('SettingsForm: the global shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reportLaunch()
    answerChecks({ status: 'free' })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('shows the saved shortcut as it reads, with the switch on', async () => {
    await open()

    expect(DEFAULT_SHORTCUT).toBe('CommandOrControl+Shift+Space')
    expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
      'Ctrl + Shift + Space'
    )
    expect(screen.getByTestId('shortcut-enabled')).toBeChecked()
    expect(status()).toBeNull()
    expect(window.quickLaunch.checkShortcut).not.toHaveBeenCalled()
  })

  it('shows a shortcut that was changed earlier', async () => {
    await open((data) => {
      data.prefs.shortcut = 'CommandOrControl+Alt+Q'
    })

    expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
      'Ctrl + Alt + Q'
    )
  })

  describe('recording a new one', () => {
    it('waits for the keys, and takes the combination that is pressed', async () => {
      await open()

      fireEvent.click(change())
      expect(change()).toHaveTextContent(text('shortcut_recording'))
      expect(status()).toHaveTextContent(text('shortcut_recording_hint'))

      await act(async () => {
        keys('KeyQ', { ctrlKey: true, altKey: true })
      })

      expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
        'Ctrl + Alt + Q'
      )
      expect(change()).not.toHaveAttribute('data-recording')
    })

    it('keeps waiting while only modifiers are down', async () => {
      await open()
      fireEvent.click(change())

      keys('ControlLeft', { ctrlKey: true })
      keys('AltLeft', { ctrlKey: true, altKey: true })

      expect(change()).toHaveAttribute('data-recording')
      expect(change()).toHaveTextContent(text('shortcut_recording'))
    })

    it('refuses a combination with too few modifiers, says why, and keeps recording', async () => {
      await open()
      fireEvent.click(change())

      keys('KeyK', { ctrlKey: true })

      expect(status()).toHaveTextContent(text('shortcut_invalid_modifiers'))
      expect(status()).toHaveAttribute('data-tone', 'bad')
      expect(change()).toHaveAttribute('data-recording')
      expect(window.quickLaunch.checkShortcut).not.toHaveBeenCalled()
    })

    it('refuses a bare key, and a key a global shortcut cannot use', async () => {
      await open()
      fireEvent.click(change())

      keys('KeyA')
      expect(status()).toHaveTextContent(text('shortcut_invalid_modifiers'))

      keys('Comma', { ctrlKey: true, altKey: true })
      expect(status()).toHaveTextContent(text('shortcut_invalid_format'))
    })

    it('refuses Ctrl+Alt+Delete, which Windows keeps', async () => {
      await open()
      fireEvent.click(change())

      keys('Delete', { ctrlKey: true, altKey: true })

      expect(status()).toHaveTextContent(text('shortcut_invalid_reserved'))
    })

    it('cancels on Escape without closing the dialog', async () => {
      await open()
      fireEvent.click(change())

      const event = fireEvent.keyDown(change(), {
        code: 'Escape',
        key: 'Escape',
      })

      // The event was handled (default prevented) so the dialog's own Escape handler leaves it alone.
      expect(event).toBe(false)
      expect(change()).not.toHaveAttribute('data-recording')
      expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
        DEFAULT_TEXT
      )
      expect(state().modal).toEqual({ kind: 'settings' })
    })

    it('does not let the keys it records reach the rest of the page', async () => {
      await open()
      fireEvent.click(change())
      const reached = vi.fn()
      window.addEventListener('keydown', reached)
      try {
        keys('KeyQ', { ctrlKey: true, altKey: true })
      } finally {
        window.removeEventListener('keydown', reached)
      }

      expect(reached).not.toHaveBeenCalled()
    })

    it('stops recording when the focus moves away', async () => {
      await open()
      fireEvent.click(change())

      fireEvent.blur(change())

      expect(change()).not.toHaveAttribute('data-recording')
    })

    it('does nothing for keys pressed while it is not recording', async () => {
      await open()

      keys('KeyQ', { ctrlKey: true, altKey: true })

      expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
        DEFAULT_TEXT
      )
    })
  })

  describe('checking a new combination', () => {
    it('asks the main process about the combination that was recorded, and says it is free', async () => {
      await open()

      await record('KeyQ', { ctrlKey: true, altKey: true })

      await waitFor(() =>
        expect(window.quickLaunch.checkShortcut).toHaveBeenCalledWith(
          'CommandOrControl+Alt+Q'
        )
      )
      await waitFor(() =>
        expect(status()).toHaveTextContent(text('shortcut_free'))
      )
      expect(status()).toHaveAttribute('data-tone', 'good')
      expect(screen.getByTestId('settings-save')).toBeEnabled()
    })

    it('refuses a combination another program holds, and does not let it be saved', async () => {
      answerChecks({ status: 'taken' })
      await open()

      await record('KeyQ', { ctrlKey: true, altKey: true })

      await waitFor(() =>
        expect(status()).toHaveTextContent(text('shortcut_taken'))
      )
      expect(status()).toHaveAttribute('data-tone', 'bad')
      expect(screen.getByTestId('settings-save')).toBeDisabled()
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })

    it('lets another combination be chosen after a taken one', async () => {
      answerChecks({ status: 'taken' })
      await open()
      await record('KeyQ', { ctrlKey: true, altKey: true })
      await waitFor(() =>
        expect(screen.getByTestId('settings-save')).toBeDisabled()
      )

      answerChecks({ status: 'free' })
      await record('KeyW', { ctrlKey: true, altKey: true })

      await waitFor(() =>
        expect(screen.getByTestId('settings-save')).toBeEnabled()
      )
      expect(status()).toHaveTextContent(text('shortcut_free'))
    })

    it('holds Save while the check is still running, so a quick click cannot skip it', async () => {
      let answer: (value: unknown) => void = () => {}
      vi.mocked(window.quickLaunch.checkShortcut).mockReturnValue(
        new Promise((resolve) => {
          answer = resolve
        }) as never
      )
      await open()

      await record('KeyQ', { ctrlKey: true, altKey: true })

      expect(status()).toHaveTextContent(text('shortcut_checking'))
      expect(screen.getByTestId('settings-save')).toBeDisabled()

      await act(async () => {
        answer({ ok: true, data: { status: 'free' } })
      })
      expect(screen.getByTestId('settings-save')).toBeEnabled()
    })

    it('does not check the combination that is already saved', async () => {
      await open()

      await record('Space', { ctrlKey: true, shiftKey: true })

      expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
        DEFAULT_TEXT
      )
      expect(window.quickLaunch.checkShortcut).not.toHaveBeenCalled()
      expect(screen.getByTestId('settings-save')).toBeEnabled()
    })

    it('checks the default of older versions like any other new combination', async () => {
      await open()

      await record('Space', { ctrlKey: true, altKey: true })

      await waitFor(() =>
        expect(window.quickLaunch.checkShortcut).toHaveBeenCalledWith(
          'CommandOrControl+Alt+Space'
        )
      )
    })

    it('does not hold Save when the check itself failed', async () => {
      vi.mocked(window.quickLaunch.checkShortcut).mockResolvedValue({
        ok: false,
        error: 'no',
      })
      await open()

      await record('KeyQ', { ctrlKey: true, altKey: true })

      await waitFor(() =>
        expect(screen.getByTestId('settings-save')).toBeEnabled()
      )
    })

    it('forgets the check when the choice goes back to the saved one', async () => {
      answerChecks({ status: 'taken' })
      await open()
      await record('KeyQ', { ctrlKey: true, altKey: true })
      await waitFor(() =>
        expect(status()).toHaveTextContent(text('shortcut_taken'))
      )

      fireEvent.click(screen.getByTestId('shortcut-reset'))

      expect(status()).toBeNull()
      expect(screen.getByTestId('settings-save')).toBeEnabled()
    })
  })

  describe('saving', () => {
    it('saves the new combination with the other settings', async () => {
      await open()
      await record('KeyQ', { ctrlKey: true, altKey: true })
      await waitFor(() =>
        expect(status()).toHaveTextContent(text('shortcut_free'))
      )

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(savedPrefs().shortcut).toBe('CommandOrControl+Alt+Q')
      expect(savedPrefs().shortcutEnabled).toBe(true)
    })

    it('changes nothing until it is saved, and Cancel leaves the saved shortcut alone', async () => {
      await open()
      await record('KeyQ', { ctrlKey: true, altKey: true })

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(state().data?.prefs.shortcut).toBe(DEFAULT_SHORTCUT)
    })

    it('resets to the default combination', async () => {
      await open((data) => {
        data.prefs.shortcut = 'CommandOrControl+Alt+Q'
      })

      fireEvent.click(screen.getByTestId('shortcut-reset'))
      // The default is tried on the system like any other new choice.
      await waitFor(() =>
        expect(screen.getByTestId('settings-save')).toBeEnabled()
      )
      fireEvent.click(screen.getByTestId('settings-save'))

      expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
        DEFAULT_TEXT
      )
      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(savedPrefs().shortcut).toBe(DEFAULT_SHORTCUT)
    })

    it('has nothing to reset while the default is chosen', async () => {
      await open()

      expect(screen.getByTestId('shortcut-reset')).toBeDisabled()
    })

    it('warns when the main process could not register the new shortcut after all', async () => {
      await open()
      await record('KeyQ', { ctrlKey: true, altKey: true })
      await waitFor(() =>
        expect(status()).toHaveTextContent(text('shortcut_free'))
      )
      // Another program took the combination between the check and the save.
      reportLaunch({
        shortcut: 'Ctrl + Alt + Q',
        shortcutAvailable: false,
        shortcutAccelerator: 'CommandOrControl+Alt+Q',
      })

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() =>
        expect(state().toast?.message).toBe(text('shortcut_unavailable'))
      )
      expect(state().toast?.tone).toBe('danger')
    })

    it('says nothing about the shortcut when it was not touched', async () => {
      reportLaunch({ shortcutAvailable: false })
      await open()

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      await waitFor(() => expect(state().modal).toBeNull())
      expect(state().toast).toBeNull()
    })
  })

  describe('turning it off', () => {
    it('hides the combination, says how the panel opens instead, and saves it as off', async () => {
      await open()

      fireEvent.click(screen.getByTestId('shortcut-enabled'))

      expect(screen.queryByTestId('shortcut-change')).toBeNull()
      expect(status()).toHaveTextContent(text('shortcut_off_note'))
      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(savedPrefs().shortcutEnabled).toBe(false)
      // The choice itself is kept for when it is switched on again.
      expect(savedPrefs().shortcut).toBe(DEFAULT_SHORTCUT)
    })

    it('shows a shortcut that is saved as off', async () => {
      await open((data) => {
        data.prefs.shortcutEnabled = false
        data.prefs.shortcut = 'CommandOrControl+Alt+Q'
      })

      expect(screen.getByTestId('shortcut-enabled')).not.toBeChecked()

      fireEvent.click(screen.getByTestId('shortcut-enabled'))

      expect(screen.getByTestId('shortcut-value')).toHaveTextContent(
        'Ctrl + Alt + Q'
      )
    })

    it('can be saved without trying the combination, since nothing is registered', async () => {
      answerChecks({ status: 'taken' })
      await open()
      await record('KeyQ', { ctrlKey: true, altKey: true })
      await waitFor(() =>
        expect(screen.getByTestId('settings-save')).toBeDisabled()
      )

      fireEvent.click(screen.getByTestId('shortcut-enabled'))

      expect(screen.getByTestId('settings-save')).toBeEnabled()
    })
  })

  describe('the state of the saved shortcut', () => {
    it('says so when another program holds it, with the way out', async () => {
      reportLaunch({ shortcutAvailable: false })

      await open()

      await waitFor(() =>
        expect(status()).toHaveTextContent(text('shortcut_unavailable'))
      )
      expect(status()).toHaveAttribute('data-tone', 'bad')
    })

    it('says nothing while it works', async () => {
      reportLaunch({ shortcutAvailable: true })

      await open()

      expect(status()).toBeNull()
    })

    it('does not call a shortcut that was turned off a conflict', async () => {
      reportLaunch({ shortcutAvailable: false, shortcutEnabled: false })

      await open((data) => {
        data.prefs.shortcutEnabled = false
      })

      expect(status()).toHaveTextContent(text('shortcut_off_note'))
    })
  })

  describe('the words', () => {
    it.each(['zh', 'en', 'ja'] as const)('exist in %s', (lang) => {
      for (const key of [
        'shortcut_change',
        'shortcut_reset',
        'shortcut_recording',
        'shortcut_recording_hint',
        'shortcut_checking',
        'shortcut_free',
        'shortcut_taken',
        'shortcut_off_note',
        'shortcut_invalid_modifiers',
        'shortcut_invalid_reserved',
        'shortcut_invalid_format',
        'shortcut_unavailable',
      ])
        expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
    })
  })
})
