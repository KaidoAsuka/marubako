import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import { TILE_CATEGORIES, TILE_COLORS } from '../../../utils/tile-icon'
import IconPicker from '../IconPicker'

function setLang(lang: Lang): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({ data })
}

const focus = (node: HTMLElement | null | undefined) =>
  act(() => {
    node?.focus()
  })
const trigger = () => screen.getByTestId('icon-picker-trigger')
const open = () => fireEvent.click(trigger())
const dropdown = () => screen.getByTestId('icon-picker')
const glyph = (name: string) =>
  dropdown().querySelector<HTMLButtonElement>(`[data-glyph="${name}"]`)
const visibleGlyphs = () =>
  Array.from(dropdown().querySelectorAll('[data-glyph]')).map((node) =>
    node.getAttribute('data-glyph')
  )
const search = (text: string) =>
  fireEvent.change(screen.getByTestId('icon-search'), {
    target: { value: text },
  })

// A controlled wrapper so the picker sees the value it produced, like the forms do.
function Controlled({
  initial,
  onChange,
}: {
  initial: string
  onChange?: (icon: string) => void
}): JSX.Element {
  const [value, setValue] = useState(initial)

  return (
    <IconPicker
      value={value}
      onChange={(icon) => {
        setValue(icon)
        onChange?.(icon)
      }}
    />
  )
}

describe('IconPicker', () => {
  beforeEach(() => {
    setLang('zh')
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ data: null })
  })

  describe('choosing a tile', () => {
    it('shows 12 colours and the glyphs grouped by catalog category', () => {
      render(<IconPicker value="📁" onChange={vi.fn()} />)
      open()

      const colours = within(
        screen.getByRole('radiogroup', { name: '图标底色' })
      ).getAllByRole('radio')
      expect(colours).toHaveLength(12)
      expect(colours.map((node) => node.getAttribute('aria-label'))).toEqual(
        TILE_COLORS.map((colour) => colour.zh)
      )

      const headings = within(dropdown())
        .getAllByRole('heading', { level: 3 })
        .map((node) => node.textContent)
      expect(headings).toEqual(TILE_CATEGORIES.map((category) => category.zh))
      expect(visibleGlyphs()).toHaveLength(150)
    })

    it('produces tile:<glyph>:<colour> from a chosen colour and glyph', () => {
      const onChange = vi.fn()
      render(<Controlled initial="📁" onChange={onChange} />)
      open()

      fireEvent.click(screen.getByRole('radio', { name: '绿' }))
      // Choosing a colour alone does not touch the stored emoji.
      expect(onChange).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: '文件夹 目录' }))

      expect(onChange).toHaveBeenCalledWith('tile:folder:3')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('recolours the chosen glyph at once when another colour is picked', () => {
      const onChange = vi.fn()
      render(<Controlled initial="tile:globe:2" onChange={onChange} />)
      open()

      expect(screen.getByRole('radio', { name: '青' })).toBeChecked()
      expect(glyph('globe')).toHaveAttribute('aria-pressed', 'true')

      fireEvent.click(screen.getByRole('radio', { name: '红' }))

      expect(onChange).toHaveBeenLastCalledWith('tile:globe:7')
      expect(screen.getByRole('radio', { name: '红' })).toBeChecked()
      // The dropdown stays open so another glyph can follow with the new colour.
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('draws every glyph button in the current colour', () => {
      render(<IconPicker value="tile:globe:2" onChange={vi.fn()} />)
      open()

      expect(glyph('folder')?.querySelector('.entry-tile')).toHaveAttribute(
        'data-tile-color',
        '2'
      )
    })

    it('previews the stored icon on the trigger: tile, emoji or the empty placeholder', () => {
      const { rerender } = render(
        <IconPicker value="tile:key:4" onChange={vi.fn()} />
      )
      expect(trigger().querySelector('.entry-tile')).toHaveAttribute(
        'data-tile-glyph',
        'key'
      )

      rerender(<IconPicker value="🚀" onChange={vi.fn()} />)
      expect(
        trigger().querySelector('.emoji-picker-preview')
      ).toHaveTextContent('🚀')

      rerender(<IconPicker value="" onChange={vi.fn()} />)
      expect(
        trigger().querySelector('.emoji-picker-preview')
      ).toHaveTextContent('🙂')
    })
  })

  describe('search', () => {
    it('finds the folder glyphs by the Chinese keyword 文件夹', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()
      search('文件夹')

      const found = visibleGlyphs()
      expect(found).toContain('folder')
      expect(found).toContain('folder-open')
      expect(found).not.toContain('rocket-launch')
      expect(found.length).toBeLessThan(15)
    })

    it('finds glyphs by English keywords, case insensitively, all words required', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()

      search('Open Folder')
      expect(visibleGlyphs()).toEqual(['folder-open'])

      search('terminal')
      expect(visibleGlyphs()).toContain('terminal-window')
    })

    it('hides categories without a match and says so when nothing matches', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()

      search('文件夹')
      const headings = within(dropdown())
        .getAllByRole('heading', { level: 3 })
        .map((node) => node.textContent)
      expect(headings).toEqual(['文件夹与文件'])

      search('zzzz-no-such-icon')
      expect(visibleGlyphs()).toEqual([])
      expect(
        screen.getByText('没有匹配的图标，可以在下方输入表情或文字')
      ).toBeInTheDocument()
    })

    it('starts from the whole catalog every time it opens', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()
      search('文件夹')
      fireEvent.keyDown(document, { key: 'Escape' })
      open()

      expect(screen.getByTestId('icon-search')).toHaveValue('')
      expect(visibleGlyphs()).toHaveLength(150)
    })

    it('picks the first match with Enter, in the current colour', () => {
      const onChange = vi.fn()
      render(<Controlled initial="📁" onChange={onChange} />)
      open()
      fireEvent.click(screen.getByRole('radio', { name: '橙' }))
      search('终端')
      fireEvent.keyDown(screen.getByTestId('icon-search'), { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith('tile:terminal-window:6')
    })

    it('does nothing on Enter in an empty search box', () => {
      const onChange = vi.fn()
      render(<IconPicker value="📁" onChange={onChange} />)
      open()
      fireEvent.keyDown(screen.getByTestId('icon-search'), { key: 'Enter' })

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('typing your own', () => {
    it('stores the raw text of any emoji or text typed by hand', () => {
      const onChange = vi.fn()
      render(<IconPicker value="📁" onChange={onChange} />)
      open()

      fireEvent.change(screen.getByLabelText('自定义（任意表情或文字）'), {
        target: { value: '🧪' },
      })
      expect(onChange).toHaveBeenLastCalledWith('🧪')

      fireEvent.change(screen.getByLabelText('自定义（任意表情或文字）'), {
        target: { value: 'QL' },
      })
      expect(onChange).toHaveBeenLastCalledWith('QL')
    })

    it('shows the stored emoji in the custom field, and leaves it empty for a tile', () => {
      const { rerender } = render(<IconPicker value="🧪" onChange={vi.fn()} />)
      open()
      expect(screen.getByTestId('icon-custom')).toHaveValue('🧪')

      rerender(<IconPicker value="tile:key:4" onChange={vi.fn()} />)
      expect(screen.getByTestId('icon-custom')).toHaveValue('')
    })

    it('shows a stale tile value as text so it can be fixed', () => {
      render(<IconPicker value="tile:gone:3" onChange={vi.fn()} />)
      open()

      expect(screen.getByTestId('icon-custom')).toHaveValue('tile:gone:3')
    })

    it('closes with Enter and hands focus back to the trigger', () => {
      render(<IconPicker value="📁" onChange={vi.fn()} />)
      open()
      fireEvent.keyDown(screen.getByTestId('icon-custom'), { key: 'Enter' })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger()).toHaveFocus()
    })
  })

  describe('keyboard and focus', () => {
    it('moves focus into the picker when it opens, onto the search box', () => {
      render(<IconPicker value="📁" onChange={vi.fn()} />)
      focus(trigger())
      open()

      expect(screen.getByTestId('icon-search')).toHaveFocus()
    })

    it('gives focus back to the trigger on Escape and after picking a glyph', () => {
      render(<Controlled initial="📁" />)
      open()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger()).toHaveFocus()

      open()
      fireEvent.click(screen.getByRole('button', { name: '文件夹 目录' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger()).toHaveFocus()
    })

    it('does not give focus back when the picker closes because of a click elsewhere', () => {
      render(
        <div>
          <IconPicker value="📁" onChange={vi.fn()} />
          <button type="button">Outside</button>
        </div>
      )
      open()
      const outside = screen.getByRole('button', { name: 'Outside' })
      focus(outside)
      fireEvent.mouseDown(outside)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(outside).toHaveFocus()
    })

    it('keeps exactly one glyph in the Tab order', () => {
      render(<IconPicker value="tile:globe:2" onChange={vi.fn()} />)
      open()

      const stops = Array.from(
        dropdown().querySelectorAll<HTMLElement>('[data-glyph]')
      ).filter((node) => node.tabIndex === 0)
      expect(stops.map((node) => node.dataset.glyph)).toEqual(['globe'])
    })

    it('moves from the search box into the grid with ArrowDown', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()
      fireEvent.keyDown(screen.getByTestId('icon-search'), { key: 'ArrowDown' })

      expect(glyph('folder')).toHaveFocus()
    })

    it('walks the grid with the arrow keys, Home and End', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()
      const press = (key: string) =>
        fireEvent.keyDown(document.activeElement as Element, { key })
      focus(glyph('folder'))

      press('ArrowRight')
      expect(glyph('folder-open')).toHaveFocus()
      press('ArrowLeft')
      expect(glyph('folder')).toHaveFocus()
      // Six columns: one row down is six glyphs on (folder is the first of the first category).
      press('ArrowDown')
      const firstCategory = TILE_CATEGORIES[0]?.glyphs ?? []
      expect(glyph(firstCategory[6]?.phosphor ?? '')).toHaveFocus()
      press('ArrowUp')
      expect(glyph('folder')).toHaveFocus()

      press('End')
      const lastCategory = TILE_CATEGORIES[TILE_CATEGORIES.length - 1]?.glyphs
      expect(
        glyph(lastCategory?.[lastCategory.length - 1]?.phosphor ?? '')
      ).toHaveFocus()
      press('Home')
      expect(glyph('folder')).toHaveFocus()
    })

    it('carries Left, Right, Up and Down across category boundaries', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()
      const press = (key: string) =>
        fireEvent.keyDown(document.activeElement as Element, { key })
      const [first, second] = TILE_CATEGORIES
      const firstGlyphs = first?.glyphs ?? []
      const secondGlyphs = second?.glyphs ?? []

      // Right at the end of a category goes to the first glyph of the next.
      focus(glyph(firstGlyphs[firstGlyphs.length - 1]?.phosphor ?? ''))
      press('ArrowRight')
      expect(glyph(secondGlyphs[0]?.phosphor ?? '')).toHaveFocus()
      press('ArrowLeft')
      expect(
        glyph(firstGlyphs[firstGlyphs.length - 1]?.phosphor ?? '')
      ).toHaveFocus()

      // Down from the last row of a category enters the first row of the next, same column.
      focus(glyph(firstGlyphs[13]?.phosphor ?? '')) // row 2, column 1
      press('ArrowDown')
      expect(glyph(secondGlyphs[1]?.phosphor ?? '')).toHaveFocus()
      // Up from the first row of a category lands in the last row of the previous, same column.
      press('ArrowUp')
      expect(glyph(firstGlyphs[13]?.phosphor ?? '')).toHaveFocus()
    })

    it('makes the glyph last focused the one Tab stop', () => {
      render(<IconPicker value="" onChange={vi.fn()} />)
      open()
      focus(glyph('folder-open'))

      expect(glyph('folder-open')?.tabIndex).toBe(0)
      expect(glyph('folder')?.tabIndex).toBe(-1)
    })

    it('selects and focuses colours with the arrow keys, wrapping around', () => {
      const onChange = vi.fn()
      render(<Controlled initial="tile:globe:0" onChange={onChange} />)
      open()
      const press = (key: string) =>
        fireEvent.keyDown(document.activeElement as Element, { key })
      focus(screen.getByTestId('icon-color-0'))

      press('ArrowRight')
      expect(screen.getByTestId('icon-color-1')).toHaveFocus()
      expect(onChange).toHaveBeenLastCalledWith('tile:globe:1')
      press('ArrowLeft')
      press('ArrowLeft')
      expect(screen.getByTestId('icon-color-11')).toHaveFocus()
      expect(onChange).toHaveBeenLastCalledWith('tile:globe:11')
      press('Home')
      expect(screen.getByTestId('icon-color-0')).toHaveFocus()
      press('End')
      expect(screen.getByTestId('icon-color-11')).toHaveFocus()
    })

    it('keeps Tab inside the picker: last stop wraps to the first and back', () => {
      render(<IconPicker value="tile:globe:2" onChange={vi.fn()} />)
      open()
      const press = (key: string, shiftKey = false) =>
        fireEvent.keyDown(document.activeElement as Element, { key, shiftKey })
      const chosenColour = screen.getByTestId('icon-color-2')
      const custom = screen.getByTestId('icon-custom')

      focus(custom)
      press('Tab')
      expect(chosenColour).toHaveFocus()
      press('Tab', true)
      expect(custom).toHaveFocus()
    })

    it('pulls focus back in when Tab is pressed while focus is outside the picker', () => {
      render(
        <div>
          <IconPicker value="📁" onChange={vi.fn()} />
          <button type="button">Outside</button>
        </div>
      )
      open()
      focus(screen.getByRole('button', { name: 'Outside' }))
      fireEvent.keyDown(document, { key: 'Tab' })

      expect(dropdown().contains(document.activeElement)).toBe(true)
    })
  })

  describe('positioning', () => {
    it('re-measures when the page scrolls under it but not when its own list scrolls', () => {
      render(<IconPicker value="📁" onChange={vi.fn()} />)
      const measure = vi.spyOn(trigger(), 'getBoundingClientRect')
      open()
      const afterOpen = measure.mock.calls.length

      fireEvent.scroll(dropdown().querySelector('.icon-picker-body') as Element)
      expect(measure.mock.calls.length).toBe(afterOpen)

      fireEvent.scroll(document.body)
      expect(measure.mock.calls.length).toBeGreaterThan(afterOpen)
    })
  })

  describe('closing', () => {
    it('closes when escape is pressed or the user clicks outside', () => {
      render(
        <div>
          <IconPicker value="📁" onChange={vi.fn()} />
          <button type="button">Outside</button>
        </div>
      )

      open()
      expect(
        screen.getByRole('dialog', { name: '图标选择器' })
      ).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      open()
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('toggles shut when the trigger is clicked again', () => {
      render(<IconPicker value="📁" onChange={vi.fn()} />)
      open()
      open()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('language', () => {
    it.each([
      [
        'en' as const,
        {
          trigger: 'Choose icon',
          dialog: 'Icon picker',
          search: 'Search icons',
          custom: 'Custom (any emoji or text)',
          placeholder: 'Type an emoji or text',
          colour: 'Blue',
          folder: 'folder directory',
          heading: 'Folders & files',
        },
      ],
      [
        'ja' as const,
        {
          trigger: 'アイコンを選択',
          dialog: 'アイコン選択',
          search: 'アイコンを検索',
          custom: 'カスタム（絵文字や文字）',
          placeholder: '絵文字や文字を入力',
          colour: '青',
          folder: 'folder directory',
          heading: 'フォルダとファイル',
        },
      ],
    ])('shows no Chinese or hard-coded English in %s', (lang, expected) => {
      setLang(lang)
      render(<IconPicker value="📁" onChange={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: expected.trigger }))
      expect(
        screen.getByRole('dialog', { name: expected.dialog })
      ).toBeInTheDocument()
      expect(screen.getByLabelText(expected.search)).toBeInTheDocument()
      expect(screen.getByLabelText(expected.custom)).toHaveAttribute(
        'placeholder',
        expected.placeholder
      )
      expect(
        screen.getByRole('radio', { name: expected.colour })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: expected.folder })
      ).toBeInTheDocument()
      expect(
        within(dropdown()).getAllByRole('heading', { level: 3 })[0]
      ).toHaveTextContent(expected.heading)
      expect(screen.queryByPlaceholderText('自定义输入...')).toBeNull()
      expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).toBeNull()
    })
  })
})
