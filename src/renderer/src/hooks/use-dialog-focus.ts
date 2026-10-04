import { useEffect, useRef } from 'react'

export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    const selector =
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
        (element) => element.getClientRects().length > 0
      )
    // A form can ask for a particular field (the broken path of an entry that would not open).
    const requested = dialog?.querySelector<HTMLElement>('[data-autofocus]')
    const target =
      requested ??
      dialog?.querySelector<HTMLElement>(
        'input:not([type="checkbox"]), textarea'
      ) ??
      focusable()[0] ??
      dialog
    target?.focus()
    if (requested instanceof HTMLInputElement) requested.select()
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (document.querySelector('.emoji-picker-portal')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
      if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (!first) {
          event.preventDefault()
          return
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialog?.contains(document.activeElement))
        ) {
          event.preventDefault()
          last?.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !dialog?.contains(document.activeElement))
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      if (
        previous?.isConnected &&
        !document.querySelector('[aria-modal="true"]')
      )
        previous.focus()
    }
  }, [open, onClose])
  return ref
}
