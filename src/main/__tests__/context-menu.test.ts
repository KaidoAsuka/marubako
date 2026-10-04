import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextMenuItem } from '../../shared/context-menu'

type Template = Array<{
  label?: string
  type?: string
  enabled?: boolean
  accelerator?: string
  registerAccelerator?: boolean
  click?: () => void
  submenu?: Template
}>

const mocks = vi.hoisted(() => {
  const state = {
    template: [] as unknown[],
    popupOptions: undefined as
      | undefined
      | { window?: unknown; x?: number; y?: number; callback?: () => void },
    listeners: new Map<string, () => void>(),
  }
  return {
    state,
    setLauncherMenuOpen: vi.fn(),
    buildFromTemplate: vi.fn((template: unknown[]) => {
      state.template = template
      return {
        on: (event: string, listener: () => void) => {
          state.listeners.set(event, listener)
        },
        popup: (options: typeof state.popupOptions) => {
          state.popupOptions = options
        },
      }
    }),
  }
})

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: mocks.buildFromTemplate },
}))
vi.mock('../window-manager', () => ({
  setLauncherMenuOpen: mocks.setLauncherMenuOpen,
}))

import { showContextMenu } from '../context-menu'

const window = { id: 7 } as never
const template = () => mocks.state.template as Template

const ITEMS: ContextMenuItem[] = [
  { id: 'open', label: 'Open' },
  { type: 'separator' },
  { id: 'rename', label: 'Rename', accelerator: 'F2' },
  {
    label: 'Move to',
    submenu: [
      { id: 'move:a', label: 'A' },
      { id: 'move:b', label: 'B', enabled: false },
    ],
  },
  { id: 'delete', label: 'Delete', accelerator: 'Delete' },
]

describe('showContextMenu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.state.popupOptions = undefined
    mocks.state.listeners.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds the native menu from the description', () => {
    void showContextMenu(window, ITEMS)

    const built = template()
    expect(built.map((item) => item.label ?? item.type)).toEqual([
      'Open',
      'separator',
      'Rename',
      'Move to',
      'Delete',
    ])
    expect(built[3]!.submenu!.map((item) => item.label)).toEqual(['A', 'B'])
    expect(built[3]!.submenu![1]!.enabled).toBe(false)
  })

  it('doubles an ampersand in a label so that a group named Q&A shows as typed', () => {
    void showContextMenu(window, [
      { id: 'a', label: 'Q&A' },
      { label: 'R&D', submenu: [{ id: 'b', label: 'Tools & Utils' }] },
    ])

    const built = template()
    expect(built[0]!.label).toBe('Q&&A')
    expect(built[1]!.label).toBe('R&&D')
    expect(built[1]!.submenu![0]!.label).toBe('Tools && Utils')
  })

  it('shows F2 and Delete beside the labels without registering them', () => {
    void showContextMenu(window, ITEMS)

    expect(template()[2]).toMatchObject({
      accelerator: 'F2',
      registerAccelerator: false,
    })
    expect(template()[4]).toMatchObject({
      accelerator: 'Delete',
      registerAccelerator: false,
    })
    expect(template()[0]).not.toHaveProperty('accelerator')
  })

  it('opens over the window at the pointer when there is no point', () => {
    void showContextMenu(window, ITEMS)

    expect(mocks.state.popupOptions?.window).toBe(window)
    expect(mocks.state.popupOptions).not.toHaveProperty('x')
    expect(mocks.state.popupOptions).not.toHaveProperty('y')
  })

  it('opens at the point it was given, in window pixels', () => {
    void showContextMenu(window, ITEMS, { x: 120, y: 340 })

    expect(mocks.state.popupOptions).toMatchObject({ x: 120, y: 340 })
  })

  it('answers with the id of the item that was chosen', async () => {
    const chosen = showContextMenu(window, ITEMS)

    template()[0]!.click!()
    mocks.state.popupOptions!.callback!()
    await vi.advanceTimersByTimeAsync(100)

    await expect(chosen).resolves.toBe('open')
  })

  it('answers with the id of an item in a submenu', async () => {
    const chosen = showContextMenu(window, ITEMS)

    template()[3]!.submenu![0]!.click!()
    mocks.state.popupOptions!.callback!()
    await vi.advanceTimersByTimeAsync(100)

    await expect(chosen).resolves.toBe('move:a')
  })

  it('answers null when the menu is dismissed', async () => {
    const chosen = showContextMenu(window, ITEMS)

    mocks.state.popupOptions!.callback!()
    await vi.advanceTimersByTimeAsync(100)

    await expect(chosen).resolves.toBeNull()
  })

  it('keeps the choice even if the menu reports that it closed first', async () => {
    const chosen = showContextMenu(window, ITEMS)

    mocks.state.popupOptions!.callback!()
    template()[4]!.click!()
    await vi.advanceTimersByTimeAsync(100)

    await expect(chosen).resolves.toBe('delete')
  })

  it('answers once only', async () => {
    const chosen = showContextMenu(window, ITEMS)

    template()[0]!.click!()
    template()[2]!.click!()
    mocks.state.popupOptions!.callback!()
    await vi.advanceTimersByTimeAsync(100)

    await expect(chosen).resolves.toBe('open')
  })

  it('stops the temporary panel from folding away while the menu is open', () => {
    void showContextMenu(window, ITEMS)

    mocks.state.listeners.get('menu-will-show')!()
    expect(mocks.setLauncherMenuOpen).toHaveBeenLastCalledWith(true)
    mocks.state.listeners.get('menu-will-close')!()
    expect(mocks.setLauncherMenuOpen).toHaveBeenLastCalledWith(false)
  })
})
