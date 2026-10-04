import { useState } from 'react'
import { IconCaretDown, IconCaretUp, IconCopy, IconDone } from '../common/icons'
import EntryIcon from '../common/EntryIcon'
import type { CommandItem } from '../../../../shared/types'
import { useCopyFeedback } from '../../hooks/use-copy-feedback'
import { useI18n } from '../../hooks/use-i18n'
import { highlightCode, languageLabels } from '../../utils/code'
import CopyStatus from './CopyStatus'
import ItemActions from './ItemActions'

type Props = {
  item: CommandItem
  onCopy: () => Promise<boolean>
  onEdit: () => void
  onDelete: () => void
}

export default function CommandSnippet({
  item,
  onCopy,
  onEdit,
  onDelete,
}: Props): JSX.Element {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [copied, markCopied, copyCount] = useCopyFeedback()
  const lines = item.content.split('\n')
  const preview = expanded ? item.content : lines.slice(0, 2).join('\n')
  const tokens = highlightCode(preview, item.language)
  return (
    <div className="command-snippet">
      <div className="snippet-header">
        <span className="snippet-icon">
          <EntryIcon icon={item.icon} />
        </span>
        <div className="snippet-heading">
          <strong title={item.name}>{item.name}</strong>
          <span>
            {languageLabels[item.language]} · {lines.length} {t('cmd_lines')}
          </span>
        </div>
        <button
          className="snippet-copy"
          type="button"
          data-testid={`copy-item-${item.id}`}
          title={copied ? t('copied') : t('cmd_copy')}
          aria-label={copied ? t('copied') : t('cmd_copy')}
          data-copied={copied ? '' : undefined}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={async (event) => {
            event.stopPropagation()
            if (await onCopy()) markCopied()
          }}
        >
          {copied ? (
            <IconDone key={copyCount} size={14} />
          ) : (
            <IconCopy size={14} />
          )}
          <span>{copied ? t('copied') : t('cmd_copy')}</span>
        </button>
        <CopyStatus message={copied ? t('copied') : ''} />
        <ItemActions
          testIdPrefix={item.id}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
      {item.description && (
        <p className="snippet-description" title={item.description}>
          {item.description}
        </p>
      )}
      <div
        className="snippet-code"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="snippet-line-numbers" aria-hidden="true">
          {lines.slice(0, expanded ? undefined : 2).map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
        <pre data-testid={`command-code-${item.id}`}>
          <code>
            {tokens.map((token, index) => (
              <span
                key={index}
                className={token.kind ? `code-token-${token.kind}` : undefined}
              >
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
      {lines.length > 2 && (
        <button
          className="snippet-expand"
          type="button"
          aria-expanded={expanded}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <IconCaretUp size={14} /> : <IconCaretDown size={14} />}
          {t(expanded ? 'cmd_collapse' : 'cmd_expand')}
        </button>
      )}
    </div>
  )
}
