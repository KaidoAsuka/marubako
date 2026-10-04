import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GroupItemMap } from '../../../../../shared/types'
import { createDefaultAppData } from '../../../../../shared/default-data'
import ItemRow from '../ItemRow'
import { useAppStore } from '../../../store/use-app-store'

describe('ItemRow', () => {
  const passwordItem: GroupItemMap['passwords'] = {
    id: 'password-1',
    kind: 'password',
    name: 'VPN',
    icon: '🚀',
    username: 'gvd-j0193',
    password: 'ihkLgPn3pM8FH/Q',
    note: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()

    useAppStore.setState({
      data,
      loading: false,
      currentTab: 'passwords',
      modal: null,
      revealedPasswordIds: [],
      expandedNoteIds: [],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders reveal, copy, edit, and delete actions for password items', () => {
    render(
      <ItemRow tab="passwords" groupId="group-passwords" item={passwordItem} />
    )

    expect(screen.getByTestId('toggle-password-password-1')).toBeInTheDocument()
    expect(screen.getByTestId('copy-item-password-1')).toBeInTheDocument()
    expect(screen.getByTestId('edit-item-password-1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-item-password-1')).toBeInTheDocument()
  })

  it('toggles the visible password value from the action button', () => {
    render(
      <ItemRow tab="passwords" groupId="group-passwords" item={passwordItem} />
    )

    expect(screen.getByText('********')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('toggle-password-password-1'))

    expect(screen.getByText('ihkLgPn3pM8FH/Q')).toBeInTheDocument()
  })

  it('copies the username independently without revealing the password or opening an editor', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(
      <ItemRow tab="passwords" groupId="group-passwords" item={passwordItem} />
    )
    fireEvent.click(screen.getByTestId('copy-username-password-1'))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(passwordItem.username)
    )
    expect(screen.getByText('********')).toBeInTheDocument()
    expect(screen.queryByText(passwordItem.password)).not.toBeInTheDocument()
    expect(useAppStore.getState().modal).toBeNull()
    // The button confirms the copy itself and announces it; there is no success toast any more.
    await waitFor(() =>
      expect(screen.getByTestId('copy-username-password-1')).toHaveAttribute(
        'data-copied'
      )
    )
    expect(
      screen.getAllByRole('status').map((region) => region.textContent)
    ).toContain('账号已复制')
    expect(useAppStore.getState().toast).toBeNull()
    fireEvent.click(screen.getByTestId('copy-item-password-1'))
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(passwordItem.password)
    )
  })

  it('disables copying an empty username and reports clipboard errors without revealing the secret', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error('Clipboard unavailable'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(
      <ItemRow
        tab="passwords"
        groupId={null}
        item={{ ...passwordItem, username: '' }}
      />
    )
    expect(screen.getByTestId('copy-username-password-1')).toBeDisabled()
    fireEvent.click(screen.getByTestId('copy-item-password-1'))
    await waitFor(() =>
      expect(useAppStore.getState().toast?.message).toBe(
        'Clipboard unavailable'
      )
    )
    expect(screen.queryByText(passwordItem.password)).not.toBeInTheDocument()
  })
})
