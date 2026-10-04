import { IconAdd } from './icons'

type Props = {
  icon: React.ReactNode
  title: string
  /** One sentence of guidance under the title: what the page is for. */
  description?: string | undefined
  actionLabel?: string
  actionTestId?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionTestId,
  onAction,
}: Props): JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state-illustration">{icon}</div>
      <div className="empty-state-title">{title}</div>
      {description && (
        <p className="empty-state-description" data-testid="empty-description">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          className="empty-state-action"
          type="button"
          data-testid={actionTestId}
          onClick={onAction}
        >
          <IconAdd size={14} />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  )
}

export default EmptyState
