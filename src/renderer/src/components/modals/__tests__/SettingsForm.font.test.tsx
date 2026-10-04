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
import type { AppData } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

type FontWindow = {
  queryLocalFonts?: () => Promise<Array<{ family: string }>>
}

// jsdom has no Local Font Access API: the fonts of this PC are what the test says.
const fontWindow = window as unknown as FontWindow

const state = () => useAppStore.getState()

/** Opens the dialog (the appearance page is the first one) and waits for the list of fonts. */
async function open(
  configure: (data: AppData) => void = () => {}
): Promise<HTMLSelectElement> {
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
  await screen.findByRole('option', { name: 'Arial' })
  return screen.getByTestId('settings-font-family') as HTMLSelectElement
}

const savedPrefs = () =>
  (vi.mocked(window.quickLaunch.saveData).mock.calls[0]![0] as AppData).prefs

describe('SettingsForm font', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fontWindow.queryLocalFonts = async () =>
      ['Yu Gothic UI', 'Arial', 'Segoe UI'].map((family) => ({ family }))
  })

  afterEach(() => {
    cleanup()
    delete fontWindow.queryLocalFonts
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('offers the font on the appearance page, on the default for a new installation', async () => {
    const select = await open()

    expect(screen.getByLabelText('Font')).toBe(select)
    expect(select.value).toBe('')
    expect([...select.options].map((option) => option.value)).toEqual([
      '',
      'Arial',
      'Segoe UI',
      'Yu Gothic UI',
    ])
  })

  it('shows a chosen font at once, before anything is saved', async () => {
    const select = await open()
    expect(state().previewPrefs?.fontFamily).toBe('')

    fireEvent.change(select, { target: { value: 'Arial' } })

    expect(select.value).toBe('Arial')
    expect(state().previewPrefs?.fontFamily).toBe('Arial')
    expect(state().data?.prefs.fontFamily).toBe('')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('saves the chosen font as prefs.fontFamily, and stops previewing', async () => {
    const select = await open()
    fireEvent.change(select, { target: { value: 'Arial' } })

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(state().modal).toBeNull())
    expect(savedPrefs().fontFamily).toBe('Arial')
    expect(state().data?.prefs.fontFamily).toBe('Arial')
    expect(state().previewPrefs).toBeNull()
  })

  it('puts the saved font back when the dialog is cancelled', async () => {
    const select = await open((data) => {
      data.prefs.fontFamily = 'Segoe UI'
    })
    fireEvent.change(select, { target: { value: 'Arial' } })
    expect(state().previewPrefs?.fontFamily).toBe('Arial')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(state().previewPrefs).toBeNull()
    expect(state().data?.prefs.fontFamily).toBe('Segoe UI')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('shows a saved font as the selected one, and previews it from the start', async () => {
    const select = await open((data) => {
      data.prefs.fontFamily = 'Yu Gothic UI'
    })

    expect(select.value).toBe('Yu Gothic UI')
    expect(state().previewPrefs?.fontFamily).toBe('Yu Gothic UI')
  })

  it('goes back to the fonts of the language with "Default"', async () => {
    const select = await open((data) => {
      data.prefs.fontFamily = 'Yu Gothic UI'
    })

    fireEvent.change(select, { target: { value: '' } })
    // The preview says "no font", which is not the same as saying nothing about the font.
    expect(state().previewPrefs?.fontFamily).toBe('')

    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().fontFamily).toBe('')
  })

  it('leaves a saved font alone when it was not touched, also one this PC does not have', async () => {
    const select = await open((data) => {
      data.prefs.fontFamily = 'Source Han Sans SC'
    })
    expect(select.value).toBe('Source Han Sans SC')

    fireEvent.click(screen.getByTestId('theme-dark'))
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().fontFamily).toBe('Source Han Sans SC')
    expect(savedPrefs().theme).toBe('dark')
  })

  it('previews the font together with the rest of the appearance', async () => {
    const select = await open()

    fireEvent.click(screen.getByTestId('theme-dark'))
    fireEvent.change(select, { target: { value: 'Arial' } })

    expect(state().previewPrefs).toMatchObject({
      theme: 'dark',
      fontFamily: 'Arial',
    })
  })

  it('follows a font that really changed underneath it, an import for one', async () => {
    const select = await open()

    act(() => {
      const data = structuredClone(state().data!)
      data.prefs.fontFamily = 'Segoe UI'
      useAppStore.setState({ data, dataEpoch: state().dataEpoch + 1 })
    })

    expect(select.value).toBe('Segoe UI')
    expect(state().previewPrefs?.fontFamily).toBe('Segoe UI')
  })

  it('cannot be changed while the settings are being saved', async () => {
    const select = await open()

    act(() => useAppStore.setState({ saving: true }))

    expect(select).toBeDisabled()
  })
})
