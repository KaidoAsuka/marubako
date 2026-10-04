import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  IconClose,
  IconNewNote,
  IconTabApp,
  IconTabCommand,
  IconTabFolder,
  IconTabPassword,
  IconTabWebsite,
} from '../common/icons'
import { useDialogFocus } from '../../hooks/use-dialog-focus'
import { usePresenceSnapshot } from '../../hooks/use-presence-snapshot'

import GroupForm from './GroupForm'
import ItemForm from './ItemForm'
import SettingsForm from './SettingsForm'
import TaskForm from './TaskForm'
import SubtaskForm from './SubtaskForm'
import ConfirmDialog from './ConfirmDialog'
import { ModalFrameContext, type ModalFrame } from './modal-frame'
import { useAppStore } from '../../store/use-app-store'
import { useI18n } from '../../hooks/use-i18n'

function focusKeepButton(): void {
  document.querySelector<HTMLElement>('[data-testid="discard-keep"]')?.focus()
}

export default function Modal(): JSX.Element | null {
  const activeModal = useAppStore((state) => state.modal)
  const {
    snapshot: modal,
    exiting,
    revision,
  } = usePresenceSnapshot(activeModal)
  const setModal = useAppStore((state) => state.setModal)
  const { t } = useI18n()

  // Closing by Esc, the overlay, the X or a form's Cancel asks first while the form holds unsaved
  // edits (see modal-frame.ts). `confirmingAt` names the dialog the question belongs to: a dialog
  // opened later has another revision, so it never inherits a question left over from this one.
  const [confirmingAt, setConfirmingAt] = useState<number | null>(null)
  const confirming = confirmingAt === revision
  const latest = useRef({ revision, confirming })
  useLayoutEffect(() => {
    latest.current = { revision, confirming }
  })
  const dirtyAt = useRef<number | null>(null)
  // The field the user last had the cursor in. Clicking the X or Cancel moves focus to that button,
  // so the answer "Keep editing" has to remember where the typing was.
  const lastField = useRef<HTMLElement | null>(null)
  // The mouse went down on the dim backdrop itself. A click is dispatched to the common ancestor of
  // where the button went down and where it came up, so dragging a text selection or a slider out of
  // the card and letting go on the backdrop would otherwise look like a click on it.
  const pressedOnOverlay = useRef(false)

  const setDirty = useCallback((dirty: boolean) => {
    dirtyAt.current = dirty ? latest.current.revision : null
  }, [])
  const requestClose = useCallback(() => {
    const { revision: current, confirming: asking } = latest.current
    if (dirtyAt.current !== current) {
      setModal(null)
      return
    }
    if (asking) {
      focusKeepButton()
      return
    }
    setConfirmingAt(current)
  }, [setModal])
  const keepEditing = useCallback(() => {
    setConfirmingAt(null)
    // The question is about to go, so put the cursor back where the user was typing.
    const back = lastField.current
    if (back?.isConnected) back.focus()
    else
      document
        .querySelector<HTMLElement>(
          '.modal-card input:not([type="checkbox"]), .modal-card textarea'
        )
        ?.focus()
  }, [])
  const discard = useCallback(() => setModal(null), [setModal])
  const rememberField = useCallback((event: React.FocusEvent) => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.matches('input, textarea, select')
    )
      lastField.current = target
  }, [])
  // Esc while the question shows means "keep editing", so two quick presses never lose the draft.
  const closeFromKeyboard = useCallback(() => {
    if (latest.current.confirming) keepEditing()
    else requestClose()
  }, [keepEditing, requestClose])
  const dialogRef = useDialogFocus(Boolean(activeModal), closeFromKeyboard)
  const frame = useMemo<ModalFrame>(
    () => ({
      setDirty,
      requestClose,
      discardPrompt: confirming,
      keepEditing,
      discard,
    }),
    [setDirty, requestClose, confirming, keepEditing, discard]
  )
  useEffect(() => {
    if (confirming) focusKeepButton()
  }, [confirming])

  if (!modal) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  const title =
    modal.kind === 'group'
      ? t(modal.groupId ? 'm_edit_group' : 'm_new_group')
      : modal.kind === 'item'
        ? t(
            modal.tab === 'commands'
              ? modal.itemId
                ? 'cmd_edit'
                : 'cmd_new'
              : modal.itemId
                ? 'm_edit_item'
                : 'm_new_item'
          )
        : modal.kind === 'task'
          ? t(modal.taskId ? 'm_edit_task' : 'm_new_task')
          : modal.kind === 'subtask'
            ? t(modal.subtaskId ? 'm_edit_subtask' : 'm_new_subtask')
            : modal.kind === 'settings'
              ? t('settings')
              : ''

  const CategoryIcon =
    modal.kind === 'item'
      ? {
          folders: IconTabFolder,
          websites: IconTabWebsite,
          apps: IconTabApp,
          passwords: IconTabPassword,
          notes: IconNewNote,
          commands: IconTabCommand,
        }[modal.tab]
      : null

  const portal = createPortal(
    <div
      className="modal-overlay"
      data-exiting={exiting || undefined}
      aria-hidden={exiting || undefined}
      {...(exiting ? { inert: '' } : {})}
      data-testid={`modal-${modal.kind}`}
      onMouseDown={(event) => {
        pressedOnOverlay.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        const startedOnOverlay = pressedOnOverlay.current
        pressedOnOverlay.current = false
        if (startedOnOverlay && event.target === event.currentTarget) {
          requestClose()
        }
      }}
    >
      <div
        key={revision}
        ref={dialogRef}
        className={`modal-card ${modal.kind === 'settings' ? 'settings-card' : ''} ${modal.kind === 'item' ? 'item-modal-card' : ''} ${modal.kind === 'item' && modal.tab === 'commands' ? 'code-modal' : ''}`}
        role="dialog"
        aria-modal={exiting ? undefined : true}
        aria-label={modal.kind === 'confirm' ? modal.title : title}
        tabIndex={-1}
        data-testid="modal-card"
        onFocus={rememberField}
      >
        <button
          className="icon-button modal-close"
          type="button"
          aria-label={t('close')}
          onClick={requestClose}
        >
          <IconClose size={16} />
        </button>
        {modal.kind === 'confirm' ? (
          <ConfirmDialog modalSnapshot={modal} />
        ) : (
          <>
            {modal.kind === 'item' && CategoryIcon ? (
              <div className="item-modal-header">
                <span className="item-modal-symbol">
                  <CategoryIcon size={21} />
                </span>
                <div className="item-modal-heading">
                  <div className="item-modal-category">
                    {t(`tab_${modal.tab}`)}
                  </div>
                  <div className="modal-title">{title}</div>
                </div>
              </div>
            ) : (
              <div className="modal-title">{title}</div>
            )}
            {modal.kind === 'group' && <GroupForm modalSnapshot={modal} />}
            {modal.kind === 'item' && <ItemForm modalSnapshot={modal} />}
            {modal.kind === 'task' && <TaskForm modalSnapshot={modal} />}
            {modal.kind === 'subtask' && <SubtaskForm modalSnapshot={modal} />}
            {modal.kind === 'settings' && <SettingsForm />}
          </>
        )}
      </div>
    </div>,
    document.body
  )
  return (
    <ModalFrameContext.Provider value={frame}>
      {portal}
    </ModalFrameContext.Provider>
  )
}
