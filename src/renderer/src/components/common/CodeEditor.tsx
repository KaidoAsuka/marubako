import { useLayoutEffect, useRef, useState } from 'react'
import { IconWrapText } from './icons'
import { useI18n } from '../../hooks/use-i18n'
import { indentCode } from '../../utils/code'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Lets the form focus the editor, or point a label at it. */
  id?: string
  /** The content is missing or wrong: the editor is drawn with the error border. */
  invalid?: boolean
  /** The element holding the message about it. */
  describedBy?: string | undefined
}

export default function CodeEditor({
  value,
  onChange,
  id,
  invalid = false,
  describedBy,
}: Props): JSX.Element {
  const { t } = useI18n()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)
  const [wrap, setWrap] = useState(false)
  const lines = value.split('\n').length
  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (selection) {
      textarea.current?.setSelectionRange(selection.start, selection.end)
      pendingSelection.current = null
    }
  }, [value])
  const applyEdit = (next: { value: string; start: number; end: number }) => {
    if (next.value === value) {
      textarea.current?.setSelectionRange(next.start, next.end)
      return
    }
    pendingSelection.current = { start: next.start, end: next.end }
    onChange(next.value)
  }
  return (
    <div className="code-editor">
      <div className="code-editor-toolbar">
        <span>
          {lines} {t('cmd_lines')} · UTF-8
        </span>
        <button
          className={`code-wrap-button ${wrap ? 'active' : ''}`}
          type="button"
          aria-pressed={wrap}
          onClick={() => setWrap(!wrap)}
          title={t('cmd_wrap')}
        >
          <IconWrapText size={14} />
          {t('cmd_wrap')}
        </button>
      </div>
      <div className={`code-editor-body ${wrap ? 'wrapped' : ''}`}>
        {!wrap && (
          <div className="code-gutter" aria-hidden="true">
            <div ref={gutter}>
              {Array.from({ length: lines }, (_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
          </div>
        )}
        <textarea
          ref={textarea}
          id={id}
          data-testid="command-code-input"
          aria-label={t('cmd_code')}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap={wrap ? 'soft' : 'off'}
          placeholder={t('cmd_placeholder')}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (gutter.current)
              gutter.current.style.transform = `translateY(-${event.currentTarget.scrollTop}px)`
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            const input = event.currentTarget
            if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey) {
              event.preventDefault()
              event.stopPropagation()
              applyEdit(
                indentCode(
                  value,
                  input.selectionStart,
                  input.selectionEnd,
                  event.shiftKey
                )
              )
            } else if (
              event.key === 'Enter' &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
              const start = input.selectionStart
              const lineStart = value.slice(0, start).lastIndexOf('\n') + 1
              const indentation =
                value.slice(lineStart, start).match(/^[\t ]*/)?.[0] ?? ''
              applyEdit({
                value:
                  value.slice(0, start) +
                  '\n' +
                  indentation +
                  value.slice(input.selectionEnd),
                start: start + 1 + indentation.length,
                end: start + 1 + indentation.length,
              })
            } else if (
              event.key === 'Tab' &&
              (event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault()
              input
                .closest('form')
                ?.querySelector<HTMLButtonElement>('[data-testid="item-save"]')
                ?.focus()
            }
          }}
        />
      </div>
      <div className="code-editor-hint">{t('cmd_editor_hint')}</div>
    </div>
  )
}
