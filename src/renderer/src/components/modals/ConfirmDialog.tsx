import { useAppStore } from '../../store/use-app-store'
import type { ModalState } from '../../store/store-types'
import { useI18n } from '../../hooks/use-i18n'

export default function ConfirmDialog({
  modalSnapshot,
}: {
  modalSnapshot?: ModalState
}): JSX.Element | null {
  const { t } = useI18n()
  const activeModal = useAppStore((state) => state.modal)
  const modal = modalSnapshot ?? activeModal
  const setModal = useAppStore((state) => state.setModal)

  if (!modal || modal.kind !== 'confirm') {
    return null
  }

  return (
    <div className="modal-confirm">
      <p>{modal.title}</p>
      <div className="modal-actions">
        <button
          className="secondary-button"
          type="button"
          data-testid="confirm-cancel"
          onClick={() => setModal(null)}
        >
          {t('btn_cancel')}
        </button>
        <button
          className="primary-button danger"
          type="button"
          data-testid="confirm-submit"
          onClick={() => {
            modal.onConfirm()
          }}
        >
          {modal.confirmLabel ?? t('btn_delete')}
        </button>
      </div>
    </div>
  )
}
