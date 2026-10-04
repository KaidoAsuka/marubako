import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { ClassifiedPath } from '../../../../shared/types'
import ExternalDropZone from '../../components/layout/ExternalDropZone'
import { useAppStore } from '../../store/use-app-store'

const state = () => useAppStore.getState()

type Transfer = {
  types?: string[]
  files?: object[]
  data?: Record<string, string>
}

function transfer({ types, files = [], data = {} }: Transfer) {
  return {
    types: types ?? [...(files.length ? ['Files'] : []), ...Object.keys(data)],
    files,
    dropEffect: 'none',
    getData: (type: string) => data[type] ?? '',
  }
}

/** What the paste event of Ctrl+V carries. */
function pasteText(text: string, target: Element = document.body) {
  return fireEvent.paste(target, {
    clipboardData: transfer({ data: { 'text/plain': text } }),
  })
}

function setClassifier(map: Record<string, ClassifiedPath | null>): void {
  vi.mocked(window.quickLaunch.classifyPaths).mockImplementation(
    async (paths: string[]) => ({
      ok: true,
      data: paths.flatMap((path) => (map[path] ? [map[path]!] : [])),
    })
  )
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('adding by paste and drop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia; the feedback and the zone ask for it.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    Object.assign(window.quickLaunch, {
      getDroppedPaths: vi.fn((files: Array<{ path?: string }>) =>
        files.map((file) => file.path ?? '').filter(Boolean)
      ),
      classifyPaths: vi.fn(async () => ({ ok: true, data: [] })),
    })
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      error: null,
      toast: null,
      modal: null,
      commandOpen: false,
      widgetPopup: null,
      currentTab: 'tasks',
    })
    render(<ExternalDropZone />)
  })

  afterEach(() => {
    cleanup()
    document.body.classList.remove('external-drag-active')
    useAppStore.setState({ widgetPopup: null, modal: null, commandOpen: false })
  })

  describe('Ctrl+V on the panel', () => {
    it('adds nothing to a category that is hidden in the settings, and says why', async () => {
      act(() => {
        const data = state().data!
        data.prefs.hiddenTabs = ['websites']
        useAppStore.setState({ data: { ...data } })
      })

      pasteText('https://www.example.org/docs')
      await settle()

      expect(state().data!.loose.websites).toHaveLength(0)
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(state().toast?.message).toBe(
        'That category is hidden in Settings, so nothing was added'
      )
      expect(state().currentTab).not.toBe('websites')
    })

    it('adds a pasted link as a website, goes to that category and says so, with an undo', async () => {
      pasteText('https://www.example.org/docs')
      await settle()

      expect(state().data!.loose.websites).toEqual([
        expect.objectContaining({
          kind: 'website',
          name: 'example.org',
          url: 'https://www.example.org/docs',
        }),
      ])
      expect(state().currentTab).toBe('websites')
      expect(state().toast).toMatchObject({
        message: 'Added "example.org"',
        action: { label: 'Undo' },
      })
      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)

      state().toast!.action!.run()
      await vi.waitFor(() =>
        expect(state().data!.loose.websites).toHaveLength(0)
      )
    })

    it('takes the event over, so nothing else pastes it', () => {
      const proceeded = pasteText('https://example.org')
      expect(proceeded).toBe(false)
    })

    it('adds a pasted folder path, without its quotes, into the folders category', async () => {
      setClassifier({
        'C:\\Work\\Atlas': { kind: 'folder', target: 'C:\\Work\\Atlas' },
      })

      pasteText('"C:\\Work\\Atlas"')
      await settle()

      expect(window.quickLaunch.classifyPaths).toHaveBeenCalledWith([
        'C:\\Work\\Atlas',
      ])
      expect(state().data!.loose.folders).toEqual([
        expect.objectContaining({
          kind: 'folder',
          name: 'Atlas',
          path: 'C:\\Work\\Atlas',
        }),
      ])
      expect(state().currentTab).toBe('folders')
    })

    it('puts a program in the programs category, named after the file', async () => {
      setClassifier({
        'C:\\Tools\\Editor.exe': {
          kind: 'app',
          target: 'C:\\Tools\\Editor.exe',
        },
      })

      pasteText('C:\\Tools\\Editor.exe')
      await settle()

      expect(state().data!.loose.apps).toEqual([
        expect.objectContaining({ kind: 'app', name: 'Editor' }),
      ])
      expect(state().currentTab).toBe('apps')
    })

    it('adds a file as a folder-category entry with its own name and icon', async () => {
      setClassifier({
        'C:\\Work\\plan.txt': { kind: 'file', target: 'C:\\Work\\plan.txt' },
      })

      pasteText('C:\\Work\\plan.txt')
      await settle()

      expect(state().data!.loose.folders).toEqual([
        expect.objectContaining({
          name: 'plan.txt',
          path: 'C:\\Work\\plan.txt',
          icon: 'tile:file-text:0',
        }),
      ])
    })

    it('adds everything in a pasted list in one save, and says how many', async () => {
      setClassifier({
        'C:\\Work\\a': { kind: 'folder', target: 'C:\\Work\\a' },
        'C:\\Work\\b': { kind: 'folder', target: 'C:\\Work\\b' },
      })

      pasteText('"C:\\Work\\a"\r\n"C:\\Work\\b"\r\n')
      await settle()

      expect(state().data!.loose.folders.map((entry) => entry.name)).toEqual([
        'a',
        'b',
      ])
      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
      expect(state().toast?.message).toBe('Added 2 items to Folders')
    })

    it('counts what was already there instead of adding it twice', async () => {
      const existing = state().data!.websites[0]!.items[0]!
      expect(existing.url).toBe('https://cn.bing.com')

      pasteText('https://cn.bing.com\nhttps://new.example.org')
      await settle()

      expect(state().data!.loose.websites).toHaveLength(1)
      expect(state().toast?.message).toBe('Added 1, 1 already there')
    })

    it('says so when everything pasted is already there, and changes nothing', async () => {
      pasteText('https://CN.BING.com/')
      await settle()

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(state().toast?.message).toBe('Already added')
    })

    it('treats the same folder spelled differently as the same folder', async () => {
      setClassifier({
        'c:/work/documents/': { kind: 'folder', target: 'c:/work/documents/' },
      })
      const data = state().data!
      data.loose.folders = [
        {
          id: 'f1',
          kind: 'folder',
          name: 'Docs',
          icon: 'x',
          path: 'C:\\Work\\Documents',
        },
      ]
      useAppStore.setState({ data })

      pasteText('c:/work/documents/')
      await settle()

      expect(state().data!.loose.folders).toHaveLength(1)
      expect(state().toast?.message).toBe('Already added')
    })

    it('adds the files of a paste that carries files, by their paths', async () => {
      setClassifier({
        'C:\\Work\\plan.txt': { kind: 'file', target: 'C:\\Work\\plan.txt' },
      })

      fireEvent.paste(document.body, {
        clipboardData: transfer({
          files: [{ path: 'C:\\Work\\plan.txt' }],
        }),
      })
      await settle()

      expect(window.quickLaunch.getDroppedPaths).toHaveBeenCalled()
      expect(state().data!.loose.folders).toHaveLength(1)
    })

    it('ignores ordinary text, and leaves the paste to whoever wants it', async () => {
      const proceeded = pasteText('Remember the milk\nhttps://example.org')
      await settle()

      expect(proceeded).toBe(true)
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(state().toast).toBeNull()
    })

    it('says nothing when a pasted path turns out not to exist', async () => {
      setClassifier({})

      pasteText('C:\\Nowhere\\at\\all')
      await settle()

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(state().toast).toBeNull()
    })

    it.each(['input', 'textarea'] as const)(
      'leaves a paste into a %s alone',
      async (tag) => {
        const field = document.createElement(tag)
        document.body.append(field)

        const proceeded = pasteText('https://example.org', field)
        await settle()
        field.remove()

        expect(proceeded).toBe(true)
        expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      }
    )

    it('leaves a paste alone while a dialog or the search box is open', async () => {
      act(() =>
        useAppStore.setState({
          modal: { kind: 'group', tab: 'folders', groupId: null },
        })
      )
      pasteText('https://example.org')
      act(() => useAppStore.setState({ modal: null, commandOpen: true }))
      pasteText('https://example.org')
      await settle()

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })

    it('puts it into the group whose popup is open', async () => {
      act(() =>
        useAppStore.setState({
          currentTab: 'websites',
          widgetPopup: { tab: 'websites', groupId: 'grp-sites-fun' },
        })
      )

      pasteText('https://example.org')
      await settle()

      expect(
        state()
          .data!.websites.find((group) => group.id === 'grp-sites-fun')!
          .items.map((item) => item.name)
      ).toEqual(['哔哩哔哩', 'example.org'])
      expect(state().data!.loose.websites).toHaveLength(0)
    })

    it('adds nothing when the write fails, and does not move the view', async () => {
      vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
        ok: false,
        error: 'disk full',
      })

      pasteText('https://example.org')
      await settle()

      expect(state().data!.loose.websites).toHaveLength(0)
      expect(state().currentTab).toBe('tasks')
      expect(state().toast?.message).toBe('disk full')
    })
  })

  describe('dragging a file in', () => {
    const drag = (
      type: 'dragEnter' | 'dragOver',
      over: Transfer,
      el?: Element
    ) => fireEvent[type](el ?? document.body, { dataTransfer: transfer(over) })

    it('shows the drop area with its words, takes the event over and ends with the drag', () => {
      drag('dragEnter', { files: [{ path: 'C:\\x' }] })
      const proceeded = drag('dragOver', { files: [{ path: 'C:\\x' }] })

      expect(proceeded).toBe(false)
      expect(screen.getByTestId('external-drop-zone')).toHaveTextContent(
        'Drop to add'
      )
      expect(document.body).toHaveClass('external-drag-active')

      fireEvent.dragLeave(document.body, {
        dataTransfer: transfer({ files: [{ path: 'C:\\x' }] }),
      })

      expect(screen.queryByTestId('external-drop-zone')).toBeNull()
      expect(document.body).not.toHaveClass('external-drag-active')
    })

    it('also reacts to a link dragged in', () => {
      drag('dragEnter', { data: { 'text/uri-list': 'https://example.org' } })
      drag('dragOver', { data: { 'text/uri-list': 'https://example.org' } })

      expect(screen.getByTestId('external-drop-zone')).toBeInTheDocument()
    })

    it('ignores a drag of plain text, and a drag while a dialog is open', () => {
      const plain = drag('dragOver', { data: { 'text/plain': 'hello' } })
      expect(plain).toBe(true)
      expect(screen.queryByTestId('external-drop-zone')).toBeNull()

      act(() =>
        useAppStore.setState({
          modal: { kind: 'group', tab: 'folders', groupId: null },
        })
      )
      drag('dragOver', { files: [{ path: 'C:\\x' }] })
      expect(screen.queryByTestId('external-drop-zone')).toBeNull()
    })

    it('names the group under the pointer and rings it, and takes the ring away again', () => {
      act(() => useAppStore.setState({ currentTab: 'folders' }))
      const card = document.createElement('div')
      card.setAttribute('data-top-entry-type', 'group')
      card.setAttribute('data-top-entry-id', 'grp-folders-work')
      const inner = document.createElement('span')
      card.append(inner)
      document.body.append(card)

      drag('dragOver', { files: [{ path: 'C:\\x' }] }, inner)

      expect(screen.getByTestId('external-drop-zone')).toHaveTextContent(
        'Add to "工作文件"'
      )
      expect(card).toHaveClass('external-drop-target')

      drag('dragOver', { files: [{ path: 'C:\\x' }] })
      expect(card).not.toHaveClass('external-drop-target')
      expect(screen.getByTestId('external-drop-zone')).toHaveTextContent(
        'Drop to add'
      )
      card.remove()
    })

    it('drops files into their category, loose, with the view following', async () => {
      setClassifier({
        'C:\\Work\\Atlas': { kind: 'folder', target: 'C:\\Work\\Atlas' },
        'C:\\Tools\\Editor.exe': {
          kind: 'app',
          target: 'C:\\Tools\\Editor.exe',
        },
      })

      const proceeded = fireEvent.drop(document.body, {
        dataTransfer: transfer({
          files: [
            { path: 'C:\\Work\\Atlas' },
            { path: 'C:\\Tools\\Editor.exe' },
          ],
        }),
      })
      await settle()

      expect(proceeded).toBe(false)
      expect(state().data!.loose.folders).toHaveLength(1)
      expect(state().data!.loose.apps).toHaveLength(1)
      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
      expect(state().currentTab).toBe('folders')
      expect(state().toast?.message).toBe('Added 2 items')
      expect(screen.queryByTestId('external-drop-zone')).toBeNull()
    })

    it('drops them into the group card they land on', async () => {
      act(() => useAppStore.setState({ currentTab: 'folders' }))
      setClassifier({
        'C:\\Work\\Atlas': { kind: 'folder', target: 'C:\\Work\\Atlas' },
      })
      const card = document.createElement('div')
      card.setAttribute('data-top-entry-type', 'group')
      card.setAttribute('data-top-entry-id', 'grp-folders-life')
      document.body.append(card)

      fireEvent.drop(card, {
        dataTransfer: transfer({ files: [{ path: 'C:\\Work\\Atlas' }] }),
      })
      await settle()
      card.remove()

      expect(
        state()
          .data!.folders.find((group) => group.id === 'grp-folders-life')!
          .items.map((item) => item.name)
      ).toEqual(['下载', 'Atlas'])
      expect(state().data!.loose.folders).toHaveLength(0)
    })

    it('drops a link as a website', async () => {
      fireEvent.drop(document.body, {
        dataTransfer: transfer({
          data: {
            'text/uri-list': '# a comment\r\nhttps://example.org/page\r\n',
          },
        }),
      })
      await settle()

      expect(state().data!.loose.websites).toEqual([
        expect.objectContaining({ url: 'https://example.org/page' }),
      ])
    })

    it('adds the address inside a dropped internet shortcut', async () => {
      setClassifier({
        'C:\\Links\\site.url': {
          kind: 'website',
          target: 'https://example.org/',
        },
      })

      fireEvent.drop(document.body, {
        dataTransfer: transfer({ files: [{ path: 'C:\\Links\\site.url' }] }),
      })
      await settle()

      expect(state().data!.loose.websites).toEqual([
        expect.objectContaining({ url: 'https://example.org/' }),
      ])
    })

    it('answers a drop with nothing to add', async () => {
      setClassifier({})

      fireEvent.drop(document.body, {
        dataTransfer: transfer({ files: [{ path: 'C:\\Nowhere' }] }),
      })
      await settle()

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(state().toast?.message).toBe(
        'There is nothing here that can be added'
      )
    })

    it('shows the error when the main process cannot look at the paths', async () => {
      vi.mocked(window.quickLaunch.classifyPaths).mockResolvedValueOnce({
        ok: false,
        error: 'Invalid panel sender',
      })

      fireEvent.drop(document.body, {
        dataTransfer: transfer({ files: [{ path: 'C:\\x' }] }),
      })
      await settle()

      expect(state().toast).toMatchObject({
        message: 'Invalid panel sender',
        tone: 'danger',
      })
    })

    it('does not add anything while a dialog is open', async () => {
      act(() =>
        useAppStore.setState({
          modal: { kind: 'group', tab: 'folders', groupId: null },
        })
      )

      fireEvent.drop(document.body, {
        dataTransfer: transfer({ files: [{ path: 'C:\\Work\\Atlas' }] }),
      })
      await settle()

      expect(window.quickLaunch.classifyPaths).not.toHaveBeenCalled()
    })
  })
})
