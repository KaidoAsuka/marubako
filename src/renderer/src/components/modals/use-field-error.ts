import { useEffect, useState } from 'react'

/**
 * The state of one field that can be wrong: the message, the attributes that make a screen reader
 * say so, and the two moves a form makes: show the message while putting the cursor in the field,
 * and take the message back once the user edits the field.
 */
export function useFieldError(inputId: string) {
  const [error, setError] = useState('')
  const errorId = `${inputId}-error`
  // The dialog body scrolls: bring the message into view, not only the field.
  useEffect(() => {
    if (error) {
      document.getElementById(errorId)?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [error, errorId])

  return {
    error,
    errorId,
    /** Spread onto the control. */
    attributes: {
      'aria-invalid': error ? (true as const) : undefined,
      'aria-describedby': error ? errorId : undefined,
    },
    fail(message: string): void {
      setError(message)
      document.getElementById(inputId)?.focus()
    },
    clear(): void {
      setError('')
    },
  }
}

/** Ctrl+S (Cmd+S) saves a form, the same as Enter in one of its fields. */
export function isSaveShortcut(event: {
  ctrlKey: boolean
  metaKey: boolean
  key: string
}): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
}
