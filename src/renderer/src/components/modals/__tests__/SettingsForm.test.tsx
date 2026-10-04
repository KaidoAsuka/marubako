import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { LaunchSettings } from '../../../../../shared/types'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

const loginLabel = workspaceStrings.zh['launch_at_login'] ?? ''
const loginFailed = workspaceStrings.zh['launch_login_failed'] ?? ''

function reportLaunchSettings(openAtLogin: boolean): void {
  const data: LaunchSettings = {
    openAtLogin,
    canAutoStart: true,
    shortcut: 'Ctrl + Alt + Space',
    shortcutAvailable: true,
  }
  vi.mocked(window.quickLaunch.getLaunchSettings).mockResolvedValue({
    ok: true,
    data,
  })
}

async function openLoginSwitch(): Promise<HTMLElement> {
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-behavior'))
  const loginSwitch = await screen.findByRole('switch', {
    name: new RegExp(loginLabel),
  })
  // The switch stays disabled until the launch settings have been loaded.
  await waitFor(() => expect(loginSwitch).toBeEnabled())
  return loginSwitch
}

describe('SettingsForm login switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      saving: false,
      error: null,
      modal: { kind: 'settings' },
      toast: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the switch as on when start-with-Windows is already enabled', async () => {
    reportLaunchSettings(true)

    expect(await openLoginSwitch()).toBeChecked()
  })

  it('asks the main process to disable start-with-Windows once it is switched off and saved', async () => {
    reportLaunchSettings(true)
    const loginSwitch = await openLoginSwitch()
    expect(loginSwitch).toBeChecked()

    fireEvent.click(loginSwitch)
    expect(loginSwitch).not.toBeChecked()
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() =>
      expect(window.quickLaunch.setOpenAtLogin).toHaveBeenCalledWith(false)
    )
  })

  it('asks the main process to enable start-with-Windows once it is switched on and saved', async () => {
    reportLaunchSettings(false)
    const loginSwitch = await openLoginSwitch()
    expect(loginSwitch).not.toBeChecked()

    fireEvent.click(loginSwitch)
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() =>
      expect(window.quickLaunch.setOpenAtLogin).toHaveBeenCalledWith(true)
    )
  })

  it('leaves the login item alone when the switch was not touched', async () => {
    reportLaunchSettings(true)
    await openLoginSwitch()

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(window.quickLaunch.setOpenAtLogin).not.toHaveBeenCalled()
  })

  // The main process re-reads what Windows really has. When the Run key cannot be written (group
  // policy, security software) that answer differs from what the user asked for.
  describe('when Windows refuses the login item', () => {
    function refuseLoginItem(actual: boolean): void {
      vi.mocked(window.quickLaunch.setOpenAtLogin).mockResolvedValueOnce({
        ok: true,
        data: {
          openAtLogin: actual,
          canAutoStart: true,
          shortcut: 'Ctrl + Alt + Space',
          shortcutAvailable: true,
        },
      })
    }

    it('still saves the other settings but warns instead of claiming success', async () => {
      expect(loginFailed).not.toBe('')
      reportLaunchSettings(false)
      refuseLoginItem(false)
      const loginSwitch = await openLoginSwitch()
      fireEvent.click(loginSwitch)
      expect(loginSwitch).toBeChecked()
      fireEvent.click(screen.getByTestId('hide-after-launch'))

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() => expect(useAppStore.getState().modal).toBeNull())
      expect(window.quickLaunch.setOpenAtLogin).toHaveBeenCalledWith(true)
      expect(window.quickLaunch.saveData).toHaveBeenCalled()
      expect(useAppStore.getState().data?.prefs.hideAfterLaunch).toBe(true)
      // The warning is raised after the saves, so nothing replaces it.
      expect(useAppStore.getState().toast).toMatchObject({
        message: loginFailed,
        tone: 'danger',
      })
    })

    it('warns the same way when switching it off is refused', async () => {
      reportLaunchSettings(true)
      refuseLoginItem(true)
      const loginSwitch = await openLoginSwitch()
      fireEvent.click(loginSwitch)

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() => expect(useAppStore.getState().modal).toBeNull())
      expect(useAppStore.getState().toast?.message).toBe(loginFailed)
    })

    it('puts the switch back to what Windows has and leaves a save error alone', async () => {
      reportLaunchSettings(false)
      refuseLoginItem(false)
      vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
        ok: false,
        error: 'disk full',
      })
      const loginSwitch = await openLoginSwitch()
      fireEvent.click(loginSwitch)
      expect(loginSwitch).toBeChecked()

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() => expect(loginSwitch).not.toBeChecked())
      await waitFor(() =>
        expect(useAppStore.getState().toast?.message).toBe('disk full')
      )
      expect(useAppStore.getState().modal).not.toBeNull()
    })

    it('says nothing at all when the login item did take effect', async () => {
      reportLaunchSettings(false)
      const loginSwitch = await openLoginSwitch()
      fireEvent.click(loginSwitch)

      fireEvent.click(screen.getByTestId('settings-save'))

      await waitFor(() => expect(useAppStore.getState().modal).toBeNull())
      expect(window.quickLaunch.saveData).toHaveBeenCalled()
      // A successful save is no news: no "saved" message in the feedback strip.
      expect(useAppStore.getState().toast).toBeNull()
    })
  })
})
