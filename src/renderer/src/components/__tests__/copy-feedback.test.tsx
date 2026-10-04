import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { GroupItemMap } from '../../../../shared/types'
import GridItem from '../items/GridItem'
import ItemActions from '../items/ItemActions'
import ItemRow from '../items/ItemRow'
import { useAppStore } from '../../store/use-app-store'

const site: GroupItemMap['websites'] = {
  id: 'site-1',
  kind: 'website',
  name: 'Example',
  icon: '🌐',
  url: 'https://example.com',
}

const password: GroupItemMap['passwords'] = {
  id: 'password-1',
  kind: 'password',
  name: 'VPN',
  icon: '🔑',
  username: 'alice',
  password: 'hunter2',
  note: '',
}

const command: GroupItemMap['commands'] = {
  id: 'cmd-1',
  kind: 'command',
  name: 'Status',
  icon: '>_',
  content: 'git status',
  language: 'bash',
  description: '',
}

function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })

  return writeText
}

const press = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element)
  })
}

// The markup of the icon drawn in a button: the tick and the copy glyph differ.
const glyph = (button: Element) => button.querySelector('svg')?.innerHTML ?? ''

const messages = () =>
  screen.getAllByRole('status').map((region) => region.textContent)

describe('a copy answers on the button that was pressed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      toast: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('turns the button into a tick for 1.2 seconds, announces it, and shows no toast', async () => {
    stubClipboard()
    render(<GridItem tab="websites" groupId="g" item={site} />)
    const copy = screen.getByTestId('copy-item-site-1')

    expect(copy).not.toHaveAttribute('data-copied')
    expect(copy).toHaveAccessibleName('复制')
    const copyGlyph = glyph(copy)
    expect(copyGlyph).not.toBe('')
    await press(copy)

    expect(copy).toHaveAttribute('data-copied')
    expect(copy).toHaveAccessibleName('已复制')
    expect(glyph(copy)).not.toBe(copyGlyph)
    expect(messages()).toContain('已复制')
    expect(useAppStore.getState().toast).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    expect(copy).not.toHaveAttribute('data-copied')
    expect(glyph(copy)).toBe(copyGlyph)
    expect(messages()).not.toContain('已复制')
  })

  it('shows a failed copy as a toast and leaves the button alone', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('Clipboard unavailable')))
    render(<GridItem tab="websites" groupId="g" item={site} />)
    const copy = screen.getByTestId('copy-item-site-1')

    await press(copy)

    expect(copy).not.toHaveAttribute('data-copied')
    expect(useAppStore.getState().toast).toMatchObject({
      message: 'Clipboard unavailable',
      tone: 'danger',
    })
  })

  it('gives the username and the password their own confirmations', async () => {
    stubClipboard()
    render(<ItemRow tab="passwords" groupId="g" item={password} />)
    const user = screen.getByTestId('copy-username-password-1')
    const secret = screen.getByTestId('copy-item-password-1')

    await press(user)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    await press(secret)

    // The second copy did not wait for the first one to finish, nor cancel it.
    expect(user).toHaveAttribute('data-copied')
    expect(secret).toHaveAttribute('data-copied')
    expect(messages()).toEqual(
      expect.arrayContaining(['账号已复制', '密码已复制'])
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(user).not.toHaveAttribute('data-copied')
    expect(secret).toHaveAttribute('data-copied')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(secret).not.toHaveAttribute('data-copied')
  })

  it('changes the label of a script’s copy button, too', async () => {
    stubClipboard()
    render(<ItemRow tab="commands" groupId="g" item={command} />)
    const copy = screen.getByTestId('copy-item-cmd-1')

    expect(copy).toHaveTextContent('复制代码')
    await press(copy)

    expect(copy).toHaveAttribute('data-copied')
    expect(copy).toHaveTextContent('已复制')
    expect(copy).not.toHaveTextContent('复制代码')
  })

  it('does not count a copy that produced nothing as a copy', async () => {
    render(
      <ItemActions
        testIdPrefix="x"
        onEdit={() => {}}
        onDelete={() => {}}
        onCopy={async () => false}
      />
    )
    const copy = screen.getByTestId('copy-item-x')

    await press(copy)

    expect(copy).not.toHaveAttribute('data-copied')
  })
})
