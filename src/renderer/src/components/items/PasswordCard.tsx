import {
  IconCopy,
  IconDone,
  IconHide,
  IconShow,
  IconWarning,
} from '../common/icons'
import EntryIcon from '../common/EntryIcon'

import type { GroupItemMap } from '../../../../shared/types'
import { useCopyFeedback } from '../../hooks/use-copy-feedback'
import { useI18n } from '../../hooks/use-i18n'
import CopyStatus from './CopyStatus'
import ItemActions from './ItemActions'

type Props = {
  item: GroupItemMap['passwords']
  revealed: boolean
  onToggleReveal: () => void
  onCopyUsername: () => Promise<boolean>
  onCopyPassword: () => Promise<boolean>
  onEdit: () => void
  onDelete: () => void
}

export default function PasswordCard({
  item,
  revealed,
  onToggleReveal,
  onCopyUsername,
  onCopyPassword,
  onEdit,
  onDelete,
}: Props): JSX.Element {
  const { t } = useI18n()
  const [userCopied, markUserCopied, userCount] = useCopyFeedback()
  const [passwordCopied, markPasswordCopied, passwordCount] = useCopyFeedback()
  // The stored password could not be decrypted on this machine; it must be typed again.
  const lost = item.passwordLost === true
  return (
    <>
      <div className="credential-header">
        <span className="item-icon">
          <EntryIcon icon={item.icon} />
        </span>
        <strong className="item-name" title={item.name}>
          {item.name}
        </strong>
        <ItemActions
          testIdPrefix={item.id}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
      <div
        className="credential-fields"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="credential-row">
          <span className="credential-label">{t('f_username')}</span>
          <button
            className="credential-copy"
            type="button"
            aria-label={userCopied ? t('username_copied') : t('copy_username')}
            title={
              userCopied
                ? t('username_copied')
                : item.username
                  ? `${t('copy_username')} · ${item.username}`
                  : t('username_empty')
            }
            data-copied={userCopied ? '' : undefined}
            data-testid={`copy-username-${item.id}`}
            disabled={!item.username}
            onClick={async () => {
              if (await onCopyUsername()) markUserCopied()
            }}
          >
            <span className="credential-value">
              {item.username || t('username_empty')}
            </span>
            {userCopied ? (
              <IconDone key={userCount} size={14} />
            ) : (
              <IconCopy size={14} />
            )}
          </button>
          <CopyStatus message={userCopied ? t('username_copied') : ''} />
        </div>
        <div className="credential-row">
          <span className="credential-label">{t('f_password')}</span>
          <button
            className={`credential-copy ${lost ? 'lost' : ''}`.trim()}
            type="button"
            aria-label={
              lost
                ? t('pwd_lost')
                : passwordCopied
                  ? t('password_copied')
                  : t('copy_password')
            }
            title={
              lost
                ? t('pwd_lost')
                : passwordCopied
                  ? t('password_copied')
                  : t('copy_password')
            }
            data-copied={passwordCopied ? '' : undefined}
            data-testid={`copy-item-${item.id}`}
            disabled={!item.password}
            onClick={async () => {
              if (await onCopyPassword()) markPasswordCopied()
            }}
          >
            {lost ? (
              <span
                className="credential-value credential-secret lost"
                data-testid={`password-lost-${item.id}`}
              >
                <IconWarning size={12} aria-hidden="true" />
                {t('pwd_lost')}
              </span>
            ) : (
              <>
                <span
                  className={`credential-value credential-secret ${revealed ? 'revealed' : ''}`}
                >
                  {revealed ? item.password : '********'}
                </span>
                {passwordCopied ? (
                  <IconDone key={passwordCount} size={14} />
                ) : (
                  <IconCopy size={14} />
                )}
              </>
            )}
          </button>
          <CopyStatus message={passwordCopied ? t('password_copied') : ''} />
          <button
            className={`icon-button credential-reveal ${revealed ? 'active' : ''}`}
            type="button"
            aria-label={revealed ? t('pwd_hide') : t('pwd_show')}
            title={revealed ? t('pwd_hide') : t('pwd_show')}
            data-testid={`toggle-password-${item.id}`}
            onClick={onToggleReveal}
          >
            {revealed ? <IconHide size={14} /> : <IconShow size={14} />}
          </button>
        </div>
      </div>
    </>
  )
}
