import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultAppData } from '../../../../shared/default-data'
import type { Lang } from '../../../../shared/types'
import { safetyStrings } from '../../i18n/safety'
import { useAppStore } from '../../store/use-app-store'
import { OPEN_FAILURE_MS, openEntry } from '../open-entry'

describe('openEntry', () => {
  const folder = {
    id: 'folder',
    kind: 'folder' as const,
    name: 'Docs',
    icon: 'F',
    path: 'C:\\Docs',
  }
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = createDefaultAppData()
    data.prefs.hideAfterLaunch = true
    useAppStore.setState({ data, toast: null })
  })
  it('dismisses only after the entry has opened successfully', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: true,
      data: '',
    })
    expect(await openEntry('folders', folder, 'default', null)).toBe(true)
    expect(window.quickLaunch.window.dismissAfterLaunch).toHaveBeenCalledOnce()
  })
  it('lets the main process decide between the ball and the tray', async () => {
    // The renderer used to call hide() itself, which hid the ball as well. It must not pick a
    // side any more: whether the ball is kept is a main-process preference.
    await openEntry('folders', folder, 'default', null)
    expect(window.quickLaunch.window.hide).not.toHaveBeenCalled()
    expect(window.quickLaunch.window.collapse).not.toHaveBeenCalled()
  })
  it('forgets revealed passwords when the panel is dismissed', async () => {
    useAppStore.setState({ revealedPasswordIds: ['secret'] })
    await openEntry('folders', folder, 'default', null)
    expect(useAppStore.getState().revealedPasswordIds).toEqual([])
  })
  it('leaves the panel alone when the setting is off', async () => {
    const data = createDefaultAppData()
    data.prefs.hideAfterLaunch = false
    useAppStore.setState({ data })
    expect(await openEntry('folders', folder, 'default', null)).toBe(true)
    expect(window.quickLaunch.window.dismissAfterLaunch).not.toHaveBeenCalled()
  })
  it('says nothing when it succeeds', async () => {
    expect(await openEntry('folders', folder, 'default', null)).toBe(true)
    expect(useAppStore.getState().toast).toBeNull()
  })
  it('keeps the panel visible and reports a launch failure', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: 'ENOENT: no such file or directory, access C:\\Docs',
      code: 'path_missing',
    })
    expect(await openEntry('folders', folder, 'default', null)).toBe(false)
    expect(window.quickLaunch.window.dismissAfterLaunch).not.toHaveBeenCalled()
    expect(useAppStore.getState().toast).toMatchObject({
      message: '找不到「Docs」：路径已被移动、删除，或所在的磁盘还没有连接。',
      tone: 'danger',
    })
  })
})

// i18n-copy-2, collection-ui-4, flow-3: the failure is said in the window's language, names the
// entry, never shows the raw English error, stays long enough to act on and offers "Edit".
describe('an entry that would not open', () => {
  const group = {
    id: 'group-1',
    name: 'Work',
    icon: 'folder',
    open: true,
  }
  const folder = {
    id: 'folder-1',
    kind: 'folder' as const,
    name: 'Designs',
    icon: 'F',
    path: 'D:\\Old\\Designs',
  }
  const site = {
    id: 'site-1',
    kind: 'website' as const,
    name: 'Docs site',
    icon: 'W',
    url: 'https://exa mple.com',
  }
  const app = {
    id: 'app-1',
    kind: 'app' as const,
    name: 'Editor',
    icon: 'A',
    path: 'C:\\Gone\\editor.exe',
  }
  const RAW = "ENOENT: no such file or directory, access 'D:\\Old\\Designs'"

  function setup(lang: Lang = 'zh'): void {
    const data = createDefaultAppData()
    data.prefs.lang = lang
    data.folders = [{ ...group, items: [folder] }]
    data.loose.folders = []
    data.loose.websites = [site]
    data.loose.apps = [app]
    useAppStore.setState({
      data,
      toast: null,
      modal: null,
      commandOpen: false,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setup()
  })

  it('never puts the raw error on screen', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'path_missing',
    })

    await openEntry('folders', folder, 'default', group.id)

    const toast = useAppStore.getState().toast
    expect(toast?.message).not.toContain('ENOENT')
    expect(toast?.message).not.toContain('D:\\Old')
    expect(toast?.message).toContain('Designs')
    // The raw text goes to the log instead.
    expect(console.warn).toHaveBeenCalledWith(
      'Could not open the entry',
      'folder-1',
      RAW
    )
  })

  it('stays much longer than a confirmation and carries an Edit button', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'path_missing',
    })

    await openEntry('folders', folder, 'default', group.id)

    const toast = useAppStore.getState().toast
    expect(OPEN_FAILURE_MS).toBeGreaterThanOrEqual(10_000)
    expect(toast?.duration).toBe(OPEN_FAILURE_MS)
    expect(toast?.tone).toBe('danger')
    expect(toast?.action?.label).toBe('编辑')
  })

  it.each([
    ['path_missing', 'openPath', folder, '找不到「Designs」'],
    ['not_a_folder', 'openPath', folder, '「Designs」的路径无效'],
    ['invalid_path', 'openPath', folder, '「Designs」的路径格式不正确'],
    ['no_permission', 'openPath', folder, '没有权限打开「Designs」'],
    ['app_missing', 'openApp', app, '找不到程序「Editor」'],
    [
      'open_failed',
      'openApp',
      app,
      '无法打开「Editor」：可能没有与之关联的程序',
    ],
    ['invalid_url', 'openUrl', site, '「Docs site」的网址无效'],
  ] as const)('says %s specifically', async (code, method, item, expected) => {
    const failing = window.quickLaunch[method] as unknown as ReturnType<
      typeof vi.fn
    >
    failing.mockResolvedValueOnce({ ok: false, error: 'raw', code })
    const tab =
      item.kind === 'folder'
        ? 'folders'
        : item.kind === 'app'
          ? 'apps'
          : 'websites'

    await openEntry(tab, item as never, 'default', null)

    expect(useAppStore.getState().toast?.message).toContain(expected)
  })

  it('says it in general words when the failure was not classified', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: 'something odd',
    })

    await openEntry('folders', folder, 'default', group.id)

    expect(useAppStore.getState().toast?.message).toBe(
      '无法打开「Designs」，请重试。'
    )
  })

  it('says it in general words when the call itself threw', async () => {
    vi.mocked(window.quickLaunch.openPath).mockRejectedValueOnce(
      new Error('Error invoking remote method: boom')
    )

    expect(await openEntry('folders', folder, 'default', group.id)).toBe(false)

    expect(useAppStore.getState().toast).toMatchObject({
      message: '无法打开「Designs」，请重试。',
      tone: 'danger',
    })
    expect(useAppStore.getState().toast?.action?.label).toBe('编辑')
  })

  it.each(['zh', 'en', 'ja'] as const)('speaks %s', async (lang) => {
    setup(lang)
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'path_missing',
    })

    await openEntry('folders', folder, 'default', group.id)

    const toast = useAppStore.getState().toast
    expect(toast?.message).toBe(
      safetyStrings[lang].open_err_path_missing!.replace('{name}', 'Designs')
    )
    expect(toast?.action?.label).toBe(safetyStrings[lang].open_edit)
  })

  it('opens the entry’s form on its path when Edit is pressed', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'path_missing',
    })
    await openEntry('folders', folder, 'default', group.id)

    useAppStore.getState().toast?.action?.run()

    expect(useAppStore.getState().modal).toEqual({
      kind: 'item',
      tab: 'folders',
      groupId: group.id,
      itemId: 'folder-1',
      focus: 'path',
    })
  })

  it('opens a website’s form on its address, and a loose entry’s without a group', async () => {
    vi.mocked(window.quickLaunch.openUrl).mockResolvedValueOnce({
      ok: false,
      error: 'Invalid URL',
      code: 'invalid_url',
    })
    await openEntry('websites', site, 'default', null)

    useAppStore.getState().toast?.action?.run()

    expect(useAppStore.getState().modal).toEqual({
      kind: 'item',
      tab: 'websites',
      groupId: null,
      itemId: 'site-1',
      focus: 'url',
    })
  })

  it('closes the search palette first when it was opened from there', async () => {
    useAppStore.setState({ commandOpen: true })
    vi.mocked(window.quickLaunch.openApp).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'app_missing',
    })
    await openEntry('apps', app, 'default', null)

    useAppStore.getState().toast?.action?.run()

    expect(useAppStore.getState().commandOpen).toBe(false)
    expect(useAppStore.getState().modal).toMatchObject({ kind: 'item' })
  })

  it('does nothing when the entry was deleted while the message was showing', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'path_missing',
    })
    await openEntry('folders', folder, 'default', group.id)
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            folders: [{ ...group, items: [] }],
          }
        : state.data,
    }))

    useAppStore.getState().toast?.action?.run()

    expect(useAppStore.getState().modal).toBeNull()
  })

  it('puts a name with special characters in the message as it is', async () => {
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: RAW,
      code: 'path_missing',
    })

    await openEntry(
      'folders',
      { ...folder, name: "R&D $& {name} $1 'x'" },
      'default',
      group.id
    )

    expect(useAppStore.getState().toast?.message).toContain(
      "「R&D $& {name} $1 'x'」"
    )
  })
})
