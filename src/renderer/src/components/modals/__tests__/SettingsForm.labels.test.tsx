import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { translations } from '../../../i18n/translations'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

const t = (key: string) =>
  workspaceStrings.zh[key] ?? translations.zh.strings[key] ?? key

describe('SettingsForm field labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.prefs.theme = 'light'
    data.prefs.background = 'sunset'
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

  it('does not export the data when the data management title or notice is clicked', () => {
    render(<SettingsForm />)
    fireEvent.click(screen.getByTestId('settings-tab-data'))

    const title = screen.getByText(t('data_management'))
    fireEvent.click(title)
    fireEvent.click(screen.getByText(t('import_notice')))
    fireEvent.click(title.closest('.form-field')!)
    fireEvent.click(
      screen.getByTestId('settings-export').parentElement as HTMLElement
    )

    expect(window.quickLaunch.exportData).not.toHaveBeenCalled()
    expect(window.quickLaunch.importData).not.toHaveBeenCalled()
  })

  it('still exports when the export button itself is clicked', async () => {
    render(<SettingsForm />)
    fireEvent.click(screen.getByTestId('settings-tab-data'))

    fireEvent.click(screen.getByTestId('settings-export'))

    await vi.waitFor(() =>
      expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    )
  })

  it('does not switch the theme when its title or the blank space is clicked', () => {
    render(<SettingsForm />)
    const light = screen.getByTestId('theme-light')
    const dark = screen.getByTestId('theme-dark')
    expect(light).toHaveClass('active')

    const title = screen.getByText(t('theme'))
    fireEvent.click(title)
    fireEvent.click(title.closest('.form-field')!)
    fireEvent.click(dark.parentElement as HTMLElement)

    expect(light).toHaveClass('active')
    expect(dark).not.toHaveClass('active')
  })

  it('does not switch the accent colour when its title is clicked', () => {
    render(<SettingsForm />)
    const sunset = screen.getByTestId('background-sunset')
    expect(sunset).toHaveClass('active')

    fireEvent.click(screen.getByText(t('accent_color')))

    expect(sunset).toHaveClass('active')
    expect(screen.getByTestId('background-aurora')).not.toHaveClass('active')
  })

  it('groups the theme and background buttons under their titles', () => {
    render(<SettingsForm />)

    expect(screen.getByRole('group', { name: t('theme') })).toContainElement(
      screen.getByTestId('theme-dark')
    )
    expect(
      screen.getByRole('group', { name: t('accent_color') })
    ).toContainElement(screen.getByTestId('background-aurora'))
  })

  it('groups the data management buttons under their title', () => {
    render(<SettingsForm />)
    fireEvent.click(screen.getByTestId('settings-tab-data'))

    expect(
      screen.getByRole('group', { name: t('data_management') })
    ).toContainElement(screen.getByTestId('settings-import'))
  })

  it('keeps single-control fields labelled by their title', () => {
    render(<SettingsForm />)

    expect(screen.getByLabelText(t('font_size')).tagName).toBe('INPUT')
    expect(screen.getByLabelText(t('opacity')).tagName).toBe('INPUT')
    expect(screen.getByLabelText(t('motion')).tagName).toBe('INPUT')

    fireEvent.click(screen.getByTestId('settings-tab-behavior'))
    expect(screen.getByLabelText(t('browser')).tagName).toBe('SELECT')
    expect(screen.getByLabelText(t('peek_collapse_delay'))).toHaveAttribute(
      'data-testid',
      'peek-collapse-delay'
    )

    fireEvent.click(screen.getByTestId('settings-tab-data'))
    expect(screen.getByLabelText(t('language')).tagName).toBe('SELECT')
  })

  it('moves the language select when its title is clicked', () => {
    render(<SettingsForm />)
    fireEvent.click(screen.getByTestId('settings-tab-data'))
    const select = screen.getByLabelText(t('language')) as HTMLSelectElement
    const onClick = vi.fn()
    select.addEventListener('click', onClick)

    fireEvent.click(screen.getByText(t('language')))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
