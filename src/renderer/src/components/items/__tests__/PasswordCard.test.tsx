import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { GroupItemMap } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import PasswordCard from '../PasswordCard'

const item: GroupItemMap['passwords'] = {
  id: 'password-1',
  kind: 'password',
  name: 'VPN',
  icon: '🚀',
  username: 'alice',
  password: 'hunter2',
  note: '',
}

function renderCard(
  overrides: Partial<GroupItemMap['passwords']> = {},
  revealed = false
) {
  const handlers = {
    onToggleReveal: vi.fn(),
    onCopyUsername: vi.fn(async () => true),
    onCopyPassword: vi.fn(async () => true),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  render(
    <PasswordCard
      item={{ ...item, ...overrides }}
      revealed={revealed}
      {...handlers}
    />
  )
  return handlers
}

describe('PasswordCard', () => {
  beforeEach(() => {
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({ data, loading: false })
  })

  afterEach(() => {
    cleanup()
  })

  it('masks a normal password and lets it be copied', () => {
    const handlers = renderCard()

    expect(screen.getByText('********')).toBeInTheDocument()
    expect(screen.queryByTestId('password-lost-password-1')).toBeNull()
    fireEvent.click(screen.getByTestId('copy-item-password-1'))
    expect(handlers.onCopyPassword).toHaveBeenCalledTimes(1)
  })

  it('flags a password that could not be decrypted instead of masking an empty value', () => {
    const handlers = renderCard({ password: '', passwordLost: true })

    expect(screen.getByTestId('password-lost-password-1')).toHaveTextContent(
      'Password needs to be re-entered'
    )
    expect(screen.queryByText('********')).toBeNull()
    const copy = screen.getByTestId('copy-item-password-1')
    expect(copy).toBeDisabled()
    expect(copy).toHaveAccessibleName('Password needs to be re-entered')
    fireEvent.click(copy)
    expect(handlers.onCopyPassword).not.toHaveBeenCalled()
  })

  it('keeps the edit action available for a lost password', () => {
    const handlers = renderCard({ password: '', passwordLost: true })

    fireEvent.click(screen.getByTestId('edit-item-password-1'))

    expect(handlers.onEdit).toHaveBeenCalledTimes(1)
  })

  it('does not show the marker for a password that is present', () => {
    renderCard({ passwordLost: false }, true)

    expect(screen.getByText('hunter2')).toBeInTheDocument()
    expect(screen.queryByTestId('password-lost-password-1')).toBeNull()
  })
})
