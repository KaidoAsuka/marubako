import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import ItemForm from '../ItemForm'
import { useAppStore } from '../../../store/use-app-store'

describe('ItemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()

    useAppStore.setState({
      data,
      loading: false,
      modal: {
        kind: 'item',
        tab: 'passwords',
        groupId: null,
        itemId: null,
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('toggles the password input visibility from the trailing action button', () => {
    render(<ItemForm />)

    const passwordInput = screen.getByTestId('item-password-input')
    expect(passwordInput).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: '查看' }))

    expect(passwordInput).toHaveAttribute('type', 'text')
  })

  it('uses the native file picker and derives a name for a new application', async () => {
    useAppStore.setState({
      modal: { kind: 'item', tab: 'apps', groupId: null, itemId: null },
    })
    vi.mocked(window.quickLaunch.selectPath).mockResolvedValueOnce({
      ok: true,
      data: 'C:\\Tools\\Editor.exe',
    })
    render(<ItemForm />)
    fireEvent.click(screen.getByTestId('item-browse'))
    await waitFor(() =>
      expect(screen.getByTestId('item-path-input')).toHaveValue(
        'C:\\Tools\\Editor.exe'
      )
    )
    expect(screen.getByTestId('item-name-input')).toHaveValue('Editor')
    expect(window.quickLaunch.selectPath).toHaveBeenCalledWith('app')
  })

  it('normalizes a bare website address before saving', async () => {
    useAppStore.setState({
      modal: { kind: 'item', tab: 'websites', groupId: null, itemId: null },
    })
    render(<ItemForm />)
    fireEvent.change(screen.getByTestId('item-name-input'), {
      target: { value: 'Example' },
    })
    fireEvent.change(screen.getByTestId('item-url-input'), {
      target: { value: 'example.com' },
    })
    fireEvent.click(screen.getByTestId('item-save'))
    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(
      vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0].loose
        .websites[0]?.url
    ).toBe('https://example.com')
  })

  it('keeps an invalid website in the form and explains the problem', () => {
    useAppStore.setState({
      modal: { kind: 'item', tab: 'websites', groupId: null, itemId: null },
    })
    render(<ItemForm />)
    fireEvent.change(screen.getByTestId('item-name-input'), {
      target: { value: 'Invalid' },
    })
    fireEvent.change(screen.getByTestId('item-url-input'), {
      target: { value: 'file:///C:/test' },
    })
    fireEvent.click(screen.getByTestId('item-save'))
    expect(screen.getByRole('alert')).toHaveTextContent('http')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  describe('a password that could not be decrypted', () => {
    function openLostPassword(): void {
      const data = createDefaultAppData()
      data.loose.passwords = [
        {
          id: 'password-lost',
          kind: 'password',
          name: 'VPN',
          icon: '🔑',
          username: 'alice',
          password: '',
          note: '',
          passwordLost: true,
        },
      ]
      useAppStore.setState({
        data,
        modal: {
          kind: 'item',
          tab: 'passwords',
          groupId: null,
          itemId: 'password-lost',
        },
      })
    }

    it('explains that the password has to be typed again until one is entered', () => {
      openLostPassword()
      render(<ItemForm />)

      expect(screen.getByTestId('item-password-lost-note')).toHaveTextContent(
        '这条密码无法在这台电脑上解密'
      )

      fireEvent.change(screen.getByTestId('item-password-input'), {
        target: { value: 'new-secret' },
      })

      expect(screen.queryByTestId('item-password-lost-note')).toBeNull()
    })

    it('does not show the note for a normal password', () => {
      render(<ItemForm />)

      expect(screen.queryByTestId('item-password-lost-note')).toBeNull()
    })

    it('stores the retyped password without the lost marker', async () => {
      openLostPassword()
      render(<ItemForm />)
      fireEvent.change(screen.getByTestId('item-password-input'), {
        target: { value: 'new-secret' },
      })
      fireEvent.click(screen.getByTestId('item-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      const saved = vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0]
        .loose.passwords[0]
      expect(saved?.password).toBe('new-secret')
      expect(saved).not.toHaveProperty('passwordLost')
    })

    it('keeps the lost marker when the entry is saved without a new password', async () => {
      openLostPassword()
      render(<ItemForm />)
      fireEvent.change(screen.getByTestId('item-name-input'), {
        target: { value: 'VPN (work)' },
      })
      fireEvent.click(screen.getByTestId('item-save'))

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      const saved = vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0]
        .loose.passwords[0]
      expect(saved).toMatchObject({
        name: 'VPN (work)',
        password: '',
        passwordLost: true,
      })
    })
  })
})
