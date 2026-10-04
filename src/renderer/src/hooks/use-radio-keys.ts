import { useRef, type KeyboardEvent } from 'react'

/**
 * The keyboard half of a radio group made of buttons: only the chosen option is in the tab order
 * (give the others tabIndex -1), and the arrow keys, Home and End choose another one and move the
 * focus to it, wrapping at the ends.
 */
export function useRadioKeys<T>(
  options: readonly T[],
  onChange: (next: T) => void
): {
  setRef: (index: number) => (node: HTMLButtonElement | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void
} {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  return {
    setRef: (index) => (node) => {
      refs.current[index] = node
    },
    onKeyDown: (event, index) => {
      const count = options.length
      const target =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? (index + 1) % count
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? (index + count - 1) % count
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? count - 1
                : null
      const next = target === null ? undefined : options[target]
      if (target === null || next === undefined) return

      event.preventDefault()
      onChange(next)
      refs.current[target]?.focus()
    },
  }
}
