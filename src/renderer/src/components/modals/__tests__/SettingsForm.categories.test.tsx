import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { AppData, Lang, Tab } from '../../../../../shared/types'
import { ALL_TABS } from '../../../../../shared/types'
import { translations } from '../../../i18n/translations'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

function open(hiddenTabs: Tab[] = [], lang: Lang = 'en'): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  data.prefs.hiddenTabs = hiddenTabs
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    currentTab: 'folders',
    modal: { kind: 'settings' },
    toast: null,
  })
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-appearance'))
}

const name = (lang: Lang, tab: Tab): string =>
  workspaceStrings[lang][`tab_${tab}`] ??
  translations[lang].strings[`tab_${tab}`]!

function categoryGroup(lang: Lang = 'en'): HTMLElement {
  return screen.getByRole('group', {
    name: workspaceStrings[lang].settings_categories!,
  })
}

function categorySwitch(tab: Tab, lang: Lang = 'en'): HTMLElement {
  return within(categoryGroup(lang)).getByRole('switch', {
    name: name(lang, tab),
  })
}

describe('SettingsForm: show categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('lists all seven categories as switches, all on by default, in tab order', () => {
    open()

    const switches = within(categoryGroup()).getAllByRole('switch')
    expect(
      switches.map((element) => (element as HTMLInputElement).checked)
    ).toEqual(ALL_TABS.map(() => true))
    expect(
      switches.map((element) => element.closest('label')?.textContent)
    ).toEqual(ALL_TABS.map((tab) => name('en', tab)))
  })

  it('draws an icon beside every category name', () => {
    open()

    for (const tab of ALL_TABS) {
      expect(
        categorySwitch(tab).closest('label')?.querySelector('svg'),
        tab
      ).not.toBeNull()
    }
  })

  it('shows a hidden category as off', () => {
    open(['notes', 'apps'])

    expect(categorySwitch('notes')).not.toBeChecked()
    expect(categorySwitch('apps')).not.toBeChecked()
    expect(categorySwitch('folders')).toBeChecked()
  })

  it('says that hiding does not delete data', () => {
    open()

    expect(
      within(categoryGroup()).getByText(/does not delete data/i)
    ).toBeInTheDocument()
  })

  it('saves the hidden categories with the other settings, in category order', async () => {
    open()

    fireEvent.click(categorySwitch('tasks'))
    fireEvent.click(categorySwitch('notes'))
    expect(categorySwitch('notes')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    const saved = vi.mocked(window.quickLaunch.saveData).mock
      .calls[0]![0] as AppData
    expect(saved.prefs.hiddenTabs).toEqual(['notes', 'tasks'])
  })

  it('changes nothing until it is saved', () => {
    open()

    fireEvent.click(categorySwitch('notes'))

    expect(useAppStore.getState().data?.prefs.hiddenTabs).toEqual([])
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('turns a category back on', async () => {
    open(['notes'])

    fireEvent.click(categorySwitch('notes'))
    expect(categorySwitch('notes')).toBeChecked()
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    const saved = vi.mocked(window.quickLaunch.saveData).mock
      .calls[0]![0] as AppData
    expect(saved.prefs.hiddenTabs).toEqual([])
  })

  it('keeps the last category on: its switch is disabled and says why', () => {
    open(ALL_TABS.slice(1) as unknown as Tab[])

    // Folders is the only one left on.
    expect(categorySwitch('folders')).toBeChecked()
    expect(categorySwitch('folders')).toBeDisabled()
    expect(screen.getByText(/at least one category/i)).toBeInTheDocument()
    // The others can still be turned on.
    expect(categorySwitch('notes')).toBeEnabled()
  })

  it('does not offer the explanation about the last category while several are on', () => {
    open()

    expect(screen.queryByText(/at least one category/i)).toBeNull()
    expect(categorySwitch('folders')).toBeEnabled()
  })

  it('stops the second to last category from being turned off together with the last', () => {
    open()

    for (const tab of ALL_TABS.slice(0, 6)) fireEvent.click(categorySwitch(tab))
    // Six are off now; the seventh is the last one standing.
    expect(categorySwitch('tasks')).toBeChecked()
    expect(categorySwitch('tasks')).toBeDisabled()

    fireEvent.click(categorySwitch('tasks'))
    expect(categorySwitch('tasks')).toBeChecked()
  })

  it('names the Alt+number range after the categories that are shown', () => {
    open(['notes', 'apps'])
    fireEvent.click(screen.getByTestId('settings-tab-behavior'))

    expect(screen.getByText('Alt 1–5')).toBeInTheDocument()
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'has a heading and an explanation in %s',
    (lang) => {
      open([], lang)

      expect(workspaceStrings[lang].settings_categories).toBeTruthy()
      expect(workspaceStrings[lang].settings_categories_hint).toBeTruthy()
      expect(workspaceStrings[lang].settings_categories_last).toBeTruthy()
      expect(categoryGroup(lang)).toBeInTheDocument()
    }
  )
})
