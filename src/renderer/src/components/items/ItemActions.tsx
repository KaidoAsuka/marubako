import {
  IconCopy,
  IconDelete,
  IconDone,
  IconEdit,
  IconHide,
  IconShow,
} from '../common/icons'
import { useCopyFeedback } from '../../hooks/use-copy-feedback'
import { useI18n } from '../../hooks/use-i18n'
import CopyStatus from './CopyStatus'

type Props = {
  onEdit: () => void
  onDelete: () => void
  /** Resolves to false when nothing was copied; anything else counts as copied. */
  onCopy?: () => void | boolean | Promise<void | boolean>
  onToggleReveal?: () => void
  revealLabel?: string
  revealed?: boolean
  testIdPrefix?: string
}

export default function ItemActions({
  onEdit,
  onDelete,
  onCopy,
  onToggleReveal,
  revealLabel,
  revealed = false,
  testIdPrefix,
}: Props): JSX.Element {
  const { t } = useI18n()
  const [copied, markCopied, copyCount] = useCopyFeedback()
  return (
    <div
      className="item-actions"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onToggleReveal && revealLabel && (
        <button
          className={`icon-button ${revealed ? 'active' : ''}`.trim()}
          type="button"
          aria-label={revealLabel}
          title={revealLabel}
          data-testid={
            testIdPrefix ? `toggle-password-${testIdPrefix}` : undefined
          }
          onClick={onToggleReveal}
        >
          {revealed ? <IconHide size={14} /> : <IconShow size={14} />}
        </button>
      )}
      {onCopy && (
        <>
          <button
            className="icon-button"
            type="button"
            title={copied ? t('copied') : t('copy')}
            aria-label={copied ? t('copied') : t('copy')}
            data-copied={copied ? '' : undefined}
            data-testid={testIdPrefix ? `copy-item-${testIdPrefix}` : undefined}
            onClick={async () => {
              if ((await onCopy()) !== false) markCopied()
            }}
          >
            {copied ? (
              <IconDone key={copyCount} size={14} />
            ) : (
              <IconCopy size={14} />
            )}
          </button>
          <CopyStatus message={copied ? t('copied') : ''} />
        </>
      )}
      <button
        className="icon-button"
        type="button"
        title={t('m_edit_item')}
        aria-label={t('m_edit_item')}
        data-testid={testIdPrefix ? `edit-item-${testIdPrefix}` : undefined}
        onClick={onEdit}
      >
        <IconEdit size={14} />
      </button>
      <button
        className="icon-button danger"
        type="button"
        title={t('btn_delete')}
        aria-label={t('btn_delete')}
        data-testid={testIdPrefix ? `delete-item-${testIdPrefix}` : undefined}
        onClick={onDelete}
      >
        <IconDelete size={14} />
      </button>
    </div>
  )
}
