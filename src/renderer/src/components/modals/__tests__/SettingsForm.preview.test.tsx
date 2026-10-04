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
import type { AppData, Lang } from '../../../../../shared/types'
import { translations } from '../../../i18n/translations'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

const state = () => useAppStore.getState()

function open(configure: (data: AppData) => void = () => {}): void {
  const data = createDefaultAppData()
  data.prefs.lang = 'en'
  configure(data)
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    currentTab: 'folders',
    modal: { kind: 'settings' },
    toast: null,
    previewPrefs: null,
  })
  render(<SettingsForm />)
}

const slider = (id: string): HTMLInputElement =>
  document.getElementById(id) as HTMLInputElement

const savedPrefs = () =>
  (vi.mocked(window.quickLaunch.saveData).mock.calls[0]![0] as AppData).prefs

describe('SettingsForm appearance preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('shows the theme at once, before anything is saved', () => {
    open()
    expect(state().previewPrefs?.theme).toBe('dark')

    fireEvent.click(screen.getByTestId('theme-light'))

    expect(state().previewPrefs?.theme).toBe('light')
    expect(state().data?.prefs.theme).toBe('dark')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('previews the accent colour, the interface size and the animation duration', () => {
    open()

    fireEvent.click(screen.getByTestId('background-sunset'))
    fireEvent.change(slider('settings-font-size'), { target: { value: '125' } })
    fireEvent.change(slider('settings-motion'), { target: { value: '80' } })

    expect(state().previewPrefs).toMatchObject({
      background: 'sunset',
      zoom: 1.25,
      motion: 1.08,
    })
    expect(state().data?.prefs).toMatchObject({
      background: 'aurora',
      zoom: 1,
      motion: 1.35,
    })
  })

  it('shows the opacity on the real window through the main process, not as saved data', () => {
    open()

    fireEvent.change(slider('settings-opacity'), { target: { value: '60' } })

    expect(window.quickLaunch.window.previewOpacity).toHaveBeenLastCalledWith(
      0.6
    )
    expect(window.quickLaunch.window.setOpacity).not.toHaveBeenCalled()
    expect(state().data?.prefs.opacity).toBe(1)
  })

  it('puts everything back when the dialog is cancelled', () => {
    open()
    fireEvent.click(screen.getByTestId('theme-light'))
    fireEvent.change(slider('settings-opacity'), { target: { value: '60' } })
    expect(state().previewPrefs).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(state().modal).toBeNull()
    expect(state().previewPrefs).toBeNull()
    expect(window.quickLaunch.window.previewOpacity).toHaveBeenLastCalledWith(
      null
    )
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    expect(state().data?.prefs.theme).toBe('dark')
  })

  it('puts everything back as soon as the dialog starts closing, not when its exit animation ends', () => {
    open()
    fireEvent.click(screen.getByTestId('theme-light'))
    expect(state().previewPrefs?.theme).toBe('light')

    // The dialog is still mounted while it fades out, but its modal is gone.
    act(() => state().setModal(null))

    expect(state().previewPrefs).toBeNull()
    expect(window.quickLaunch.window.previewOpacity).toHaveBeenLastCalledWith(
      null
    )
  })

  it('puts everything back when the dialog is simply unmounted', () => {
    open()
    fireEvent.click(screen.getByTestId('theme-light'))

    cleanup()

    expect(state().previewPrefs).toBeNull()
  })

  it('keeps what was previewed once it is saved, and stops previewing', async () => {
    open()
    fireEvent.click(screen.getByTestId('theme-light'))
    fireEvent.change(slider('settings-opacity'), { target: { value: '60' } })

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(state().modal).toBeNull())
    expect(state().data?.prefs.theme).toBe('light')
    expect(state().previewPrefs).toBeNull()
    expect(window.quickLaunch.window.setOpacity).toHaveBeenCalledWith(0.6)
    expect(savedPrefs().theme).toBe('light')
    expect(savedPrefs().opacity).toBe(0.6)
  })

  it('keeps previewing, and the dialog open, when saving fails', async () => {
    open()
    fireEvent.click(screen.getByTestId('theme-light'))
    vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
      ok: false,
      error: 'disk full',
    })

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(state().error).toBe('disk full'))
    expect(state().modal).toEqual({ kind: 'settings' })
    expect(state().previewPrefs?.theme).toBe('light')
    // What was edited is still in the dialog, to be saved again.
    expect(screen.getByTestId('theme-light')).toHaveClass('active')
  })

  it('does not throw away an edit that was not saved when the data changes without changing the settings', async () => {
    open()
    fireEvent.change(slider('settings-opacity'), { target: { value: '60' } })

    // The same settings arrive again as a new object, as after a failed save.
    act(() => {
      useAppStore.setState({
        data: structuredClone(useAppStore.getState().data!),
      })
    })

    expect(slider('settings-opacity').value).toBe('60')
  })

  it('follows settings that really changed underneath it, an import for one', async () => {
    open()

    act(() => {
      const data = structuredClone(useAppStore.getState().data!)
      data.prefs.theme = 'light'
      useAppStore.setState({ data, dataEpoch: state().dataEpoch + 1 })
    })

    expect(screen.getByTestId('theme-light')).toHaveClass('active')
  })
})

describe('SettingsForm opacity and motion sliders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('stops the opacity slider at 40%, so the window cannot be made nearly invisible', () => {
    open()

    expect(slider('settings-opacity').min).toBe('40')
    expect(slider('settings-opacity').max).toBe('100')
  })

  it('shows an opacity below the limit (set by an older version) at the limit', () => {
    open((data) => {
      data.prefs.opacity = 0.2
    })

    expect(slider('settings-opacity').value).toBe('40')
  })

  it('shows the standard animation duration as 100%, not as 135%', () => {
    open()

    expect(slider('settings-motion').value).toBe('100')
    expect(slider('settings-motion').closest('.range-row')).toHaveTextContent(
      '100%'
    )
    expect(slider('settings-motion').min).toBe('60')
    expect(slider('settings-motion').max).toBe('160')
  })

  it('shows a saved duration as its share of the standard one', () => {
    open((data) => {
      data.prefs.motion = 1.08
    })

    expect(slider('settings-motion').value).toBe('80')
  })

  it('saves a moved slider on the stored scale (80% of the standard is 1.08)', async () => {
    open()

    fireEvent.change(slider('settings-motion'), { target: { value: '80' } })
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().motion).toBe(1.08)
  })

  it('leaves a stored duration alone when the slider was not touched', async () => {
    // 2.2 was reachable with the old slider and is past the end of the new one.
    open((data) => {
      data.prefs.motion = 2.2
    })
    expect(slider('settings-motion').value).toBe('160')

    fireEvent.click(screen.getByTestId('theme-light'))
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().motion).toBe(2.2)
  })

  it('moves a value that is between two steps only when the slider moves', async () => {
    open((data) => {
      data.prefs.motion = 1.4
    })
    expect(slider('settings-motion').value).toBe('105')

    fireEvent.click(screen.getByTestId('settings-save'))
    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().motion).toBe(1.4)
  })
})

describe('SettingsForm explains what each control does', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('says on the appearance page that changes preview and need Save', () => {
    open()

    expect(screen.getByTestId('settings-preview-note')).toHaveTextContent(
      /preview/i
    )
    expect(screen.getByTestId('settings-preview-note')).toHaveTextContent(
      /Save/
    )
  })

  it('names what the three sliders do', () => {
    open()

    expect(screen.getByText(/100% is fully solid/)).toBeInTheDocument()
    expect(
      screen.getByText(/100% is the standard duration/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/dialogs and search keep their size/)
    ).toBeInTheDocument()
  })

  it('says that the pin switch takes effect at once and is not part of Save', () => {
    open()
    fireEvent.click(screen.getByTestId('settings-tab-behavior'))

    expect(screen.getByText(/Takes effect at once/)).toBeInTheDocument()
  })

  it('keeps the pin switch immediate: it does not wait for Save and Cancel does not undo it', async () => {
    open()
    fireEvent.click(screen.getByTestId('settings-tab-behavior'))

    fireEvent.click(screen.getByTestId('pin-panel'))
    await waitFor(() =>
      expect(window.quickLaunch.window.togglePin).toHaveBeenCalledTimes(1)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(window.quickLaunch.window.togglePin).toHaveBeenCalledTimes(1)
  })
})

describe('settings labels that used to say the opposite', () => {
  it.each([
    ['zh', '不透明度'],
    ['ja', '不透明度'],
    ['en', 'Opacity'],
  ] as const)(
    'call the opacity slider %s "%s": 100% is solid',
    (lang, label) => {
      expect(translations[lang].strings.opacity).toBe(label)
    }
  )

  it.each(['zh', 'ja'] as const)(
    'do not call opacity "transparency" in %s',
    (lang) => {
      expect(translations[lang].strings.opacity).not.toBe('透明度')
    }
  )

  it.each(['zh', 'en', 'ja'] as const)(
    'explain opacity, duration and size in %s',
    (lang: Lang) => {
      for (const key of [
        'opacity_hint',
        'motion_hint',
        'font_size_hint',
        'settings_preview_note',
        'pin_panel_hint',
      ])
        expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
    }
  )

  it.each(['zh', 'en', 'ja'] as const)(
    'state the 40% limit of the opacity slider in %s',
    (lang: Lang) => {
      expect(workspaceStrings[lang].opacity_hint).toContain('40%')
    }
  )

  it.each(['zh', 'en', 'ja'] as const)(
    'say the pin switch needs no saving in %s',
    (lang: Lang) => {
      expect(workspaceStrings[lang].pin_panel_hint).toBeTruthy()
    }
  )

  it.each(['zh', 'en', 'ja'] as const)(
    'do not call the interface size "font size" in %s: dialogs do not follow it',
    (lang: Lang) => {
      expect(translations[lang].strings.font_size).not.toMatch(/字体|Font|文字/)
    }
  )
})
