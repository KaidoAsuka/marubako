import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang } from '../../../../../shared/types'
import { extraStrings } from '../../../i18n/extras'
import { useAppStore } from '../../../store/use-app-store'
import { listInstalledFonts } from '../../../utils/installed-fonts'
import FontFamilyField from '../FontFamilyField'

type LocalFont = { family: string }
type FontWindow = { queryLocalFonts?: () => Promise<LocalFont[]> }

// jsdom has no Local Font Access API: each test says what Chromium would answer.
const fontWindow = window as unknown as FontWindow

/** One entry per installed face, as Chromium lists them: a family comes once for every style. */
const faces = (...families: string[]): LocalFont[] =>
  families.map((family) => ({ family }))

function installFonts(...families: string[]): void {
  fontWindow.queryLocalFonts = vi.fn(async () => faces(...families))
}

afterEach(() => {
  delete fontWindow.queryLocalFonts
})

describe('listInstalledFonts', () => {
  it('lists every family once, in alphabetical order', async () => {
    const source = {
      queryLocalFonts: async () =>
        faces(
          'Segoe UI',
          'Arial',
          'Segoe UI',
          'Yu Gothic UI',
          'Arial',
          'Consolas'
        ),
    }

    expect(await listInstalledFonts(source)).toEqual([
      'Arial',
      'Consolas',
      'Segoe UI',
      'Yu Gothic UI',
    ])
  })

  it('cleans the names as the setting does, and leaves out those nothing is left of', async () => {
    const source = {
      queryLocalFonts: async () => [
        ...faces('  Arial  ', 'Evil"; } body {', '"', '', '   '),
        { family: undefined as unknown as string },
      ],
    }

    expect(await listInstalledFonts(source)).toEqual(['Arial', 'Evil  body'])
  })

  it('takes two names that are the same once cleaned for one family', async () => {
    const source = { queryLocalFonts: async () => faces('Arial', ' Arial ') }

    expect(await listInstalledFonts(source)).toEqual(['Arial'])
  })

  it('answers an empty list for a PC that reports no fonts: the list was had', async () => {
    expect(
      await listInstalledFonts({ queryLocalFonts: async () => [] })
    ).toEqual([])
  })

  it('answers null when the browser has no such API', async () => {
    expect(await listInstalledFonts({})).toBeNull()
    expect(
      await listInstalledFonts({
        queryLocalFonts: 'yes' as unknown as () => Promise<LocalFont[]>,
      })
    ).toBeNull()
  })

  it('answers null, and does not throw, when the list is refused', async () => {
    const source = {
      queryLocalFonts: async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      },
    }

    await expect(listInstalledFonts(source)).resolves.toBeNull()
  })

  it('asks the window when it is given nothing else', async () => {
    expect(await listInstalledFonts()).toBeNull()

    installFonts('Yu Gothic UI', 'Arial')

    expect(await listInstalledFonts()).toEqual(['Arial', 'Yu Gothic UI'])
    expect(fontWindow.queryLocalFonts).toHaveBeenCalledTimes(1)
  })
})

describe('FontFamilyField', () => {
  const onChange = vi.fn()

  function show(
    value: string,
    options: { lang?: Lang; disabled?: boolean } = {}
  ): HTMLSelectElement {
    const data = createDefaultAppData()
    data.prefs.lang = options.lang ?? 'en'
    useAppStore.setState({ data, loading: false })
    render(
      <FontFamilyField
        value={value}
        disabled={options.disabled ?? false}
        onChange={onChange}
      />
    )
    return screen.getByTestId('settings-font-family') as HTMLSelectElement
  }

  /** Lets the answer about the installed fonts arrive. */
  const settle = () => act(async () => {})

  const optionTexts = (select: HTMLSelectElement) =>
    [...select.options].map((option) => option.textContent)
  const optionValues = (select: HTMLSelectElement) =>
    [...select.options].map((option) => option.value)

  beforeEach(() => {
    onChange.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('offers the default and then the installed fonts', async () => {
    installFonts('Segoe UI', 'Arial', 'Yu Gothic UI', 'Arial')

    const select = show('')
    await settle()

    expect(optionTexts(select)).toEqual([
      'Default',
      'Arial',
      'Segoe UI',
      'Yu Gothic UI',
    ])
    expect(optionValues(select)).toEqual([
      '',
      'Arial',
      'Segoe UI',
      'Yu Gothic UI',
    ])
    expect(select.value).toBe('')
  })

  it('is one control labelled by its title, with a line that says where the fonts come from', async () => {
    installFonts('Arial')

    const select = show('')
    await settle()

    expect(screen.getByLabelText('Font')).toBe(select)
    expect(
      screen.getByText(extraStrings.en.font_family_hint!)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(extraStrings.en.font_family_unavailable!)
    ).toBeNull()
  })

  it('shows each name in its own font', async () => {
    installFonts('Arial', 'Yu Gothic UI')

    const select = show('')
    await settle()

    expect(select.options[1]?.style.fontFamily).toBe('"Arial"')
    expect(select.options[2]?.style.fontFamily).toBe('"Yu Gothic UI"')
    // The default has no font of its own to show.
    expect(select.options[0]?.style.fontFamily).toBe('')
  })

  it('shows the saved font as the selected one', async () => {
    installFonts('Arial', 'Yu Gothic UI')

    const select = show('Yu Gothic UI')
    await settle()

    expect(select.value).toBe('Yu Gothic UI')
    // It is in the list once, not a second time as a font that is missing.
    expect(optionValues(select)).toEqual(['', 'Arial', 'Yu Gothic UI'])
    expect(optionTexts(select)).toEqual(['Default', 'Arial', 'Yu Gothic UI'])
  })

  it('hands the chosen family to its owner, and the empty name for the default', async () => {
    installFonts('Arial', 'Yu Gothic UI')
    const select = show('Arial')
    await settle()

    fireEvent.change(select, { target: { value: 'Yu Gothic UI' } })
    expect(onChange).toHaveBeenLastCalledWith('Yu Gothic UI')

    fireEvent.change(select, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  // The data came from another PC, or the font was uninstalled.
  it('keeps a saved font that is not installed selectable, and says that it is not on this PC', async () => {
    installFonts('Arial', 'Yu Gothic UI')

    const select = show('Source Han Sans SC')
    await settle()

    expect(select.value).toBe('Source Han Sans SC')
    expect(optionValues(select)).toEqual([
      '',
      'Source Han Sans SC',
      'Arial',
      'Yu Gothic UI',
    ])
    expect(select.options[1]).toHaveTextContent(
      'Source Han Sans SC (not on this PC)'
    )
    expect(select.options[1]?.textContent).toBe(
      extraStrings.en.font_family_missing!.replace(
        '{font}',
        'Source Han Sans SC'
      )
    )
  })

  it('does not call a saved font missing while the list is still being read', async () => {
    let answer: (fonts: LocalFont[]) => void = () => undefined
    fontWindow.queryLocalFonts = () =>
      new Promise((resolve) => {
        answer = resolve
      })

    const select = show('Yu Gothic UI')

    // Selected from the first frame, under its own name.
    expect(select.value).toBe('Yu Gothic UI')
    expect(optionTexts(select)).toEqual(['Default', 'Yu Gothic UI'])
    expect(
      screen.getByText(extraStrings.en.font_family_hint!)
    ).toBeInTheDocument()

    await act(async () => answer(faces('Arial', 'Yu Gothic UI')))

    expect(select.value).toBe('Yu Gothic UI')
    expect(optionTexts(select)).toEqual(['Default', 'Arial', 'Yu Gothic UI'])
  })

  it.each([
    ['the browser has no such API', () => undefined],
    [
      'the list is refused',
      () => {
        fontWindow.queryLocalFonts = async () => {
          throw new DOMException('Permission denied', 'NotAllowedError')
        }
      },
    ],
  ])('offers only the default and says why when %s', async (_name, arrange) => {
    arrange()

    const select = show('')
    await settle()

    expect(optionTexts(select)).toEqual(['Default'])
    expect(
      screen.getByText(extraStrings.en.font_family_unavailable!)
    ).toBeInTheDocument()
    expect(screen.queryByText(extraStrings.en.font_family_hint!)).toBeNull()
  })

  // Without the list nothing is known about the font: it is not called missing.
  it('keeps a saved font selected under its plain name when the list cannot be had', async () => {
    const select = show('Yu Gothic UI')
    await settle()

    expect(select.value).toBe('Yu Gothic UI')
    expect(optionValues(select)).toEqual(['', 'Yu Gothic UI'])
    expect(optionTexts(select)).toEqual(['Default', 'Yu Gothic UI'])
  })

  it('is disabled when its owner says so', async () => {
    installFonts('Arial')

    const select = show('', { disabled: true })
    await settle()

    expect(select).toBeDisabled()
  })

  it('does not ask for the fonts again when it is drawn again', async () => {
    installFonts('Arial')
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({ data, loading: false })
    const { rerender } = render(
      <FontFamilyField value="" disabled={false} onChange={onChange} />
    )
    await settle()

    rerender(
      <FontFamilyField value="Arial" disabled={false} onChange={onChange} />
    )
    await settle()

    expect(fontWindow.queryLocalFonts).toHaveBeenCalledTimes(1)
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'speaks %s: the title, the default, the hint and the mark of a missing font',
    async (lang) => {
      installFonts('Arial')
      const strings = extraStrings[lang]

      const select = show('Source Han Sans SC', { lang })
      await settle()

      expect(screen.getByLabelText(strings.font_family!)).toBe(select)
      expect(select.options[0]?.textContent).toBe(strings.font_family_default)
      expect(select.options[1]?.textContent).toBe(
        strings.font_family_missing!.replace('{font}', 'Source Han Sans SC')
      )
      expect(select.options[1]?.textContent).not.toContain('{font}')
      expect(screen.getByText(strings.font_family_hint!)).toBeInTheDocument()
    }
  )

  it.each(['zh', 'en', 'ja'] as const)(
    'says in %s that the list cannot be had',
    async (lang) => {
      show('', { lang })
      await settle()

      expect(
        screen.getByText(extraStrings[lang].font_family_unavailable!)
      ).toBeInTheDocument()
    }
  )
})
