import { useState } from 'react'

import { DEFAULT_GROUP_ICONS } from '../../../../shared/default-icons'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'
import type { ModalState } from '../../store/store-types'
import IconPicker from '../common/IconPicker'
import FormField from '../common/FormField'
import ModalActions from './ModalActions'
import { useUnsavedGuard } from './modal-frame'
import { isSaveShortcut, useFieldError } from './use-field-error'

export default function GroupForm({
  modalSnapshot,
}: {
  modalSnapshot?: ModalState
}): JSX.Element | null {
  const { t } = useI18n()
  const activeModal = useAppStore((state) => state.modal)
  const modal = modalSnapshot ?? activeModal
  const data = useAppStore((state) => state.data)
  const updateData = useAppStore((state) => state.updateData)
  const setModal = useAppStore((state) => state.setModal)
  const saving = useAppStore((state) => state.saving)
  const active = modal?.kind === 'group' ? modal : null
  const existing =
    active?.groupId && data
      ? (data[active.tab].find((group) => group.id === active.groupId) ?? null)
      : null

  const defaultIcon = DEFAULT_GROUP_ICONS[active?.tab ?? 'folders']
  const [initial] = useState(() => ({
    name: existing?.name ?? '',
    icon: existing?.icon ?? defaultIcon,
  }))
  const [name, setName] = useState(initial.name)
  const [icon, setIcon] = useState(initial.icon)
  const { requestClose } = useUnsavedGuard(
    name !== initial.name || icon !== initial.icon
  )
  const nameField = useFieldError('group-form-name')

  if (!active || !data) {
    return null
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!name.trim()) {
      nameField.fail(t('invalid_name'))
      return
    }

    await updateData((draft) => {
      if (existing) {
        const target = draft[active.tab].find(
          (group) => group.id === existing.id
        )
        if (target) {
          target.name = name.trim()
          target.icon = icon.trim() || defaultIcon
        }
        return
      }

      draft[active.tab].push({
        id: crypto.randomUUID(),
        name: name.trim(),
        icon: icon.trim() || defaultIcon,
        open: true,
        items: [],
      })
    })

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
        htmlFor="group-form-name"
        error={nameField.error}
        errorId={nameField.errorId}
      >
        <input
          id="group-form-name"
          data-testid="group-name-input"
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
          data-testid="group-save"
          disabled={saving}
        >
          {t('btn_save')}
        </button>
      </ModalActions>
    </form>
  )
}
