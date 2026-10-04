import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { GroupItemMap } from '../../../../shared/types'
import LooseWidget from '../groups/LooseWidget'
import GridItem from '../items/GridItem'
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
  username: 'user',
  password: 'secret',
  note: '',
}

const open = () => vi.mocked(window.quickLaunch.openUrl)

describe('opening a card answers the click', () => {
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

  const click = async (element: Element) => {
    await act(async () => {
      fireEvent.click(element)
    })
  }

  it('marks a grid card as launching at once and sends one open for a double click', async () => {
    render(<GridItem tab="websites" groupId="g" item={site} />)
    const card = screen.getByTestId('grid-item-site-1')
    const button = card.querySelector('.grid-main')!

    expect(card).not.toHaveAttribute('data-launch')
    await click(button)
    expect(card).toHaveAttribute('data-launch', 'launching')
    await click(button)

    expect(open()).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(card).not.toHaveAttribute('data-launch')
    await click(button)
    expect(open()).toHaveBeenCalledTimes(2)
  })

  it('turns a card red when the launch fails and lets the next click retry', async () => {
    open().mockResolvedValueOnce({
      ok: false,
      error: 'No browser',
      code: 'open_failed',
    })
    render(<LooseWidget tab="websites" item={site} />)
    const card = screen.getByTestId('loose-widget-site-1')

    await click(card)
    expect(card).toHaveAttribute('data-launch', 'failed')
    // Said in the window's language, naming the card; not the raw text of the main process.
    expect(useAppStore.getState().toast?.message).toBe(
      '无法打开「Example」：可能没有与之关联的程序。'
    )

    await click(card)
    expect(open()).toHaveBeenCalledTimes(2)
    expect(card).toHaveAttribute('data-launch', 'launching')
  })

  it('does the same for a list row that can be opened, and never marks one that cannot', async () => {
    render(<ItemRow tab="websites" groupId={null} item={site} />)
    const row = screen.getByTestId('item-row-site-1')

    expect(row).toHaveAttribute('data-launchable')
    await click(row)
    await click(row)
    expect(row).toHaveAttribute('data-launch', 'launching')
    expect(open()).toHaveBeenCalledTimes(1)

    cleanup()
    render(<ItemRow tab="passwords" groupId="g" item={password} />)
    const secret = screen.getByTestId('item-row-password-1')

    expect(secret).not.toHaveAttribute('data-launchable')
    await click(secret)
    expect(secret).not.toHaveAttribute('data-launch')
    expect(open()).toHaveBeenCalledTimes(1)
  })

  it('does not count a press on the card’s own buttons as opening it', async () => {
    render(<LooseWidget tab="websites" item={site} />)
    const card = screen.getByTestId('loose-widget-site-1')

    await click(screen.getByLabelText('编辑条目'))

    expect(card).not.toHaveAttribute('data-launch')
    expect(open()).not.toHaveBeenCalled()
  })
})
