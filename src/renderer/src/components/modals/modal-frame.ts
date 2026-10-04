import { createContext, useContext, useEffect } from 'react'

import { useAppStore } from '../../store/use-app-store'

/**
 * What the dialog frame (Modal.tsx) offers the form inside it. Closing a dialog by Esc, the overlay,
 * the X button or a form's own Cancel button all go through `requestClose`: it asks first while the
 * form holds edits nobody saved. The question is an inline bar inside the dialog card, not a second
 * dialog, because the confirm dialog shares the store's single modal slot and would unmount the
 * form (and the draft with it).
 */
export type ModalFrame = {
  /** A form tells the frame whether it holds unsaved edits. */
  setDirty: (dirty: boolean) => void
  /** Close the way the user asked to: with a question first while there are unsaved edits. */
  requestClose: () => void
  /** The "Discard unsaved changes?" bar is showing. */
  discardPrompt: boolean
  /** Answer "Keep editing". */
  keepEditing: () => void
  /** Answer "Discard": the dialog closes and the draft is gone. */
  discard: () => void
}

// A form rendered on its own (a unit test, a story) has no frame around it: it closes straight away.
const STANDALONE: ModalFrame = {
  setDirty: () => {},
  requestClose: () => useAppStore.getState().setModal(null),
  discardPrompt: false,
  keepEditing: () => {},
  discard: () => useAppStore.getState().setModal(null),
}

export const ModalFrameContext = createContext<ModalFrame>(STANDALONE)

export function useModalFrame(): ModalFrame {
  return useContext(ModalFrameContext)
}

/**
 * Reports whether a form has edits that are not saved yet. Call it with a value derived from the
 * form state ("some field differs from what it started with") and use the returned `requestClose`
 * for every way out except a successful save, which closes the dialog directly.
 */
export function useUnsavedGuard(dirty: boolean): ModalFrame {
  const frame = useModalFrame()
  const { setDirty } = frame
  useEffect(() => {
    setDirty(dirty)
    return () => setDirty(false)
  }, [dirty, setDirty])
  return frame
}
