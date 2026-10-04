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

function open(tab: GroupTab, itemId: string | null = null): void {
  useAppStore.setState({
    modal: { kind: 'item', tab, groupId: null, itemId },
  })
}

const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } })

async function save(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId('item-save'))
  })
}

function savedLoose(tab: GroupTab) {
  return vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0].loose[tab]
}

describe('ItemForm validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      saving: false,
      error: null,
      modal: null,
    })
  })

  afterEach(() => {
    cleanup()
  })

  describe('a missing name', () => {
    it('is shown right under the field, with the cursor in it and the field marked invalid', async () => {
      open('notes')
      render(<ItemForm />)

      await save()

      const input = screen.getByTestId('item-name-input')
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('请填写名称')
      // Next to its field, not in a footer that a small window can crop.
      expect(alert.closest('.form-field')).toContainElement(input)
      expect(input).toHaveFocus()
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.getAttribute('aria-describedby')).toBe(alert.id)
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })

    it('goes away as soon as the field is edited, not at the next save', async () => {
      open('notes')
      render(<ItemForm />)
      await save()
      expect(screen.getByRole('alert')).toBeInTheDocument()

      type('item-name-input', 'E')

      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByTestId('item-name-input')).not.toHaveAttribute(
        'aria-invalid'
      )
      expect(screen.getByTestId('item-name-input')).not.toHaveAttribute(
        'aria-describedby'
      )
    })
  })

  describe('a missing target', () => {
    it.each([
      ['folders', 'item-path-input', '请选择或填写路径'],
      ['apps', 'item-path-input', '请选择或填写路径'],
      ['websites', 'item-url-input', '请输入有效的 http 或 https 网址'],
    ] as const)(
      'is explained under the %s field and takes the cursor',
      async (tab, testId, message) => {
        open(tab)
        render(<ItemForm />)
        type('item-name-input', 'Thing')

        await save()

        const input = screen.getByTestId(testId)
        expect(screen.getByRole('alert')).toHaveTextContent(message)
        expect(
          screen.getByRole('alert').closest('.form-field')
        ).toContainElement(input)
        expect(input).toHaveFocus()
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      }
    )

    it('shows every wrong field at once and puts the cursor in the first one', async () => {
      open('commands')
      render(<ItemForm />)

      await save()

      expect(screen.getAllByRole('alert')).toHaveLength(2)
      expect(screen.getByTestId('item-name-input')).toHaveFocus()
      expect(screen.getByTestId('command-code-input')).toHaveAttribute(
        'aria-invalid',
        'true'
      )
    })

    it('moves the cursor on to the next wrong field once the first is fixed', async () => {
      open('commands')
      render(<ItemForm />)
      await save()

      type('item-name-input', 'Build')
      await save()

      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getByTestId('command-code-input')).toHaveFocus()
    })

    it('asks for code in a command, in the editor itself', async () => {
      open('commands')
      render(<ItemForm />)
      type('item-name-input', 'Build')

      await save()

      const editor = screen.getByTestId('command-code-input')
      expect(screen.getByRole('alert')).toHaveTextContent('请填写命令或代码')
      expect(editor).toHaveFocus()
      expect(editor).toHaveAttribute('aria-invalid', 'true')
      expect(editor.getAttribute('aria-describedby')).toBe(
        screen.getByRole('alert').id
      )

      type('command-code-input', 'git status')
      expect(screen.queryByRole('alert')).toBeNull()
      expect(editor).not.toHaveAttribute('aria-invalid')
    })
  })

  describe('a path', () => {
    it.each([
      ['folders', '"C:\\Users\\me\\My Docs"', 'C:\\Users\\me\\My Docs'],
      [
        'apps',
        '"C:\\Program Files\\Editor\\editor.exe"',
        'C:\\Program Files\\Editor\\editor.exe',
      ],
      ['apps', "'D:\\Tools\\run.cmd'", 'D:\\Tools\\run.cmd'],
      ['folders', '  C:\\Work  ', 'C:\\Work'],
      ['folders', '\\\\server\\share\\team', '\\\\server\\share\\team'],
    ] as const)(
      'pasted into %s as %j is saved as %j',
      async (tab, typed, saved) => {
        open(tab)
        render(<ItemForm />)
        type('item-name-input', 'Thing')
        type('item-path-input', typed)

        await save()

        await waitFor(() =>
          expect(window.quickLaunch.saveData).toHaveBeenCalled()
        )
        expect(savedLoose(tab)?.[0]).toMatchObject({ path: saved })
      }
    )

    it.each(['Work', 'notepad.exe', '.\\notes', 'C:\\bad|name', 'C:\\what?'])(
      'is refused when it is %j, with the way to write one',
      async (typed) => {
        open('apps')
        render(<ItemForm />)
        type('item-name-input', 'Thing')
        type('item-path-input', typed)

        await save()

        expect(screen.getByRole('alert')).toHaveTextContent('完整路径')
        expect(screen.getByTestId('item-path-input')).toHaveFocus()
        expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
      }
    )

    it('that is already saved keeps saving as it is, so an old entry can still be renamed', async () => {
      const data = createDefaultAppData()
      data.loose.apps = [
        {
          id: 'old',
          kind: 'app',
          name: 'Notepad',
          icon: 'N',
          path: 'notepad.exe',
        },
      ]
      useAppStore.setState({ data })
      open('apps', 'old')
      render(<ItemForm />)

      type('item-name-input', 'Notepad (work)')
      await save()

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(savedLoose('apps')?.[0]).toMatchObject({
        name: 'Notepad (work)',
        path: 'notepad.exe',
      })
    })

    it('that is changed to something wrong is refused even on an old entry', async () => {
      const data = createDefaultAppData()
      data.loose.apps = [
        {
          id: 'old',
          kind: 'app',
          name: 'Notepad',
          icon: 'N',
          path: 'notepad.exe',
        },
      ]
      useAppStore.setState({ data })
      open('apps', 'old')
      render(<ItemForm />)

      type('item-path-input', 'tools\\run.exe')
      await save()

      expect(screen.getByRole('alert')).toHaveTextContent('完整路径')
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })
  })

  describe('a web address', () => {
    it.each([
      ['example.com', 'https://example.com'],
      ['localhost:3000', 'http://localhost:3000'],
      ['127.0.0.1:8080/app', 'http://127.0.0.1:8080/app'],
      ['192.168.1.1', 'http://192.168.1.1'],
      ['"https://example.com/a"', 'https://example.com/a'],
    ])('typed as %j is saved as %j', async (typed, saved) => {
      open('websites')
      render(<ItemForm />)
      type('item-name-input', 'Site')
      type('item-url-input', typed)

      await save()

      await waitFor(() =>
        expect(window.quickLaunch.saveData).toHaveBeenCalled()
      )
      expect(savedLoose('websites')?.[0]).toMatchObject({ url: saved })
    })

    it.each([
      'file:///C:/test',
      'ftp://example.com',
      'mailto:me@example.com',
      'exa mple.com',
      'https://',
    ])('typed as %j is refused', async (typed) => {
      open('websites')
      render(<ItemForm />)
      type('item-name-input', 'Site')
      type('item-url-input', typed)

      await save()

      expect(screen.getByRole('alert')).toHaveTextContent('http')
      expect(screen.getByTestId('item-url-input')).toHaveFocus()
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    })
  })

  it('saves once everything is right, and closes the dialog', async () => {
    open('folders')
    render(<ItemForm />)
    await save()
    expect(screen.getAllByRole('alert')).toHaveLength(2)

    type('item-name-input', 'Work')
    type('item-path-input', '"C:\\Work"')
    await save()

    await waitFor(() => expect(useAppStore.getState().modal).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(savedLoose('folders')?.[0]).toMatchObject({
      name: 'Work',
      path: 'C:\\Work',
    })
  })
})
