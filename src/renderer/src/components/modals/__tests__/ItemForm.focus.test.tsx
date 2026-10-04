import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { useAppStore } from '../../../store/use-app-store'
import Modal from '../Modal'

// collection-ui-4, flow-3: the "Edit" button of a failed open lands in the broken field.
describe('the item form opened to a broken field', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(() => {
    cleanup()
  })

  function openWith(
    tab: 'folders' | 'websites',
    focus: 'path' | 'url' | undefined
  ): void {
    const data = createDefaultAppData()
    data.loose.folders = [
      {
        id: 'f1',
        kind: 'folder',
        name: 'Designs',
        icon: 'F',
        path: 'D:\\Old\\Designs',
      },
    ]
    data.loose.websites = [
      {
        id: 'w1',
        kind: 'website',
        name: 'Docs',
        icon: 'W',
        url: 'https://docs.example.com',
      },
    ]
    useAppStore.setState({
      data,
      loading: false,
      modal: {
        kind: 'item',
        tab,
        groupId: null,
        itemId: tab === 'folders' ? 'f1' : 'w1',
        ...(focus ? { focus } : {}),
      },
    })
  }

  it('puts the cursor in the path, with its text selected', async () => {
    openWith('folders', 'path')
    render(<Modal />)

    const path = (await screen.findByTestId(
      'item-path-input'
    )) as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(path))
    expect(path.selectionStart).toBe(0)
    expect(path.selectionEnd).toBe(path.value.length)
  })

  it('puts the cursor in the address of a website', async () => {
    openWith('websites', 'url')
    render(<Modal />)

    const url = await screen.findByTestId('item-url-input')
    await waitFor(() => expect(document.activeElement).toBe(url))
  })

  it('starts in the first field when nothing was asked for: the target, which folders and websites put first', async () => {
    openWith('folders', undefined)
    render(<Modal />)

    const path = await screen.findByTestId('item-path-input')
    await waitFor(() => expect(document.activeElement).toBe(path))
  })
})
