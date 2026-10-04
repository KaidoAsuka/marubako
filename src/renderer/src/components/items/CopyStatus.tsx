/**
 * What a copy button announces to a screen reader. The toast used to do this; a changed
 * aria-label is not read out reliably, so the region stays in the page and only its text changes.
 */
export default function CopyStatus({
  message,
}: {
  message: string
}): JSX.Element {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {message}
    </span>
  )
}
