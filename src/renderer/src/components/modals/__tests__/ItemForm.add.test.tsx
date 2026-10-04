import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { GroupTab } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import ItemForm from '../ItemForm'
import Modal from '../Modal'

function open(
  tab: GroupTab,
  groupId: string | null = null,
  itemId: string | null = null
): void {
  act(() =>
    useAppStore.setState({ modal: { kind: 'item', tab, groupId, itemId } })
  )
}

const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } })

// What a person does: select what is in the field (when there is something), then paste.
const paste = (testId: string, text: string) => {
  const input = screen.getByTestId(testId) as HTMLInputElement
  input.setSelectionRange(0, input.value.length)
  fireEvent.paste(input, { clipboardData: { getData: () => text } })
}

async function save(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('item-save'))
  })
}

async function saveAndContinue(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(screen.getByTestId(testId), {
      key: 'Enter',
      ctrlKey: true,
    })
  })
}

const state = () => useAppStore.getState()

describe('the add form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia; the dialog frame asks for it.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
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
    })
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null })
  })

  describe('the order of the fields', () => {
    it.each(['folders', 'apps'] as const)(
      'puts the %s path before the name and the cursor in it',
      (tab) => {
        render(<Modal />)
        open(tab)

        const path = screen.getByTestId('item-path-input')
        const name = screen.getByTestId('item-name-input')
        expect(
          path.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(path).toHaveFocus()
      }
    )

    it('puts the address before the name for a website, with the cursor in it', () => {
      render(<Modal />)
      open('websites')

      const url = screen.getByTestId('item-url-input')
      expect(
        url.compareDocumentPosition(screen.getByTestId('item-name-input')) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(url).toHaveFocus()
    })

    it.each(['notes', 'passwords', 'commands'] as const)(
      'keeps the name first for %s',
      (tab) => {
        render(<Modal />)
        open(tab)

        expect(screen.getByTestId('item-name-input')).toHaveFocus()
      }
    )
  })

  describe('naming an entry after its target', () => {
    it('fills the name from a pasted folder path, without its quotes', () => {
      open('folders')
      render(<ItemForm />)

      paste('item-path-input', '"C:\\Users\\me\\Projects\\Atlas"')

      expect(screen.getByTestId('item-path-input')).toHaveValue(
        'C:\\Users\\me\\Projects\\Atlas'
      )
      expect(screen.getByTestId('item-name-input')).toHaveValue('Atlas')
    })

    it('fills the name from the file of a pasted program, without its extension', () => {
      open('apps')
      render(<ItemForm />)

      paste('item-path-input', '"C:\\Program Files\\Editor\\editor.exe"')

      expect(screen.getByTestId('item-name-input')).toHaveValue('editor')
    })

    it('completes a pasted address and names the site after its host', () => {
      open('websites')
      render(<ItemForm />)

      paste('item-url-input', 'www.github.com/anthropics')

      expect(screen.getByTestId('item-url-input')).toHaveValue(
        'https://www.github.com/anthropics'
      )
      expect(screen.getByTestId('item-name-input')).toHaveValue('github.com')
    })

    it('never replaces a name the user typed', () => {
      open('websites')
      render(<ItemForm />)
      type('item-name-input', 'My code')

      paste('item-url-input', 'https://github.com')

      expect(screen.getByTestId('item-name-input')).toHaveValue('My code')
    })

    it('replaces its own name when the target changes, but not one the user then edited', () => {
      open('websites')
      render(<ItemForm />)

      paste('item-url-input', 'https://github.com')
      expect(screen.getByTestId('item-name-input')).toHaveValue('github.com')
      paste('item-url-input', 'https://gitlab.com')
      expect(screen.getByTestId('item-name-input')).toHaveValue('gitlab.com')

      type('item-name-input', 'Work repos')
      paste('item-url-input', 'https://bitbucket.org')
      expect(screen.getByTestId('item-name-input')).toHaveValue('Work repos')
    })

    it('cleans the target and names the entry when the field is left, for what was typed', () => {
      open('folders')
      render(<ItemForm />)

      type('item-path-input', '  "D:\\Photos\\2024"  ')
      fireEvent.blur(screen.getByTestId('item-path-input'))

      expect(screen.getByTestId('item-path-input')).toHaveValue(
        'D:\\Photos\\2024'
      )
      expect(screen.getByTestId('item-name-input')).toHaveValue('2024')
    })

    it('completes a typed address when the field is left', () => {
      open('websites')
      render(<ItemForm />)

      type('item-url-input', 'localhost:3000')
      fireEvent.blur(screen.getByTestId('item-url-input'))

      expect(screen.getByTestId('item-url-input')).toHaveValue(
        'http://localhost:3000'
      )
      expect(screen.getByTestId('item-name-input')).toHaveValue('localhost')
    })

    it('leaves a half-typed address alone when leaving the field', () => {
      open('websites')
      render(<ItemForm />)

      type('item-url-input', 'exa mple')
      fireEvent.blur(screen.getByTestId('item-url-input'))

      expect(screen.getByTestId('item-url-input')).toHaveValue('exa mple')
      expect(screen.getByTestId('item-name-input')).toHaveValue('')
    })

    it('pastes into the middle of a typed target the ordinary way', () => {
      open('folders')
      render(<ItemForm />)
      type('item-path-input', 'C:\\Work')
      const input = screen.getByTestId('item-path-input') as HTMLInputElement
      input.setSelectionRange(2, 2)

      const prevented = !fireEvent.paste(input, {
        clipboardData: { getData: () => '\\Extra' },
      })

      // Not intercepted: the browser inserts it where the cursor is.
      expect(prevented).toBe(false)
      expect(screen.getByTestId('item-name-input')).toHaveValue('')
    })

    it('shows the name it will use as the placeholder, and says the field is optional when empty', () => {
      open('websites')
      render(<ItemForm />)
      expect(screen.getByTestId('item-name-input')).toHaveAttribute(
        'placeholder',
        'Leave empty to name it after the target'
      )

      type('item-url-input', 'https://www.example.com/page')

      expect(screen.getByTestId('item-name-input')).toHaveAttribute(
        'placeholder',
        'example.com'
      )
    })

    it('marks the name as required only where nothing can name it', () => {
      open('folders')
      const { unmount } = render(<ItemForm />)
      expect(screen.getByText('Name')).toBeInTheDocument()
      unmount()

      open('notes')
      render(<ItemForm />)
      expect(screen.getByText('Name *')).toBeInTheDocument()
    })
  })

  describe('saving without a name', () => {
    it.each([
      ['websites', 'item-url-input', 'github.com/anthropics', 'github.com'],
      ['folders', 'item-path-input', 'C:\\Work\\Atlas', 'Atlas'],
      ['apps', 'item-path-input', 'C:\\Tools\\Editor.exe', 'Editor'],
    ] as const)(
      'names a %s entry after its target',
      async (tab, testId, target, expectedName) => {
        open(tab)
        render(<ItemForm />)
        type(testId, target)

        await save()

        await waitFor(() =>
          expect(window.quickLaunch.saveData).toHaveBeenCalled()
        )
        expect(
          vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0].loose[tab]
        ).toHaveLength(1)
        expect(
          vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0].loose[
            tab
          ][0]
        ).toMatchObject({ name: expectedName })
      }
    )

    it('is still refused for a category with nothing to name it after', async () => {
      open('notes')
      render(<ItemForm />)

      await save()

      expect(screen.getByRole('alert')).toHaveTextContent('Enter a name')
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })

    it('asks for the target, not the name, when only the target is missing', async () => {
      open('websites')
      render(<ItemForm />)

      await save()

      expect(screen.getAllByRole('alert')).toHaveLength(2)
      // The cursor goes to the target first: that is the field that comes first.
      expect(screen.getByTestId('item-url-input')).toHaveFocus()
    })
  })

  describe('the place it is saved', () => {
    const GROUP = 'grp-folders-work'

    it('is a choice of loose entries and the groups of the category, defaulting to where it was opened from', () => {
      open('folders')
      render(<ItemForm />)

      const select = screen.getByTestId('item-destination') as HTMLSelectElement
      expect(select.tagName).toBe('SELECT')
      expect(select.value).toBe('')
      expect(
        Array.from(select.options).map((option) => option.textContent)
      ).toEqual(['Standalone items', '工作文件', '个人'])
      cleanup()

      open('folders', GROUP)
      render(<ItemForm />)
      expect(
        (screen.getByTestId('item-destination') as HTMLSelectElement).value
      ).toBe(GROUP)
    })

    it('is plain text when the category has no group to choose', () => {
      const data = createDefaultAppData()
      data.prefs.lang = 'en'
      data.folders = []
      useAppStore.setState({ data })
      open('folders')
      render(<ItemForm />)

      expect(screen.getByTestId('item-destination').tagName).not.toBe('SELECT')
      expect(screen.getByTestId('item-destination')).toHaveTextContent(
        'Standalone items'
      )
    })

    it('puts a new entry into the chosen group, at the end', async () => {
      open('folders')
      render(<ItemForm />)
      type('item-path-input', 'C:\\Work\\Atlas')
      fireEvent.change(screen.getByTestId('item-destination'), {
        target: { value: GROUP },
      })

      await save()

      const saved = state().data!
      const group = saved.folders.find((entry) => entry.id === GROUP)!
      expect(group.items.at(-1)).toMatchObject({ name: 'Atlas' })
      expect(saved.loose.folders).toHaveLength(0)
    })

    it('puts it into the group the dialog was opened for, with no choice made', async () => {
      open('folders', GROUP)
      render(<ItemForm />)
      type('item-path-input', 'C:\\Work\\Atlas')

      await save()

      expect(
        state().data!.folders.find((entry) => entry.id === GROUP)!.items
      ).toHaveLength(3)
    })

    it('moves an entry that is edited to another place in one save, and offers to move it back', async () => {
      const data = state().data!
      const before = data.folders.find((entry) => entry.id === GROUP)!.items
      const entry = before[0]!
      open('folders', GROUP, entry.id)
      render(<ItemForm />)
      fireEvent.change(screen.getByTestId('item-destination'), {
        target: { value: '' },
      })

      await save()

      expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
      const after = state().data!
      expect(
        after.folders.find((group) => group.id === GROUP)!.items
      ).toHaveLength(before.length - 1)
      expect(after.loose.folders.at(-1)).toMatchObject({ id: entry.id })
      expect(state().toast?.message).toBe(
        `Moved "${entry.name}" to Standalone items`
      )

      state().toast!.action!.run()
      await waitFor(() =>
        expect(
          state()
            .data!.folders.find((group) => group.id === GROUP)!
            .items.map((item) => item.id)
        ).toEqual(before.map((item) => item.id))
      )
      expect(state().data!.loose.folders).toHaveLength(0)
    })

    it('keeps an edited entry where it is, in its place in the list, when the place is not changed', async () => {
      const group = state().data!.folders.find((entry) => entry.id === GROUP)!
      const ids = group.items.map((item) => item.id)
      open('folders', GROUP, ids[0]!)
      render(<ItemForm />)
      type('item-name-input', 'Renamed')

      await save()

      const after = state().data!.folders.find((entry) => entry.id === GROUP)!
      expect(after.items.map((item) => item.id)).toEqual(ids)
      expect(after.items[0]).toMatchObject({ name: 'Renamed' })
      // Renaming says nothing.
      expect(state().toast).toBeNull()
    })
  })

  describe('announcing a new entry', () => {
    it('says what was added, with an undo that takes exactly it out again', async () => {
      open('websites')
      render(<ItemForm />)
      type('item-url-input', 'example.com')

      await save()

      expect(state().toast).toMatchObject({
        message: 'Added "example.com"',
        tone: 'success',
        action: { label: 'Undo' },
      })
      expect(state().data!.loose.websites).toHaveLength(1)

      state().toast!.action!.run()
      await waitFor(() => expect(state().data!.loose.websites).toHaveLength(0))
    })

    it('stays quiet about an edit that moved nothing', async () => {
      const entry = state().data!.folders[0]!.items[0]!
      open('folders', state().data!.folders[0]!.id, entry.id)
      render(<ItemForm />)
      type('item-name-input', 'Renamed')

      await save()

      expect(state().toast).toBeNull()
    })
  })

  describe('Ctrl+Enter: save and add another', () => {
    it('saves, empties the form, keeps the dialog and the place, and puts the cursor in the target', async () => {
      render(<Modal />)
      open('folders', 'grp-folders-work')
      paste('item-path-input', '"C:\\Work\\Atlas"')

      await saveAndContinue('item-path-input')

      expect(
        state()
          .data!.folders.find((entry) => entry.id === 'grp-folders-work')!
          .items.at(-1)
      ).toMatchObject({ name: 'Atlas', path: 'C:\\Work\\Atlas' })
      expect(state().modal).not.toBeNull()
      expect(screen.getByTestId('item-path-input')).toHaveValue('')
      expect(screen.getByTestId('item-name-input')).toHaveValue('')
      expect(screen.getByTestId('item-path-input')).toHaveFocus()
      expect(
        (screen.getByTestId('item-destination') as HTMLSelectElement).value
      ).toBe('grp-folders-work')
      expect(state().toast?.message).toBe('Added "Atlas"')
    })

    it('can go on as often as there are targets, each one named after itself', async () => {
      render(<Modal />)
      open('websites')

      for (const address of ['github.com', 'gitlab.com', 'example.org']) {
        paste('item-url-input', address)
        await saveAndContinue('item-url-input')
      }

      expect(state().data!.loose.websites.map((site) => site.name)).toEqual([
        'github.com',
        'gitlab.com',
        'example.org',
      ])
      expect(state().modal).not.toBeNull()
    })

    it('starts the question about unsaved changes over: an empty form closes at once', async () => {
      render(<Modal />)
      open('websites')
      paste('item-url-input', 'github.com')
      await saveAndContinue('item-url-input')

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(state().modal).toBeNull()
    })

    it('is not "changed" after a save when another place was chosen than the one it was opened for', async () => {
      render(<Modal />)
      open('websites')
      fireEvent.change(screen.getByTestId('item-destination'), {
        target: { value: 'grp-sites-fun' },
      })
      paste('item-url-input', 'github.com')
      await saveAndContinue('item-url-input')

      fireEvent.keyDown(document, { key: 'Escape' })

      // Nothing is left to lose, so no "discard?" bar: the dialog just closes.
      expect(state().modal).toBeNull()
    })

    it('does not save anything when the target is missing, and says so', async () => {
      render(<Modal />)
      open('websites')

      await saveAndContinue('item-url-input')

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
      expect(state().modal).not.toBeNull()
    })

    it.each(['commands', 'notes', 'passwords'] as const)(
      'is not there for %s: Ctrl+Enter does not save',
      async (tab) => {
        render(<Modal />)
        open(tab)
        type('item-name-input', 'Thing')

        await saveAndContinue('item-name-input')

        expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      }
    )

    it('is not there when an existing entry is edited', async () => {
      const entry = state().data!.folders[0]!.items[0]!
      render(<Modal />)
      open('folders', state().data!.folders[0]!.id, entry.id)
      type('item-name-input', 'Renamed')

      await saveAndContinue('item-name-input')

      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })

    it('tells in the footer for a new entry, and only then', () => {
      open('folders')
      render(<ItemForm />)
      expect(
        screen.getByText(/Ctrl\+Enter to save and add another/)
      ).toBeVisible()
      cleanup()

      open('notes')
      render(<ItemForm />)
      expect(screen.queryByText(/add another/)).toBeNull()
      expect(screen.getByText('Ctrl + S to save')).toBeInTheDocument()
    })
  })
})
