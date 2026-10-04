import { fireEvent, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { Tab } from '../../../../shared/types'
import { useAppStore } from '../../store/use-app-store'
import { useAppShortcuts } from '../use-app-shortcuts'

function start(hiddenTabs: Tab[], currentTab: Tab = 'folders'): void {
  const data = createDefaultAppData()
  data.prefs.hiddenTabs = hiddenTabs
  useAppStore.setState({
    data,
    currentTab,
    commandOpen: false,
    modal: null,
    widgetPopup: null,
  })
}

describe('Alt+number and Ctrl+N with hidden categories', () => {
  beforeEach(() => {
    start([])
  })

  it('maps Alt+1..7 to the seven categories in order when none is hidden', () => {
    renderHook(useAppShortcuts)
    const order: Tab[] = [
      'folders',
      'websites',
      'apps',
      'passwords',
      'commands',
      'notes',
      'tasks',
    ]

    order.forEach((tab, index) => {
      fireEvent.keyDown(window, { key: String(index + 1), altKey: true })
      expect(useAppStore.getState().currentTab).toBe(tab)
    })
  })

  it('maps Alt+number to the visible categories in order', () => {
    start(['websites', 'commands'])
    renderHook(useAppShortcuts)

    fireEvent.keyDown(window, { key: '2', altKey: true })
    expect(useAppStore.getState().currentTab).toBe('apps')

    fireEvent.keyDown(window, { key: '3', altKey: true })
    expect(useAppStore.getState().currentTab).toBe('passwords')

    fireEvent.keyDown(window, { key: '5', altKey: true })
    expect(useAppStore.getState().currentTab).toBe('tasks')
  })

  it('ignores a number beyond the visible categories', () => {
    start(['websites', 'commands', 'notes'])
    renderHook(useAppShortcuts)
    fireEvent.keyDown(window, { key: '3', altKey: true })
    expect(useAppStore.getState().currentTab).toBe('passwords')

    // Four categories are shown: 5, 6 and 7 do nothing.
    const event = new KeyboardEvent('keydown', {
      key: '6',
      altKey: true,
      cancelable: true,
    })
    window.dispatchEvent(event)

    expect(useAppStore.getState().currentTab).toBe('passwords')
  })

  it('adds to the category being shown with Ctrl+N', () => {
    start(['folders'], 'websites')
    renderHook(useAppShortcuts)

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })

    expect(useAppStore.getState().modal).toEqual({
      kind: 'item',
      tab: 'websites',
      groupId: null,
      itemId: null,
    })
  })
})
