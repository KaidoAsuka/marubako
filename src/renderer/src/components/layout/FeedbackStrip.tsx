import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../../hooks/use-i18n'
import { usePresenceSnapshot } from '../../hooks/use-presence-snapshot'
import type { ToastState } from '../../store/store-types'
import { useAppStore } from '../../store/use-app-store'
import { IconError, IconInfo, IconSuccess } from '../common/icons'

// After the action button is used the strip is closing, but a second click of a double-click is
// still on its way to the same spot and must not land on the content that moves into the room the
// strip leaves behind.
const CLICK_SHIELD_MS = 500

/**
 * What the strip shows. A message from `showToast` (a copy that failed, "deleted, undo", an
 * export that finished) is short-lived and always wins; underneath it sits the one thing that has
 * to stay until it is fixed, a failed disk write.
 */
type StripView =
  | { source: 'write-error'; writeError: string }
  | { source: 'message'; toast: ToastState }

type StripKind = 'error' | 'undo' | ToastState['tone']

// A failure that offers a button (an entry that would not open: "Edit") is still a failure: it keeps
// the red icon. Only the other messages with a button (the delete's "Undo") are the neutral kind.
const kindOf = (view: StripView): StripKind =>
  view.source === 'write-error'
    ? 'error'
    : view.toast.action && view.toast.tone !== 'danger'
      ? 'undo'
      : view.toast.tone

const kindIcon = {
  error: <IconError size={14} />,
  undo: <IconInfo size={14} />,
  danger: <IconError size={14} />,
  success: <IconSuccess size={14} />,
  info: <IconInfo size={14} />,
} satisfies Record<StripKind, JSX.Element>

/**
 * The one place the app talks back, docked at the bottom of the window. It is empty (height 0)
 * unless there is something to say, and takes its room from the content above it, so it never
 * covers a card. See styles/feedback.css.
 */
export default function FeedbackStrip(): JSX.Element {
  const { t } = useI18n()
  const toast = useAppStore((state) => state.toast)
  const writeError = useAppStore((state) => state.dataStatus.writeError)
  const clearToast = useAppStore((state) => state.clearToast)
  const pauseToast = useAppStore((state) => state.pauseToast)
  const resumeToast = useAppStore((state) => state.resumeToast)
  const retryDataSave = useAppStore((state) => state.retryDataSave)
  const [shielded, setShielded] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // A new object per render would be a new "message" every time; the snapshot hook compares by
  // identity, so keep one object for as long as its inputs hold.
  const view = useMemo<StripView | null>(
    () =>
      toast
        ? { source: 'message', toast }
        : writeError
          ? { source: 'write-error', writeError }
          : null,
    [toast, writeError]
  )
  // The last message stays on screen while the strip closes.
  const { snapshot } = usePresenceSnapshot(view)

  useEffect(() => {
    if (!shielded) return undefined
    const timer = window.setTimeout(() => setShielded(false), CLICK_SHIELD_MS)
    return () => window.clearTimeout(timer)
  }, [shielded])

  const kind = snapshot ? kindOf(snapshot) : null
  const open = view !== null
  const content = snapshot
    ? snapshot.source === 'write-error'
      ? {
          // The fixed words first and the raw error last: two lines clamp the tail, and what has to
          // be read is that the latest changes are not saved. The title and the alert keep it all.
          title: `${t('data_write_failed')}${t('data_write_unsaved')} ${snapshot.writeError}`,
          text: (
            <>
              <strong>{t('data_write_failed')}</strong>
              {t('data_write_unsaved')} {snapshot.writeError}
            </>
          ),
          action: {
            label: t('data_retry'),
            run: () => {
              setRetrying(true)
              void retryDataSave().finally(() => setRetrying(false))
            },
          },
        }
      : {
          title: snapshot.toast.message,
          text: snapshot.toast.message,
          action: snapshot.toast.action,
        }
    : null
  const action = content?.action

  return (
    <>
      <div
        className="feedback-strip"
        data-testid="feedback-strip"
        data-open={open ? 'true' : undefined}
        data-kind={kind ?? undefined}
      >
        <div className="feedback-clip">
          <div
            className="feedback-body"
            onMouseEnter={pauseToast}
            onMouseLeave={resumeToast}
            onFocus={pauseToast}
            onBlur={resumeToast}
          >
            {kind ? (
              <span className="feedback-icon" aria-hidden="true">
                {kindIcon[kind]}
              </span>
            ) : null}
            {/* A failed write is an alert: it is announced at once and says "not saved". Every
                other message is polite, in a region that is always in the page so a change of
                its text is read out reliably. */}
            <span
              key={kind === 'error' ? 'alert' : 'status'}
              className="feedback-text"
              role={kind === 'error' ? 'alert' : 'status'}
              aria-live={kind === 'error' ? undefined : 'polite'}
              title={content?.title}
            >
              {content?.text}
            </span>
            {action ? (
              <button
                className="feedback-action"
                type="button"
                data-testid={
                  kind === 'error' ? 'feedback-retry' : 'feedback-action'
                }
                tabIndex={open ? 0 : -1}
                disabled={kind === 'error' && retrying}
                onClick={() => {
                  setShielded(true)
                  if (snapshot?.source === 'message') clearToast()
                  action.run()
                }}
              >
                {action.label}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {shielded ? (
        <div
          className="feedback-shield"
          data-testid="feedback-shield"
          aria-hidden="true"
        />
      ) : null}
    </>
  )
}
