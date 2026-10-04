import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Lang } from '../../shared/types'

type Template = Array<{
  id?: string
  label?: string
  type?: string
  click?: () => void
}>

const mocks = vi.hoisted(() => ({
  lang: 'zh' as Lang,
  built: [] as Array<{
    template: Template
    menu: { on: ReturnType<typeof vi.fn> }
  }>,
  quit: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { quit: mocks.quit },
  Menu: {
    buildFromTemplate: vi.fn((template: Template) => {
      const menu = { on: vi.fn(), template }
      mocks.built.push({ template, menu })
      return menu
    }),
  },
}))
vi.mock('electron-log/main', () => ({
  default: { warn: vi.fn(), info: vi.fn() },
}))
vi.mock('../data-store', () => ({
  loadAppData: async () => ({ prefs: { lang: mocks.lang } }),
}))

import type * as MenuModule from '../launcher-menu'

let createLauncherMenu: typeof MenuModule.createLauncherMenu

const labels = (index = mocks.built.length - 1) =>
  mocks.built[index]?.template
    .filter((item) => item.type !== 'separator')
    .map((item) => item.label)

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.built.length = 0
  mocks.lang = 'zh'
  // The module remembers the menu it built: every test starts from none.
  vi.resetModules()
  ;({ createLauncherMenu } = await import('../launcher-menu'))
})

const noop = async () => {}

describe('the menu of the tray icon and the ball', () => {
  it.each([
    ['zh', ['打开 Marubako', '退出 (Quit)']],
    ['en', ['Open Marubako', 'Quit']],
    ['ja', ['Marubako を開く', '終了 (Quit)']],
  ] as const)('is built in the saved language (%s)', async (lang, expected) => {
    mocks.lang = lang

    await createLauncherMenu(noop, () => {})

    expect(labels()).toEqual(expected)
  })

  it('is built once while the language stays, and handed out again', async () => {
    const first = await createLauncherMenu(noop, () => {})
    const second = await createLauncherMenu(noop, () => {})

    expect(second).toBe(first)
    expect(mocks.built).toHaveLength(1)
  })

  it('is rebuilt in the new language, because a native item cannot be renamed', async () => {
    const zh = await createLauncherMenu(noop, () => {})
    mocks.lang = 'en'

    const en = await createLauncherMenu(noop, () => {})

    expect(en).not.toBe(zh)
    expect(mocks.built).toHaveLength(2)
    expect(labels(0)).toEqual(['打开 Marubako', '退出 (Quit)'])
    expect(labels(1)).toEqual(['Open Marubako', 'Quit'])
    // The first menu is left as it was: whoever still holds it keeps a working menu.
    expect(
      mocks.built[0]?.template.filter((item) => item.type !== 'separator')
    ).toHaveLength(2)

    mocks.lang = 'ja'
    expect(labels()).toEqual(['Open Marubako', 'Quit'])
    await createLauncherMenu(noop, () => {})
    expect(labels()).toEqual(['Marubako を開く', '終了 (Quit)'])
  })

  it('goes back to an earlier language with a new menu, never a stale one', async () => {
    await createLauncherMenu(noop, () => {})
    mocks.lang = 'en'
    await createLauncherMenu(noop, () => {})
    mocks.lang = 'zh'

    await createLauncherMenu(noop, () => {})

    expect(labels()).toEqual(['打开 Marubako', '退出 (Quit)'])
  })

  it('tells the window when the menu opens and closes, in every menu it builds', async () => {
    const visibility = vi.fn()
    await createLauncherMenu(noop, visibility)
    mocks.lang = 'en'
    await createLauncherMenu(noop, visibility)

    for (const { menu } of mocks.built) {
      const handlers = Object.fromEntries(
        menu.on.mock.calls.map(([name, handler]) => [name, handler])
      ) as Record<string, () => void>
      handlers['menu-will-show']?.()
      handlers['menu-will-close']?.()
    }

    expect(visibility.mock.calls).toEqual([[true], [false], [true], [false]])
  })

  it('opens the launcher, and quits, from the items of a rebuilt menu too', async () => {
    const open = vi.fn(async () => {})
    await createLauncherMenu(open, () => {})
    mocks.lang = 'en'
    await createLauncherMenu(open, () => {})
    const items = mocks.built[1]!.template

    items.find((item) => item.id === 'open')?.click?.()
    items.find((item) => item.id === 'quit')?.click?.()

    expect(open).toHaveBeenCalledTimes(1)
    expect(mocks.quit).toHaveBeenCalledTimes(1)
  })
})
