import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { useAppStore } from '../../../store/use-app-store'
import ItemForm from '../ItemForm'

function openForm(tab: 'folders' | 'apps' | 'websites'): void {
  useAppStore.setState({
    data: createDefaultAppData(),
    loading: false,
    saving: false,
    modal: { kind: 'item', tab, groupId: null, itemId: null },
  })
}

function type(testId: string, value: string): HTMLInputElement {
  const input = screen.getByTestId(testId) as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  return input
}

function savedLoose(tab: 'folders' | 'apps') {
  const call = vi.mocked(window.quickLaunch.saveData).mock.calls.at(-1)
  return call?.[0].loose[tab].at(-1)
}

// extra-3: a pasted path with quotes, spaces or a file: address saved fine and never opened.
describe('ItemForm path input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openForm('folders')
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the cleaned path as soon as the field is left', () => {
    render(<ItemForm />)

    const input = type('item-path-input', '  "C:\\Program Files\\App"  ')
    expect(input).toHaveValue('  "C:\\Program Files\\App"  ')

    fireEvent.blur(input)

    expect(input).toHaveValue('C:\\Program Files\\App')
  })

  it('turns a file: address into a path when the field is left', () => {
    render(<ItemForm />)

    const input = type('item-path-input', 'file:///C:/Users/me/My%20Files')
    fireEvent.blur(input)

    expect(input).toHaveValue('C:\\Users\\me\\My Files')
  })

  it('keeps %VARIABLES% as typed, and UNC paths', () => {
    render(<ItemForm />)

    const input = type('item-path-input', '"%USERPROFILE%\\Documents"')
    fireEvent.blur(input)
    expect(input).toHaveValue('%USERPROFILE%\\Documents')

    type('item-path-input', '\\\\nas\\share')
    fireEvent.blur(input)
    expect(input).toHaveValue('\\\\nas\\share')
  })

  it('saves the cleaned path even when it was never left (Ctrl+S right after a paste)', async () => {
    render(<ItemForm />)
    type('item-name-input', 'Designs')
    type('item-path-input', '\u202a"D:\\Designs\\"  ')

    fireEvent.click(screen.getByTestId('item-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedLoose('folders')?.path).toBe('D:\\Designs\\')
  })

  it('saves a cleaned application path too', async () => {
    cleanup()
    openForm('apps')
    render(<ItemForm />)
    type('item-name-input', 'Editor')
    type('item-path-input', ' "C:\\Tools\\Editor.exe" ')

    fireEvent.click(screen.getByTestId('item-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedLoose('apps')?.path).toBe('C:\\Tools\\Editor.exe')
  })

  it('does not accept a path that is nothing but quotes and spaces', async () => {
    render(<ItemForm />)
    type('item-name-input', 'Empty')
    type('item-path-input', ' "" ')

    fireEvent.click(screen.getByTestId('item-save'))

    expect(await screen.findByRole('alert')).toHaveTextContent('路径')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    expect(screen.getByTestId('item-path-input')).toHaveValue('')
  })

  it('leaves the path as it is when the browse dialog gave it', async () => {
    vi.mocked(window.quickLaunch.selectPath).mockResolvedValueOnce({
      ok: true,
      data: 'C:\\Work',
    })
    render(<ItemForm />)

    fireEvent.click(screen.getByTestId('item-browse'))

    await waitFor(() =>
      expect(screen.getByTestId('item-path-input')).toHaveValue('C:\\Work')
    )
  })
})
