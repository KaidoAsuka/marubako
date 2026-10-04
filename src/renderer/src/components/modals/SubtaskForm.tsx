import { useState } from 'react'

import { useI18n } from '../../hooks/use-i18n'
import { changeSubtasks } from '../../store/task-actions'
import { useAppStore } from '../../store/use-app-store'
import type { ModalState } from '../../store/store-types'
import FormField from '../common/FormField'
import type { TaskStatus } from '../../../../shared/types'
import ModalActions from './ModalActions'
import { useUnsavedGuard } from './modal-frame'
import { isSaveShortcut, useFieldError } from './use-field-error'

export default function SubtaskForm({
  modalSnapshot,
}: {
  modalSnapshot?: ModalState
}): JSX.Element | null {
  const { t } = useI18n()
  const activeModal = useAppStore((state) => state.modal)
  const modal = modalSnapshot ?? activeModal
  const data = useAppStore((state) => state.data)
  const setModal = useAppStore((state) => state.setModal)
  const saving = useAppStore((state) => state.saving)
  const active = modal?.kind === 'subtask' ? modal : null
  const task =
    active && data
      ? ((data.tasks[active.date] ?? []).find(
          (entry) => entry.id === active.taskId
        ) ?? null)
      : null
  const existing =
    active && active.subtaskId !== null
      ? (task?.subtasks.find((entry) => entry.id === active.subtaskId) ?? null)
      : null

  const [initial] = useState(() => ({
    name: existing?.name ?? '',
    status: existing?.status ?? ('todo' as TaskStatus),
  }))
  const [name, setName] = useState(initial.name)
  const [status, setStatus] = useState(initial.status)
  const { requestClose } = useUnsavedGuard(
    name !== initial.name || status !== initial.status
  )
  const nameField = useFieldError('subtask-form-name')

  if (!active || !data) {
    return null
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!name.trim()) {
      nameField.fail(t('invalid_name'))
      return
    }

    const id = existing?.id ?? crypto.randomUUID()
    await changeSubtasks(
      active.date,
      active.taskId,
      (draftTask) => {
        const index = draftTask.subtasks.findIndex((entry) => entry.id === id)
        const next = { id, name: name.trim(), status }

        if (index >= 0) {
          draftTask.subtasks[index] = next
        } else {
          draftTask.subtasks.push(next)
        }
      },
      t
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
        label={t('f_name')}
        required
        htmlFor="subtask-form-name"
        error={nameField.error}
        errorId={nameField.errorId}
      >
        <input
          id="subtask-form-name"
          data-testid="subtask-name-input"
          value={name}
          autoComplete="off"
          {...nameField.attributes}
          onChange={(event) => {
            setName(event.target.value)
            nameField.clear()
          }}
        />
      </FormField>
      <FormField label={t('f_status')} htmlFor="subtask-form-status">
        <select
          id="subtask-form-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="todo">{t('s_todo')}</option>
          <option value="doing">{t('s_doing')}</option>
          <option value="skip">{t('s_skip')}</option>
          <option value="done">{t('s_done')}</option>
        </select>
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
          data-testid="subtask-save"
          disabled={saving}
        >
          {t('btn_save')}
        </button>
      </ModalActions>
    </form>
  )
}
