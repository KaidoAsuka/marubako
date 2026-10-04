import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GroupTab } from '../../../../../shared/types'
import { createDefaultAppData } from '../../../../../shared/default-data'
import { translations } from '../../../i18n/translations'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import ItemForm from '../ItemForm'

const t = (key: string) =>
  workspaceStrings.zh[key] ?? translations.zh.strings[key] ?? key

function openForm(tab: GroupTab) {
  useAppStore.setState({
    modal: { kind: 'item', tab, groupId: null, itemId: null },
  })
  return render(<ItemForm />)
}

describe('ItemForm field labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      saving: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the wrap toggle off when the line-number gutter, title or hint is clicked', () => {
    const { container } = openForm('commands')
    const wrap = screen.getByRole('button', { name: t('cmd_wrap') })
    expect(wrap).toHaveAttribute('aria-pressed', 'false')
    const gutter = container.querySelector('.code-gutter') as HTMLElement
    expect(gutter).not.toBeNull()

    fireEvent.click(gutter)
    fireEvent.click(gutter.firstElementChild as HTMLElement)
    fireEvent.click(screen.getByText(`${t('cmd_code')} *`))
    fireEvent.click(container.querySelector('.code-editor-hint') as HTMLElement)
    fireEvent.click(
      container.querySelector('.code-editor-toolbar span') as HTMLElement
    )

    expect(wrap).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('.code-gutter')).not.toBeNull()
  })

  it('still toggles wrapping from its own button', () => {
    openForm('commands')
    const wrap = screen.getByRole('button', { name: t('cmd_wrap') })

    fireEvent.click(wrap)

    expect(wrap).toHaveAttribute('aria-pressed', 'true')
  })

  it('groups the code editor and the icon picker under their titles', () => {
    openForm('commands')

    expect(
      screen.getByRole('group', { name: `${t('cmd_code')} *` })
    ).toContainElement(screen.getByTestId('command-code-input'))
    expect(screen.getByRole('group', { name: t('f_icon') })).toContainElement(
      screen.getByRole('button', { name: t('icon_choose') })
    )
  })

  it.each([
    ['commands', `${t('f_name')} *`, 'item-name-input'],
    ['commands', t('cmd_language'), 'command-language'],
    ['commands', t('cmd_description'), 'command-description'],
    ['folders', `${t('f_path')} *`, 'item-path-input'],
    ['websites', `${t('f_url')} *`, 'item-url-input'],
    ['passwords', t('f_username'), 'item-username-input'],
    ['passwords', t('f_password'), 'item-password-input'],
    ['passwords', t('f_note'), 'item-note-input'],
    ['notes', t('f_content'), 'item-content-input'],
  ] as const)(
    'labels the %s field "%s" so a click on the title reaches its control',
    (tab, label, testId) => {
      openForm(tab)
      const control = screen.getByTestId(testId)
      const onClick = vi.fn()
      control.addEventListener('click', onClick)

      expect(screen.getByLabelText(label)).toBe(control)
      fireEvent.click(screen.getByText(label))

      expect(onClick).toHaveBeenCalledTimes(1)
    }
  )

  it('does not click the browse button when the path title is clicked', () => {
    openForm('folders')
    const browse = vi.fn()
    screen.getByTestId('item-browse').addEventListener('click', browse)

    fireEvent.click(screen.getByText(`${t('f_path')} *`))
    fireEvent.click(screen.getByText(t('item_path_hint')))

    expect(browse).not.toHaveBeenCalled()
    expect(window.quickLaunch.selectPath).not.toHaveBeenCalled()
  })

  it('does not reveal the password when the password title is clicked', () => {
    openForm('passwords')

    fireEvent.click(screen.getByText(t('f_password')))

    expect(screen.getByTestId('item-password-input')).toHaveAttribute(
      'type',
      'password'
    )
  })
})
