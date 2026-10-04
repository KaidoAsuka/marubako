import { useExternalAdd } from '../../hooks/use-external-add'

/**
 * Takes what is dropped on the panel and pasted into it (see use-external-add.ts), and while a file
 * or a link is dragged over it draws the dashed drop area with the words for where it would go.
 */
export default function ExternalDropZone(): JSX.Element | null {
  const { dropLabel } = useExternalAdd()
  if (dropLabel === null) return null

  return (
    <div
      className="external-drop-zone"
      data-testid="external-drop-zone"
      aria-hidden="true"
    >
      <span>{dropLabel}</span>
    </div>
  )
}
