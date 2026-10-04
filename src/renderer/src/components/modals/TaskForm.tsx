import { useState } from 'react'

import { DEFAULT_TASK_ICON } from '../../../../shared/default-icons'
import type { TaskStatus } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'
import type { ModalState } from '../../store/store-types'
import IconPicker from '../common/IconPicker'
import FormField from '../common/FormField'
import ModalActions from './ModalActions'
import { useUnsavedGuard } from './modal-frame'
import { isSaveShortcut, useFieldError } from './use-field-error'
import { isValidDateKey, parseDateKey, todayKey } from '../../utils/date'

export default function TaskForm({
  modalSnapshot,
}: {
  modalSnapshot?: ModalState
}): JSX.Element | null {
  const { t, formatDate } = useI18n()
  const activeModal = useAppStore((state) => state.modal)
  const modal = modalSnapshot ?? activeModal
  const data = useAppStore((state) => state.data)
  const updateData = useAppStore((state) => state.updateData)
  const setModal = useAppStore((state) => state.setModal)
  const saving = useAppStore((state) => state.saving)
  const active = modal?.kind === 'task' ? modal : null
  const existing =
    active && active.taskId !== null && data
      ? ((data.tasks[active.date] ?? []).find(
          (entry) => entry.id === active.taskId
        ) ?? null)
      : null

  const [initial] = useState(() => ({
    name: existing?.name ?? '',
    icon: existing?.icon ?? DEFAULT_TASK_ICON,
    status: existing?.status ?? ('todo' as TaskStatus),
    // The date starts as the day the dialog was opened for, so an ordinary edit never moves the task
    // and a new one lands on the day the user is looking at.
    moveDate: active?.date ?? todayKey(),
  }))
  const [name, setName] = useState(initial.name)
  const [icon, setIcon] = useState(initial.icon)
  const [status, setStatus] = useState(initial.status)
  const [moveDate, setMoveDate] = useState(initial.moveDate)
  const { requestClose } = useUnsavedGuard(
    name !== initial.name ||
      icon !== initial.icon ||
      status !== initial.status ||
      moveDate !== initial.moveDate
  )
  const nameField = useFieldError('task-form-name')

  if (!active || !data) {
    return null
  }

  // An empty date field (the user cleared it) means "stay where you are"; a half-typed year such as
  // "0026-10-05" is not that, and saving it would orphan the task under a day nobody can open.
  const moveDateInvalid = moveDate !== '' && !isValidDateKey(moveDate)

  const handleSubmit = async () => {
    if (saving) return
    if (!name.trim()) {
      nameField.fail(t('invalid_name'))
      return
    }
    if (moveDateInvalid) {
      document.getElementById('task-form-move-date')?.focus()
      return
    }

    const destination = moveDate || active.date
    const moved = existing !== null && destination !== active.date
    // A new task put on another day than the one on screen: the user should be told where it went.
    const placedElsewhere = existing === null && destination !== active.date

    await updateData(
      (draft) => {
        const task = {
          id: existing?.id ?? crypto.randomUUID(),
          name: name.trim(),
          icon: icon.trim() || DEFAULT_TASK_ICON,
          status,
          open: existing?.open ?? true,
          subtasks: existing?.subtasks ?? [],
        }

        const source = draft.tasks[active.date] ?? []

        if (existing && !moved) {
          // Same day: replace in place so the task keeps its position in the list.
          const index = source.findIndex((entry) => entry.id === existing.id)
          draft.tasks[active.date] =
            index === -1
              ? [...source, task]
              : source.map((entry, position) =>
                  position === index ? task : entry
                )
          return
        }

        if (existing) {
          draft.tasks[active.date] = source.filter(
            (entry) => entry.id !== existing.id
          )
          draft.tasks[destination] = [...(draft.tasks[destination] ?? []), task]
          return
        }

        draft.tasks[destination] = [...(draft.tasks[destination] ?? []), task]
      },
      // Saving in place says nothing; a move is worth telling, because the task leaves the day the
      // user is looking at, and so is a new task that is not on it.
      moved || placedElsewhere
        ? {
            successMessage: `${t(moved ? 'task_moved_to' : 'task_added_to')} ${formatDate(parseDateKey(destination))}`,
          }
        : undefined
    )

    // A write that failed leaves the dialog open, with what was typed and the error in the strip.
    if (!useAppStore.getState().error) setModal(null)
  }

  return (
    <form
      noValidate
      onKeyDown={(event) => {
        if (isSaveShortcut(event)) {
          event.preventDefault()
          void handleSubmit()
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <FormField
        label={t('f_task_name')}
        required
        htmlFor="task-form-name"
        error={nameField.error}
        errorId={nameField.errorId}
      >
        <input
          id="task-form-name"
          data-testid="task-name-input"
          value={name}
          autoComplete="off"
          {...nameField.attributes}
          onChange={(event) => {
            setName(event.target.value)
            nameField.clear()
          }}
        />
      </FormField>
      <FormField label={t('f_icon')} group>
        <IconPicker value={icon} onChange={setIcon} />
      </FormField>
      <FormField label={t('f_status')} htmlFor="task-form-status">
        <select
          id="task-form-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="todo">{t('s_todo')}</option>
          <option value="doing">{t('s_doing')}</option>
          <option value="skip">{t('s_skip')}</option>
          <option value="done">{t('s_done')}</option>
        </select>
      </FormField>
      <FormField
        label={t(existing ? 'f_move_date' : 'f_date')}
        htmlFor="task-form-move-date"
        error={moveDateInvalid ? t('task_date_invalid') : undefined}
        errorId="task-form-move-date-error"
      >
        <input
          id="task-form-move-date"
          data-testid="task-date-input"
          type="date"
          value={moveDate}
          aria-invalid={moveDateInvalid || undefined}
          aria-describedby={
            moveDateInvalid ? 'task-form-move-date-error' : undefined
          }
          onChange={(event) => setMoveDate(event.target.value)}
        />
      </FormField>
      <ModalActions>
        <button
          className="secondary-button"
          type="button"
          onClick={requestClose}
        >
          {t('btn_cancel')}
        </button>
        <button
          className="primary-button"
          type="submit"
          data-testid="task-save"
          disabled={moveDateInvalid || saving}
        >
          {t('btn_save')}
        </button>
      </ModalActions>
    </form>
  )
}
