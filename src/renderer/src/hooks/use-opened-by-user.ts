import { useState } from 'react'

/**
 * Whether a card's body was opened while the card was on screen, as opposed to having been open
 * when the card appeared (a page that was switched to, a card that was moved). Only the first kind
 * unfolds with an animation: a whole page of bodies unfolding at once reads as the page itself
 * dropping down.
 */
export function useOpenedByUser(open: boolean): boolean {
  // A body that arrived open has not been closed yet; once it has, the next opening is the user's.
  const [closedOnce, setClosedOnce] = useState(!open)
  if (!open && !closedOnce) setClosedOnce(true)

  return open && closedOnce
}
