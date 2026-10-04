import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import {
  acceleratorFromKeyPress,
  DEFAULT_SHORTCUT,
  formatAccelerator,
  validateAccelerator,
  type AcceleratorProblem,
} from '../../../../shared/accelerator'
import type { LaunchSettings } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import type { ShortcutCheck } from '../../hooks/use-shortcut-check'
import { IconShortcuts } from '../common/icons'

type Props = {
  /** The shortcut chosen in the dialog (not yet saved). */
  accelerator: string
  /** Whether the dialog has the shortcut switched on. */
  enabled: boolean
  /** Whether the chosen shortcut differs from the saved one (and so has been tried on the system). */
  changed: boolean
  /** What trying the chosen shortcut found out, when it differs from the saved one. */
  check: ShortcutCheck | null
  /** What the main process says about the shortcut that is registered now. */
  launch: LaunchSettings | null
  disabled: boolean
  onAccelerator: (accelerator: string) => void
  onEnabled: (enabled: boolean) => void
}

const PROBLEM_KEYS: Record<AcceleratorProblem, string> = {
  format: 'shortcut_invalid_format',
  modifiers: 'shortcut_invalid_modifiers',
  reserved: 'shortcut_invalid_reserved',
}

/**
 * The launch shortcut in the settings: the switch, the combination as it reads, "change" (record a
 * new one by pressing it) and "reset". A new combination is checked with the operating system as soon
 * as it is recorded, so a taken one is refused here instead of silently not working after Save.
 */
export default function ShortcutSettings({
  accelerator,
  enabled,
  changed,
  check,
  launch,
  disabled,
  onAccelerator,
  onEnabled,
}: Props): JSX.Element {
  const { t } = useI18n()
  const [recording, setRecording] = useState(false)
  const [problem, setProblem] = useState<AcceleratorProblem | null>(null)
  const recorder = useRef<HTMLButtonElement>(null)
  const taken = check?.state === 'done' && check.result.status === 'taken'

  useEffect(() => {
    if (recording) recorder.current?.focus()
  }, [recording])

  const stopRecording = () => {
    setRecording(false)
    setProblem(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return
    // While recording, every key belongs to the recorder: not to the dialog (Esc would close it),
    // not to the page's shortcuts.
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      stopRecording()
      return
    }
    const pressed = acceleratorFromKeyPress({
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    })
    // Only modifiers so far, or a key a shortcut cannot use: keep waiting.
    if (pressed === null) {
      if (!/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(event.code))
        setProblem('format')
      return
    }
    const verdict = validateAccelerator(pressed)
    if (!verdict.ok) {
      setProblem(verdict.problem)
      return
    }
    setRecording(false)
    setProblem(null)
    onAccelerator(verdict.accelerator)
  }

  const heldByOther =
    enabled &&
    !changed &&
    launch !== null &&
    launch.shortcutEnabled !== false &&
    !launch.shortcutAvailable
  const status = recording
    ? problem
      ? { tone: 'bad', text: t(PROBLEM_KEYS[problem]) }
      : { tone: 'info', text: t('shortcut_recording_hint') }
    : !enabled
      ? { tone: 'info', text: t('shortcut_off_note') }
      : check?.state === 'checking'
        ? { tone: 'info', text: t('shortcut_checking') }
        : taken
          ? { tone: 'bad', text: t('shortcut_taken') }
          : check?.state === 'done'
            ? { tone: 'good', text: t('shortcut_free') }
            : heldByOther
              ? { tone: 'bad', text: t('shortcut_unavailable') }
              : null

  return (
    <div className="shortcut-card" data-testid="shortcut-card">
      <IconShortcuts size={20} />
      <div className="shortcut-card-body">
        <label className="shortcut-card-head">
          <span>
            <strong>{t('launch_shortcut')}</strong>
            <small>{t('shortcut_hint')}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="shortcut-switch"
            data-testid="shortcut-enabled"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => {
              stopRecording()
              onEnabled(event.target.checked)
            }}
          />
        </label>
        {enabled && (
          <div className="shortcut-card-keys">
            <button
              ref={recorder}
              className="shortcut-recorder"
              type="button"
              data-testid="shortcut-change"
              data-recording={recording || undefined}
              disabled={disabled}
              aria-label={`${t('shortcut_change')}: ${formatAccelerator(accelerator)}`}
              onClick={() => {
                setProblem(null)
                setRecording((value) => !value)
              }}
              onKeyDown={handleKeyDown}
              onBlur={stopRecording}
            >
              {recording ? (
                t('shortcut_recording')
              ) : (
                <>
                  <kbd data-testid="shortcut-value">
                    {formatAccelerator(accelerator)}
                  </kbd>
                  <span>{t('shortcut_change')}</span>
                </>
              )}
            </button>
            <button
              className="secondary-button"
              type="button"
              data-testid="shortcut-reset"
              disabled={disabled || accelerator === DEFAULT_SHORTCUT}
              onClick={() => {
                stopRecording()
                onAccelerator(DEFAULT_SHORTCUT)
              }}
            >
              {t('shortcut_reset')}
            </button>
          </div>
        )}
        {status && (
          <p
            className="shortcut-status"
            data-tone={status.tone}
            data-testid="shortcut-status"
            role="status"
          >
            {status.text}
          </p>
        )}
      </div>
    </div>
  )
}
