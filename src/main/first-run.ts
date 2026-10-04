import type { Prefs } from '../shared/types'

/**
 * Whether this run shows the first-run experience: the guidance card on the first screen and, for
 * a window that has never been placed, the ball beside the panel from the first second.
 *
 * The end-to-end runs (`QUICKLAUNCH_E2E`) keep the plain first start every spec was written
 * against, unless a spec opts in with `QUICKLAUNCH_FIRST_RUN=1`. That keeps one feature from
 * moving the starting point of every other test.
 */
export function firstRunExperienceEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.QUICKLAUNCH_E2E !== '1' || env.QUICKLAUNCH_FIRST_RUN === '1'
}

/**
 * A new installation starts light, in graphite, with its items in a list (shared/default-data.ts).
 * The end-to-end runs keep the look every spec was written against (dark, violet, a grid), for the
 * same reason and with the same opt-in as above: `QUICKLAUNCH_FIRST_RUN=1` gives a spec the real
 * start. What is returned replaces those three settings of the starter data.
 */
export function starterLookOverride(
  env: NodeJS.ProcessEnv = process.env
): Partial<Pick<Prefs, 'theme' | 'background' | 'viewMode'>> {
  return firstRunExperienceEnabled(env)
    ? {}
    : { theme: 'dark', background: 'aurora', viewMode: 'grid' }
}
