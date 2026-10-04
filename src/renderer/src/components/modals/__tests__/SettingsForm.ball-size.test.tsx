import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import {
  BALL_SIZE_STEP,
  DOCK_BALL_SIZE,
  MAX_BALL_SIZE,
  MIN_BALL_SIZE,
} from '../../../../../shared/dock-size'
import type { AppData } from '../../../../../shared/types'
import { extraStrings } from '../../../i18n/extras'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

function openBehaviorTab(
  configure: (data: AppData) => void = () => {}
): HTMLInputElement {
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  configure(data)
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    modal: { kind: 'settings' },
    previewPrefs: null,
  })
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-behavior'))
  return screen.getByTestId('ball-size') as HTMLInputElement
}

const savedPrefs = () =>
  (vi.mocked(window.quickLaunch.saveData).mock.calls[0]![0] as AppData).prefs

describe('SettingsForm ball size slider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('is a slider over the range of the setting, on the size of a new installation', () => {
    const slider = openBehaviorTab()

    expect(slider.type).toBe('range')
    expect(slider.min).toBe(String(MIN_BALL_SIZE))
    expect(slider.max).toBe(String(MAX_BALL_SIZE))
    expect(slider.step).toBe(String(BALL_SIZE_STEP))
    expect(slider.value).toBe(String(DOCK_BALL_SIZE))
    expect(slider.closest('.range-row')).toHaveTextContent('30 px')
  })

  it('is labelled by its title and says what a change does to the ball', () => {
    const slider = openBehaviorTab()

    expect(screen.getByLabelText('Bubble size')).toBe(slider)
    expect(
      screen.getByText(extraStrings.en.ball_size_hint!)
    ).toBeInTheDocument()
  })

  it.each(['zh', 'en', 'ja'] as const)('is labelled in %s', (lang) => {
    const slider = openBehaviorTab((data) => {
      data.prefs.lang = lang
    })

    expect(screen.getByLabelText(extraStrings[lang].ball_size!)).toBe(slider)
    expect(
      screen.getByText(extraStrings[lang].ball_size_hint!)
    ).toBeInTheDocument()
  })

  it('shows a stored size', () => {
    const slider = openBehaviorTab((data) => {
      data.prefs.ballSize = 48
    })

    expect(slider.value).toBe('48')
    expect(slider.closest('.range-row')).toHaveTextContent('48 px')
  })

  it('shows the size it is moved to, and saves nothing before Save', () => {
    const slider = openBehaviorTab()

    fireEvent.change(slider, { target: { value: '56' } })

    expect(slider.value).toBe('56')
    expect(slider.closest('.range-row')).toHaveTextContent('56 px')
    // The ball itself changes when the settings are saved: the main process applies the size then.
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    expect(useAppStore.getState().data?.prefs.ballSize).toBe(DOCK_BALL_SIZE)
  })

  it('saves the size as prefs.ballSize, a number, for the main process to apply at once', async () => {
    const slider = openBehaviorTab()

    fireEvent.change(slider, { target: { value: '56' } })
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().ballSize).toBe(56)
    expect(useAppStore.getState().data?.prefs.ballSize).toBe(56)
  })

  it('leaves a stored size alone when the slider was not touched', async () => {
    openBehaviorTab((data) => {
      data.prefs.ballSize = 42
    })

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().ballSize).toBe(42)
  })

  it('throws a size that was not saved away with Cancel', () => {
    const slider = openBehaviorTab()
    fireEvent.change(slider, { target: { value: '56' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    expect(useAppStore.getState().data?.prefs.ballSize).toBe(DOCK_BALL_SIZE)
  })

  it('is disabled while the ball is turned off: there is no ball to size', () => {
    const slider = openBehaviorTab()
    expect(slider).toBeEnabled()

    fireEvent.click(screen.getByTestId('show-bubble'))
    expect(slider).toBeDisabled()

    fireEvent.click(screen.getByTestId('show-bubble'))
    expect(slider).toBeEnabled()
  })

  it('is disabled for a ball that was saved as turned off, and still shows its size', () => {
    const slider = openBehaviorTab((data) => {
      data.prefs.showBubble = false
      data.prefs.ballSize = 48
    })

    expect(slider).toBeDisabled()
    expect(slider.value).toBe('48')
  })

  it('keeps the size when the ball is turned off and the settings are saved', async () => {
    const slider = openBehaviorTab()
    fireEvent.change(slider, { target: { value: '56' } })
    fireEvent.click(screen.getByTestId('show-bubble'))

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().showBubble).toBe(false)
    expect(savedPrefs().ballSize).toBe(56)
  })

  it('is disabled while the settings are being saved', () => {
    const slider = openBehaviorTab()

    act(() => useAppStore.setState({ saving: true }))

    expect(slider).toBeDisabled()
  })
})
