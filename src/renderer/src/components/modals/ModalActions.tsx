import { IconWarning } from '../common/icons'
import { useI18n } from '../../hooks/use-i18n'
import { useModalFrame } from './modal-frame'

/**
 * The button row at the foot of a form dialog. While the user is being asked whether to throw away
 * unsaved edits, the question sits right above the buttons, inside the dialog card.
 */
export default function ModalActions({
  children,
}: {
  children: React.ReactNode
}): JSX.Element {
  const { t } = useI18n()
  const frame = useModalFrame()

  return (
    <>
      {frame.discardPrompt && (
        <div className="discard-bar" role="alert" data-testid="discard-bar">
          <span className="discard-bar-text">
            <IconWarning size={14} className="discard-bar-icon" />
            {t('discard_prompt')}
          </span>
          <span className="discard-bar-actions">
            <button
              className="secondary-button"
              type="button"
              data-testid="discard-keep"
              onClick={frame.keepEditing}
            >
              {t('discard_keep')}
            </button>
            <button
              className="primary-button danger"
              type="button"
              data-testid="discard-confirm"
              onClick={frame.discard}
            >
              {t('discard_confirm')}
            </button>
          </span>
        </div>
      )}
      <div className="modal-actions">{children}</div>
    </>
  )
}
