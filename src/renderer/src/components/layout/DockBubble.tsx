import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react'

import type {
  DockAppearance,
  QuickLaunchResult,
} from '../../../../shared/types'
import { resolveLang } from '../../i18n/resolve-lang'
import { workspaceStrings } from '../../i18n/workspace'
import { useWindowPresentation } from '../../hooks/use-window-presentation'

/** A click's press normally ends when the presentation animation takes over; this is the safety net. */
const PRESS_FALLBACK_MS = 400

// Two clicks closer together than this are a double click (the Windows default is 500 ms).
const DOUBLE_CLICK_MS = 500
// A click on an open panel collapses it only after this long, so that a second click can turn it
// into a kept-open window without the panel folding away and back first.
const COLLAPSE_DELAY_MS = 250

/** The main process puts the saved appearance in the URL, so the first frame is already right. */
function initialAppearance(): DockAppearance {
  const query = new URLSearchParams(window.location.search)
  return {
    lang: resolveLang(query.get('lang')),
    theme: query.get('theme') === 'light' ? 'light' : 'dark',
  }
}

export default function DockBubble(): JSX.Element {
  useWindowPresentation()
  const [appearance, setAppearance] =
    useState<DockAppearance>(initialAppearance)
  const strings = workspaceStrings[resolveLang(appearance.lang)]
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  // Read by the click handler, which must not be rebuilt on every state change.
  const expandedRef = useRef(false)
  const collapseTimer = useRef<number | null>(null)
  const lastClick = useRef<{ time: number; x: number; y: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const pressTimer = useRef<number | undefined>(undefined)
  const pointer = useRef<{
    id: number
    x: number
    y: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  const pending = useRef<Promise<QuickLaunchResult<{ moved: boolean }>> | null>(
    null
  )

  const cancelCollapse = useCallback((): void => {
    if (collapseTimer.current === null) return
    window.clearTimeout(collapseTimer.current)
    collapseTimer.current = null
  }, [])

  useEffect(() => {
    let active = true
    const unsubscribe = window.quickLaunch.onDockAppearance(setAppearance)
    const unsubscribeState = window.quickLaunch.onWindowState((state) => {
      expandedRef.current = !state.collapsed
      setExpanded(!state.collapsed)
      // Something else (a very short auto-collapse delay, a shortcut, Win+D) already closed the
      // panel: the delayed collapse would only make the main process open it again.
      if (state.collapsed) cancelCollapse()
    })
    // The ball never asks for the user's data (it holds passwords): only for how to look.
    void window.quickLaunch.getDockAppearance().then((result) => {
      if (active && result.ok) setAppearance(result.data)
    })
    return () => {
      active = false
      unsubscribe()
      unsubscribeState()
      cancelCollapse()
    }
  }, [cancelCollapse])

  // The window state is also pushed, but only when it changes: a ball that appears while the
  // panel is already open has to ask.
  useEffect(() => {
    let active = true
    void window.quickLaunch.window.getState().then((result) => {
      if (!active || !result.ok) return
      expandedRef.current = !result.data.collapsed
      setExpanded(!result.data.collapsed)
    })
    return () => {
      active = false
    }
  }, [])

  const activate = useCallback(
    async (mode: 'peek' | 'window'): Promise<void> => {
      const result = await window.quickLaunch.window.activateDock(mode)
      if (!result.ok) setError(result.error)
    },
    []
  )

  // The press state is set straight on the element: it must show on the next frame, before any
  // IPC answers, and the presentation animation clears it without React knowing.
  const setPressed = useCallback((pressed: boolean): void => {
    window.clearTimeout(pressTimer.current)
    pressTimer.current = undefined
    if (pressed) button.current?.setAttribute('data-pressed', '1')
    else button.current?.removeAttribute('data-pressed')
  }, [])

  const releasePressSoon = useCallback((): void => {
    window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = undefined
      button.current?.removeAttribute('data-pressed')
    }, PRESS_FALLBACK_MS)
  }, [])

  const finishDrag = useCallback(
    (
      event: { pointerId: number; screenX: number; screenY: number },
      cancelled = false
    ): void => {
      const current = pointer.current
      if (!current || current.id !== event.pointerId) return
      // Clear interaction state before releasing capture or awaiting IPC. A failed
      // capture/IPC must never leave the next click stuck in an old drag.
      pointer.current = null
      setDragging(false)
      // A click keeps its press until the animation takes over; anything else ends it now.
      if (cancelled) setPressed(false)
      else releasePressSoon()
      try {
        if (button.current?.hasPointerCapture(event.pointerId))
          button.current.releasePointerCapture(event.pointerId)
      } catch {
        /* Native capture may already have ended; still finish the IPC drag. */
      }
      const start = pending.current
      pending.current = null
      // Send release immediately, in the same IPC stream as press, rather than
      // leaving native tracking running for an extra renderer round trip.
      const end = window.quickLaunch.window.dragDock({
        phase: 'end',
        x: event.screenX,
        y: event.screenY,
      })
      void (async () => {
        await start?.catch((reason) => setError(String(reason)))
        const result = await end
        if (!result.ok) setError(result.error)
        else if (!current.moved && !result.data.moved && !cancelled) {
          const previous = lastClick.current
          const double =
            previous &&
            Date.now() - previous.time < DOUBLE_CLICK_MS &&
            Math.hypot(event.screenX - previous.x, event.screenY - previous.y) <
              5
          lastClick.current = double
            ? null
            : { time: Date.now(), x: event.screenX, y: event.screenY }
          cancelCollapse()
          if (double) await activate('window')
          else if (expandedRef.current)
            collapseTimer.current = window.setTimeout(() => {
              collapseTimer.current = null
              if (!expandedRef.current) return
              void activate('peek').catch((reason) => setError(String(reason)))
            }, COLLAPSE_DELAY_MS)
          else await activate('peek')
        } else lastClick.current = null
      })().catch((reason) => setError(String(reason)))
    },
    [activate, cancelCollapse, releasePressSoon, setPressed]
  )

  const moveDrag = useCallback(
    (event: { pointerId: number; screenX: number; screenY: number }): void => {
      const current = pointer.current
      if (!current || current.id !== event.pointerId) return
      current.lastX = event.screenX
      current.lastY = event.screenY
      if (
        current.moved ||
        Math.hypot(event.screenX - current.x, event.screenY - current.y) < 5
      )
        return
      current.moved = true
      cancelCollapse()
      setDragging(true)
      setPressed(false)
      void window.quickLaunch.window
        .dragDock({ phase: 'track', x: event.screenX, y: event.screenY })
        .catch((reason) => setError(String(reason)))
    },
    [cancelCollapse, setPressed]
  )

  useEffect(() => {
    const up = (event: globalThis.PointerEvent) => finishDrag(event)
    const cancel = (event: globalThis.PointerEvent) => finishDrag(event, true)
    const blur = () => {
      setPressed(false)
      const current = pointer.current
      // Only a drag ends here. A press that has not moved is still a click: the panel taking focus
      // as it finishes expanding blurs the ball in the middle of one.
      if (current?.moved)
        finishDrag(
          {
            pointerId: current.id,
            screenX: current.lastX,
            screenY: current.lastY,
          },
          true
        )
    }
    const move = (event: globalThis.PointerEvent) => {
      if (event.buttons === 0) finishDrag(event, true)
      else moveDrag(event)
    }
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('blur', blur)
    }
  }, [finishDrag, moveDrag, setPressed])

  useEffect(() => () => window.clearTimeout(pressTimer.current), [])

  function startDrag(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* Window-level release listeners cover unavailable capture. */
    }
    setPressed(true)
    pointer.current = {
      id: event.pointerId,
      x: event.screenX,
      y: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false,
    }
    setError('')
    pending.current = window.quickLaunch.window.dragDock({
      phase: 'start',
      x: event.screenX,
      y: event.screenY,
      offset: { x: event.clientX, y: event.clientY },
    })
  }

  return (
    <div className={`dock-root theme-${appearance.theme}`}>
      <button
        ref={button}
        className={`dock-bubble${dragging ? ' dragging' : ''}`}
        type="button"
        data-testid="dock-bubble"
        aria-label={expanded ? strings.dock_close : strings.dock_open}
        aria-expanded={expanded}
        title={
          error ||
          (expanded ? strings.dock_bubble_hint_open : strings.dock_bubble_hint)
        }
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onClick={(event) => {
          // Enter, Space and an assistive technology's default action arrive as a click without a
          // pointer. They do what the accessible name says: collapse an open panel, open a closed one
          // and keep it open.
          if (event.detail !== 0) return
          cancelCollapse()
          void activate(expandedRef.current ? 'peek' : 'window').catch(
            (reason) => setError(String(reason))
          )
        }}
      >
        <span className="dock-bubble-surface" aria-hidden="true">
          <span className="dock-bubble-dot" />
        </span>
      </button>
    </div>
  )
}
