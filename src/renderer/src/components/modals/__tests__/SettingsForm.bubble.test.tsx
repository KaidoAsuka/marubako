import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

function openBehaviorTab(): HTMLInputElement {
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-behavior'))
  return screen.getByTestId('show-bubble') as HTMLInputElement
}

describe('SettingsForm floating ball switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      saving: false,
      error: null,
      modal: { kind: 'settings' },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('is on by default and labelled in the user language', () => {
    const toggle = openBehaviorTab()

    expect(toggle).toBeChecked()
    expect(screen.getByRole('switch', { name: /收起时显示悬浮球/ })).toBe(
      toggle
    )
  })

  it('says what turning it off does to the shortcut, Esc and collapse', () => {
    openBehaviorTab()

    expect(
      screen.getByText(/快捷键、Esc 和收起操作会直接把面板隐藏到系统托盘/)
    ).toBeInTheDocument()
  })

  it('shows a stored off value', () => {
    const data = createDefaultAppData()
    data.prefs.showBubble = false
    useAppStore.setState({ data })

    expect(openBehaviorTab()).not.toBeChecked()
  })

  it('saves the preference so the main process can apply it at once', async () => {
    const toggle = openBehaviorTab()

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() =>
      expect(window.quickLaunch.saveData).toHaveBeenCalledWith(
        expect.objectContaining({
          prefs: expect.objectContaining({ showBubble: false }),
        })
      )
    )
    expect(useAppStore.getState().data?.prefs.showBubble).toBe(false)
  })

  it('leaves the preference alone when the switch was not touched', async () => {
    openBehaviorTab()

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(useAppStore.getState().data?.prefs.showBubble).toBe(true)
  })
})
