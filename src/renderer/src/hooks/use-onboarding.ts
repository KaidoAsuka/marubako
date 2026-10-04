import { useCallback, useEffect, useMemo, useState } from 'react'

import { GROUP_TABS, type AppData } from '../../../shared/types'
import { useAppStore } from '../store/use-app-store'
import { getStartupParams } from '../utils/startup-params'

/** Where the first-run card keeps its state: with the other first-run flags, in this window's storage. */
export const ONBOARDING_KEY = 'onboarding-v1'

export interface OnboardingState {
  /** The user closed the card for good (or finished it). */
  dismissed: boolean
  /**
   * The ids of the entries that existed when the card began (the samples). An entry outside this
   * list is one the user added: that is how the first line gets its tick, whatever way it was added.
   */
  baseline: string[]
  /** The panel was folded into the ball and opened again. */
  bubble: boolean
  /** The panel was brought up with the global shortcut. */
  hotkey: boolean
}

export type StoredOnboarding =
  /** Storage cannot be used at all (a private window, blocked site data). */
  | { usable: false }
  /** `state` is null when nothing has been stored yet. */
  | { usable: true; state: OnboardingState | null }

export function readOnboarding(): StoredOnboarding {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (raw === null) return { usable: true, state: null }
    const parsed: unknown = JSON.parse(raw)
    const stored =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {}
    return {
      usable: true,
      state: {
        dismissed: stored.dismissed === true,
        baseline: Array.isArray(stored.baseline)
          ? stored.baseline.filter((id): id is string => typeof id === 'string')
          : [],
        bubble: stored.bubble === true,
        hotkey: stored.hotkey === true,
      },
    }
  } catch {
    return { usable: false }
  }
}

function writeOnboarding(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state))
  } catch {
    // Not remembered: the card is then simply gone for this session.
  }
}

/** Whether the first-run card is on screen now, or will be at the next start. */
export function onboardingActive(): boolean {
  const stored = readOnboarding()
  return stored.usable && stored.state !== null && !stored.state.dismissed
}

/** The id of every entry in the data: the items of the groups and the loose ones. */
export function entryIds(data: AppData | null): string[] {
  if (!data) return []
  const ids: string[] = []
  for (const tab of GROUP_TABS) {
    for (const group of data[tab])
      for (const item of group.items) ids.push(item.id)
    for (const item of data.loose[tab]) ids.push(item.id)
  }
  return ids
}

export interface OnboardingProgress {
  added: boolean
  bubble: boolean
  hotkey: boolean
}

export interface Onboarding {
  visible: boolean
  progress: OnboardingProgress
  /** Every line that applies has been done. */
  complete: boolean
  /** Closes the card for good. */
  dismiss: () => void
}

/**
 * The first-run card. It starts on the first run of a new installation (the main process says so
 * in the URL) and then stays, start after start, until it is closed for good: what is stored is
 * what keeps it. An installation that existed before the card did, and every run that is not a
 * first one, never sees it. Where nothing can be stored it stays away rather than come back on
 * every start.
 *
 * `hotkeyApplies` says whether the third line exists (null while that is not known): there is no
 * line about a shortcut that could not be registered. `bubbleApplies` is false while the ball is
 * turned off: there is nothing to collapse into, so no line about it.
 */
export function useOnboarding(
  hotkeyApplies: boolean | null,
  bubbleApplies = true
): Onboarding {
  const data = useAppStore((state) => state.data)
  const ids = useMemo(() => entryIds(data), [data])
  const [stored, setStored] = useState<StoredOnboarding>(() => {
    const read = readOnboarding()
    if (!read.usable || read.state !== null) return read
    // Nothing stored: the first run begins the card here, with the entries as they are now.
    return getStartupParams().firstRun
      ? {
          usable: true,
          state: {
            dismissed: false,
            baseline: entryIds(useAppStore.getState().data),
            bubble: false,
            hotkey: false,
          },
        }
      : read
  })
  const state = stored.usable ? stored.state : null
  const visible = state !== null && !state.dismissed

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setStored((current) =>
      current.usable && current.state
        ? { usable: true, state: { ...current.state, ...patch } }
        : current
    )
  }, [])

  // Everything that happens to the state is written down, so that the next start continues.
  useEffect(() => {
    if (state) writeOnboarding(state)
  }, [state])

  // The panel folded into the ball and opened again: the second line.
  useEffect(() => {
    if (!visible) return undefined
    return useAppStore.subscribe((current, previous) => {
      if (previous.windowState.collapsed && !current.windowState.collapsed)
        update({ bubble: true })
    })
  }, [visible, update])

  // The panel brought up with the shortcut: the third line.
  useEffect(() => {
    if (!visible) return undefined
    return window.quickLaunch.onActivate((source) => {
      if (source === 'hotkey') update({ hotkey: true })
    })
  }, [visible, update])

  const progress: OnboardingProgress = useMemo(() => {
    const known = new Set(state?.baseline ?? [])
    return {
      added: state !== null && ids.some((id) => !known.has(id)),
      bubble: state?.bubble ?? false,
      hotkey: state?.hotkey ?? false,
    }
  }, [state, ids])

  const dismiss = useCallback(() => update({ dismissed: true }), [update])

  return {
    visible,
    progress,
    complete:
      visible &&
      hotkeyApplies !== null &&
      progress.added &&
      (progress.bubble || !bubbleApplies) &&
      (progress.hotkey || !hotkeyApplies),
    dismiss,
  }
}
