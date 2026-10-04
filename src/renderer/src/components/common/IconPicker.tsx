import { createPortal } from 'react-dom'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import { useI18n } from '../../hooks/use-i18n'
import {
  TILE_COLORS,
  formatTileIcon,
  parseTileIcon,
  searchTileCategories,
} from '../../utils/tile-icon'
import EntryIcon from './EntryIcon'

// The glyph grid has this many columns (.emoji-picker-grid in global.css); Up and Down move by a row.
const GRID_COLUMNS = 6

type Props = {
  value: string
  onChange: (icon: string) => void
}

type DropdownPosition = {
  top: number
  left: number
  width: number
  maxHeight: number
  side: 'top' | 'bottom'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function samePosition(a: DropdownPosition, b: DropdownPosition): boolean {
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight &&
    a.side === b.side
  )
}

function getDropdownPosition(trigger: HTMLButtonElement): DropdownPosition {
  const rect = trigger.getBoundingClientRect()
  const viewportMargin = 12
  const gap = 10
  // Wide enough for the 12 colour dots in one row and six glyph columns, whatever the trigger's width.
  const preferredWidth = 320
  const preferredHeight = 400
  const width = Math.min(
    preferredWidth,
    Math.max(180, window.innerWidth - viewportMargin * 2)
  )
  const availableBelow = window.innerHeight - rect.bottom - gap - viewportMargin
  const availableAbove = rect.top - gap - viewportMargin
  const side: DropdownPosition['side'] =
    availableBelow >= 240 || availableBelow >= availableAbove ? 'bottom' : 'top'
  const availableHeight = side === 'bottom' ? availableBelow : availableAbove
  const maxHeight = Math.max(
    200,
    Math.min(preferredHeight, Math.max(availableHeight, 200))
  )
  const top = side === 'bottom' ? rect.bottom + gap : rect.top - gap - maxHeight

  return {
    top: clamp(
      top,
      viewportMargin,
      window.innerHeight - maxHeight - viewportMargin
    ),
    left: clamp(
      rect.left,
      viewportMargin,
      window.innerWidth - width - viewportMargin
    ),
    width,
    maxHeight,
    side,
  }
}

function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not(:disabled), input')
  ).filter((element) => element.tabIndex >= 0)
}

/**
 * Chooses an entry, group or task icon: a coloured tile (a row of 12 colours, then the catalog's glyphs
 * by category, with a search over their Chinese and English keywords) or any emoji or text typed by
 * hand. The value is the stored string: `tile:<glyph>:<colour>` or the typed text.
 *
 * Keyboard: opening moves focus to the search box; Tab cycles inside the picker (colours, search,
 * glyphs, custom text); arrow keys move between colours and between glyphs; Esc and picking an icon
 * close it and return focus to the trigger.
 */
export default function IconPicker({ value, onChange }: Props): JSX.Element {
  const { t, lang } = useI18n()
  const id = useId()
  const tile = parseTileIcon(value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The colour new glyphs get while the stored value is not a tile yet (an emoji, or empty).
  const [pendingColor, setPendingColor] = useState(tile?.color ?? 0)
  const [activeGlyph, setActiveGlyph] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] =
    useState<DropdownPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const glyphRefs = useRef(new Map<string, HTMLButtonElement>())
  const colorRefs = useRef<Array<HTMLButtonElement | null>>([])
  const color = tile?.color ?? pendingColor
  const categories = useMemo(() => searchTileCategories(query), [query])
  const visibleGlyphs = useMemo(
    () =>
      categories.flatMap((category) =>
        category.glyphs.map((glyph) => glyph.phosphor)
      ),
    [categories]
  )
  // The one glyph that is a Tab stop: the one last focused, else the chosen one, else the first.
  const rovingGlyph =
    activeGlyph && visibleGlyphs.includes(activeGlyph)
      ? activeGlyph
      : tile && visibleGlyphs.includes(tile.glyph)
        ? tile.glyph
        : (visibleGlyphs[0] ?? null)

  useEffect(() => {
    if (!open) {
      return
    }

    const updateDropdownPosition = () => {
      const trigger = triggerRef.current

      if (!trigger) {
        setOpen(false)
        return
      }

      const next = getDropdownPosition(trigger)
      setDropdownPosition((current) =>
        current && samePosition(current, next) ? current : next
      )
    }

    // The list inside the picker scrolls too; only the page moving under it needs a new position.
    const handleScroll = (event: Event) => {
      if (dropdownRef.current?.contains(event.target as Node)) {
        return
      }
      updateDropdownPosition()
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node

      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return
      }

      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      // The picker is a portal outside the dialog it belongs to, so it keeps focus inside itself.
      const dropdown = dropdownRef.current
      const stops = dropdown ? tabStops(dropdown) : []
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (!dropdown || !first || !last) {
        return
      }

      const current = document.activeElement
      if (!dropdown.contains(current)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', handleScroll, true)

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      searchRef.current?.focus()
    }
  }, [open])

  const handleTriggerClick = () => {
    if (open) {
      setOpen(false)
      return
    }

    const trigger = triggerRef.current
    if (!trigger) {
      return
    }

    setQuery('')
    setActiveGlyph(null)
    setPendingColor(tile?.color ?? pendingColor)
    setDropdownPosition(getDropdownPosition(trigger))
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const pickGlyph = (glyph: string) => {
    onChange(formatTileIcon(glyph, color))
    close()
  }

  // A colour applies to the chosen glyph at once; before a glyph is chosen it is what new glyphs get.
  const pickColor = (index: number) => {
    setPendingColor(index)
    if (tile) {
      onChange(formatTileIcon(tile.glyph, index))
    }
  }

  const handleColorKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const count = TILE_COLORS.length
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % count
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index + count - 1) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : null

    if (target === null) {
      return
    }

    event.preventDefault()
    pickColor(target)
    colorRefs.current[target]?.focus()
  }

  // Arrow keys walk the glyph grid: Left and Right by one (across categories), Up and Down by a row
  // (into the neighbouring category at the same column when the row runs out).
  const handleGlyphKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    section: number,
    position: number
  ) => {
    const length = categories[section]?.glyphs.length ?? 0
    const column = position % GRID_COLUMNS
    const lastRowStart = (length: number) =>
      Math.floor((length - 1) / GRID_COLUMNS) * GRID_COLUMNS
    let target: { section: number; position: number } | null = null

    switch (event.key) {
      case 'ArrowRight':
        if (position + 1 < length) {
          target = { section, position: position + 1 }
        } else if (section + 1 < categories.length) {
          target = { section: section + 1, position: 0 }
        }
        break
      case 'ArrowLeft':
        if (position > 0) {
          target = { section, position: position - 1 }
        } else if (section > 0) {
          const previous = categories[section - 1]?.glyphs.length ?? 0
          target = { section: section - 1, position: previous - 1 }
        }
        break
      case 'ArrowDown':
        if (position + GRID_COLUMNS < length) {
          target = { section, position: position + GRID_COLUMNS }
        } else if (position < lastRowStart(length)) {
          target = { section, position: length - 1 }
        } else if (section + 1 < categories.length) {
          const next = categories[section + 1]?.glyphs.length ?? 0
          target = {
            section: section + 1,
            position: Math.min(column, next - 1),
          }
        }
        break
      case 'ArrowUp':
        if (position >= GRID_COLUMNS) {
          target = { section, position: position - GRID_COLUMNS }
        } else if (section > 0) {
          const previous = categories[section - 1]?.glyphs.length ?? 0
          target = {
            section: section - 1,
            position: Math.min(lastRowStart(previous) + column, previous - 1),
          }
        }
        break
      case 'Home':
        target = { section: 0, position: 0 }
        break
      case 'End': {
        const lastSection = categories.length - 1
        target = {
          section: lastSection,
          position: (categories[lastSection]?.glyphs.length ?? 1) - 1,
        }
        break
      }
      default:
        return
    }

    event.preventDefault()
    const glyph = target
      ? categories[target.section]?.glyphs[target.position]?.phosphor
      : undefined
    if (glyph) {
      setActiveGlyph(glyph)
      glyphRefs.current.get(glyph)?.focus()
    }
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && rovingGlyph) {
      event.preventDefault()
      glyphRefs.current.get(rovingGlyph)?.focus()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const first = visibleGlyphs[0]
      if (query.trim() && first) {
        pickGlyph(first)
      }
    }
  }

  const dropdown =
    open && dropdownPosition && typeof document !== 'undefined'
      ? createPortal(
          <div className="emoji-picker-portal" role="presentation">
            <div
              ref={dropdownRef}
              className="emoji-picker-dropdown icon-picker-dropdown"
              data-side={dropdownPosition.side}
              role="dialog"
              aria-label={t('icon_picker')}
              data-testid="icon-picker"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
                maxHeight: `${dropdownPosition.maxHeight}px`,
              }}
            >
              <div
                className="icon-picker-colors"
                role="radiogroup"
                aria-label={t('icon_color')}
              >
                {TILE_COLORS.map((swatch, index) => (
                  <button
                    key={swatch.hex}
                    ref={(node) => {
                      colorRefs.current[index] = node
                    }}
                    className={`icon-picker-color${color === index ? ' active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={color === index}
                    aria-label={t(`tile_color_${index}`)}
                    title={t(`tile_color_${index}`)}
                    tabIndex={color === index ? 0 : -1}
                    data-testid={`icon-color-${index}`}
                    style={{ '--tile-bg': swatch.hex } as CSSProperties}
                    onClick={() => pickColor(index)}
                    onKeyDown={(event) => handleColorKeyDown(event, index)}
                  />
                ))}
              </div>
              <input
                ref={searchRef}
                className="icon-picker-search"
                type="search"
                autoComplete="off"
                value={query}
                aria-label={t('icon_search')}
                placeholder={t('icon_search_hint')}
                data-testid="icon-search"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <div
                className="icon-picker-body"
                role="group"
                aria-label={t('icon_glyph_list')}
              >
                {categories.length === 0 ? (
                  <p className="icon-picker-empty" role="status">
                    {t('icon_search_empty')}
                  </p>
                ) : (
                  categories.map((category, section) => (
                    <section
                      key={category.index}
                      className="icon-picker-section"
                      aria-labelledby={`${id}-category-${category.index}`}
                    >
                      <h3
                        id={`${id}-category-${category.index}`}
                        className="icon-picker-heading"
                      >
                        {t(`tile_cat_${category.index}`)}
                      </h3>
                      <div className="emoji-picker-grid">
                        {category.glyphs.map((glyph, position) => {
                          const selected = tile?.glyph === glyph.phosphor
                          const label = lang === 'zh' ? glyph.zh : glyph.en

                          return (
                            <button
                              key={glyph.phosphor}
                              ref={(node) => {
                                if (node) {
                                  glyphRefs.current.set(glyph.phosphor, node)
                                } else {
                                  glyphRefs.current.delete(glyph.phosphor)
                                }
                              }}
                              className={`emoji-picker-cell${selected ? ' active' : ''}`}
                              type="button"
                              aria-pressed={selected}
                              aria-label={label}
                              title={label}
                              tabIndex={glyph.phosphor === rovingGlyph ? 0 : -1}
                              data-glyph={glyph.phosphor}
                              onFocus={() => setActiveGlyph(glyph.phosphor)}
                              onClick={() => pickGlyph(glyph.phosphor)}
                              onKeyDown={(event) =>
                                handleGlyphKeyDown(event, section, position)
                              }
                            >
                              <EntryIcon
                                icon={formatTileIcon(glyph.phosphor, color)}
                              />
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
              <div className="emoji-picker-custom">
                <input
                  value={tile ? '' : value}
                  aria-label={t('icon_custom')}
                  placeholder={t('icon_custom_placeholder')}
                  autoComplete="off"
                  data-testid="icon-custom"
                  onChange={(event) => onChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      close()
                    }
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <div className="emoji-picker">
      <button
        ref={triggerRef}
        className="emoji-picker-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('icon_choose')}
        data-testid="icon-picker-trigger"
        onClick={handleTriggerClick}
      >
        <span className="emoji-picker-preview">
          <EntryIcon icon={value || '🙂'} />
        </span>
        <span className="emoji-picker-caret">&#9662;</span>
      </button>
      {dropdown}
    </div>
  )
}
