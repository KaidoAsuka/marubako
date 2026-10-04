import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  lang: undefined as 'zh' | 'en' | 'ja' | undefined,
  locale: 'en-US',
  popup: vi.fn(),
  built: [] as Array<{
    template: unknown[]
    handlers: Map<string, () => void>
  }>,
  window: { id: 7 } as object | null,
}))

vi.mock('electron', () => ({
  app: { getLocale: () => mocks.locale },
  BrowserWindow: { fromWebContents: () => mocks.window },
  Menu: {
    buildFromTemplate: (template: unknown[]) => {
      const handlers = new Map<string, () => void>()
      mocks.built.push({ template, handlers })
      return {
        on: (event: string, handler: () => void) =>
          handlers.set(event, handler),
        popup: mocks.popup,
      }
    },
  },
}))
vi.mock('../data-store', () => ({ getCachedLang: () => mocks.lang }))

import { attachEditMenu, buildEditMenuTemplate } from '../edit-menu'

const flags = (overrides: Partial<Record<string, boolean>> = {}) => ({
  canCut: true,
  canCopy: true,
  canPaste: true,
  canSelectAll: true,
  ...overrides,
})

type Item = { role?: string; label?: string; enabled?: boolean; type?: string }

describe('buildEditMenuTemplate', () => {
  it('offers cut, copy, paste and select all in an editable field', () => {
    const template = buildEditMenuTemplate(
      { isEditable: true, selectionText: 'abc', editFlags: flags() },
      'en'
    ) as Item[]

    expect(
      template.filter((item) => item.role).map((item) => item.role)
    ).toEqual(['cut', 'copy', 'paste', 'selectAll'])
    expect(template.map((item) => item.label).filter(Boolean)).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Select all',
    ])
    expect(template.every((item) => item.enabled !== false)).toBe(true)
  })

  it.each([
    ['zh', ['剪切', '复制', '粘贴', '全选']],
    ['en', ['Cut', 'Copy', 'Paste', 'Select all']],
    ['ja', ['切り取り', 'コピー', '貼り付け', 'すべて選択']],
  ] as const)('speaks %s', (lang, words) => {
    const template = buildEditMenuTemplate(
      { isEditable: true, selectionText: '', editFlags: flags() },
      lang
    ) as Item[]

    expect(template.map((item) => item.label).filter(Boolean)).toEqual(words)
  })

  it('enables each entry only when the field can do it now', () => {
    const template = buildEditMenuTemplate(
      {
        isEditable: true,
        selectionText: '',
        editFlags: flags({ canCut: false, canCopy: false, canPaste: false }),
      },
      'en'
    ) as Item[]
    const enabled = Object.fromEntries(
      template
        .filter((item) => item.role)
        .map((item) => [item.role, item.enabled])
    )

    expect(enabled).toEqual({
      cut: false,
      copy: false,
      paste: false,
      selectAll: true,
    })
  })

  it('offers a plain Copy on text that cannot be edited, while some of it is selected', () => {
    const template = buildEditMenuTemplate(
      { isEditable: false, selectionText: 'some words', editFlags: flags() },
      'ja'
    ) as Item[]

    expect(template).toEqual([{ role: 'copy', label: 'コピー' }])
  })

  it.each([
    [
      'nothing selected',
      { isEditable: false, selectionText: '', editFlags: flags() },
    ],
    [
      'only spaces selected',
      { isEditable: false, selectionText: '  \n', editFlags: flags() },
    ],
    [
      'a selection that cannot be copied',
      {
        isEditable: false,
        selectionText: 'x',
        editFlags: flags({ canCopy: false }),
      },
    ],
  ])('offers nothing outside a field with %s', (_name, params) => {
    expect(buildEditMenuTemplate(params, 'en')).toEqual([])
  })
})

describe('attachEditMenu', () => {
  type Handler = (event: unknown, params: Record<string, unknown>) => void
  let handler: Handler
  const visible = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.built.length = 0
    mocks.lang = undefined
    mocks.locale = 'en-US'
    mocks.window = { id: 7 }
    attachEditMenu(
      {
        on: (event: string, listener: Handler) => {
          if (event === 'context-menu') handler = listener
        },
      } as never,
      visible
    )
  })

  const rightClick = (overrides: Record<string, unknown> = {}) =>
    handler(
      {},
      {
        isEditable: true,
        selectionText: '',
        editFlags: flags(),
        x: 12,
        y: 34,
        menuSourceType: 'mouse',
        ...overrides,
      }
    )

  it('pops the menu up at the pointer, in the window that was clicked', () => {
    rightClick()

    expect(mocks.popup).toHaveBeenCalledWith({
      window: mocks.window,
      x: 12,
      y: 34,
      sourceType: 'mouse',
    })
  })

  it('shows no menu where there is nothing to offer', () => {
    rightClick({ isEditable: false })

    expect(mocks.built).toHaveLength(0)
    expect(mocks.popup).not.toHaveBeenCalled()
  })

  it('uses the language of the interface', () => {
    mocks.lang = 'zh'
    rightClick()
    mocks.lang = 'ja'
    rightClick()

    const labels = mocks.built.map(
      (menu) =>
        (menu.template as Item[]).find((item) => item.role === 'paste')?.label
    )
    expect(labels).toEqual(['粘贴', '貼り付け'])
  })

  it.each([
    ['zh-CN', '粘贴'],
    ['ja', '貼り付け'],
    ['en-GB', 'Paste'],
    ['de', 'Paste'],
  ])(
    'falls back to the system language %s before the data is read',
    (locale, paste) => {
      mocks.locale = locale
      rightClick()

      expect(
        (mocks.built[0]!.template as Item[]).find(
          (item) => item.role === 'paste'
        )?.label
      ).toBe(paste)
    }
  )

  it('tells the window while the menu is open, so a panel does not fold away under it', () => {
    rightClick()
    const { handlers } = mocks.built[0]!

    handlers.get('menu-will-show')!()
    expect(visible).toHaveBeenLastCalledWith(true)
    handlers.get('menu-will-close')!()
    expect(visible).toHaveBeenLastCalledWith(false)
  })

  it('still pops up when the window cannot be found', () => {
    mocks.window = null
    rightClick()

    expect(mocks.popup).toHaveBeenCalledWith({
      x: 12,
      y: 34,
      sourceType: 'mouse',
    })
  })
})
